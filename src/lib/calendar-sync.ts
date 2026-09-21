import { query, transaction } from './db';
import { AppError } from './errors';
import { services, doctors, timezone } from './clinic';
import type { Booking } from './booking';
import { eventPath, googleCalendarApi, googleBusy, readGoogleEvent, type GoogleEvent } from './google-calendar';

export type CalendarOperation = {
  action: 'create'|'reschedule'|'cancel'|'export'; booking: Booking;
  calendarId: string; eventId: string; expectedEtag?: string;
};
export async function saveCalendarOperation(id: string, operation: CalendarOperation) {
  await query(`INSERT INTO calendar_operations(id,booking_id,user_id,payload,state,created,updated)
    VALUES ($1,$2,$3,$4,'pending',$5,$5)`, [id, operation.booking.id, operation.booking.user_id, JSON.stringify(operation), Date.now()]);
}
export async function assertNoPendingCalendarChange(userId: string) {
  const pending = (await query("SELECT id FROM calendar_operations WHERE user_id=$1 AND state='pending' LIMIT 1", [userId])).rows[0];
  if (pending) throw new AppError('calendar_sync_pending', 409);
}
export async function pendingCalendarSlots(doctorId: string, excludeBookingId = '') {
  const rows = (await query("SELECT payload FROM calendar_operations WHERE state='pending' AND booking_id!=$1", [excludeBookingId])).rows;
  return rows.map(r => (JSON.parse(r.payload) as CalendarOperation).booking).filter(b => b.doctor_id === doctorId);
}
export function eventBody(operation: CalendarOperation, operationId: string) {
  const b = operation.booking;
  const service = services.find(s => s.id === b.service_id)!;
  const doctor = doctors.find(d => d.id === b.doctor_id)!;
  return {
    summary: `${service.name.en} — ${b.patient_name}`,
    description: [`Patient: ${b.patient_name}`, `Email: ${b.patient_email}`, ...(b.patient_phone ? [`Phone: ${b.patient_phone}`] : []),
      `Doctor: ${doctor.name}`, `Service: ${service.name.en}`, `Summary: ${b.summary}`, `Booking reference: ${b.id}`].join('\n'),
    start: { dateTime: b.start, timeZone: timezone }, end: { dateTime: b.end, timeZone: timezone },
    visibility: 'private', transparency: 'opaque',
    extendedProperties: { private: { bookingId: b.id, operationId } },
  };
}
async function applyRemote(operation: CalendarOperation, id: string): Promise<GoogleEvent | null> {
  const { calendarId, eventId, booking, action } = operation;
  const existing = await readGoogleEvent(calendarId, eventId);
  if (action === 'cancel' && (!existing || existing.status === 'cancelled')) return null;
  const body = eventBody(operation, id);
  if (existing?.extendedProperties?.private?.operationId === id && action !== 'cancel') {
    // A retry after a lost response may finalize only the exact intended event.
    if (existing.status !== 'cancelled' && existing.summary === body.summary && existing.description === body.description
        && Date.parse(existing.start?.dateTime || '') === Date.parse(booking.start)
        && Date.parse(existing.end?.dateTime || '') === Date.parse(booking.end)) return existing;
    throw new AppError('calendar_conflict', 409);
  }
  if (existing && (existing.extendedProperties?.private?.bookingId !== booking.id || !operation.expectedEtag || existing.etag !== operation.expectedEtag))
    throw new AppError('calendar_conflict', 409);
  if (!existing && (action === 'reschedule' && booking.google_event_id)) throw new AppError('calendar_conflict', 409);
  if (action === 'cancel') {
    await googleCalendarApi.request('DELETE', eventPath(calendarId, eventId), undefined, { sendUpdates: 'none' }, operation.expectedEtag);
    return null;
  }
  // Recheck immediately before writing; exclude only our exact event, never a merged busy interval.
  if ((await googleBusy(calendarId, booking.start, booking.end, eventId)).some(b => b.start < booking.end && b.end > booking.start))
    throw new AppError('slot_unavailable', 409);
  return existing
    ? googleCalendarApi.request<GoogleEvent>('PATCH', eventPath(calendarId, eventId), body, { sendUpdates: 'none' }, operation.expectedEtag)
    : googleCalendarApi.request<GoogleEvent>('POST', eventPath(calendarId), { ...body, id: eventId }, { sendUpdates: 'none' });
}
export async function persistBooking(booking: Booking) {
  await query(`INSERT INTO bookings(id,user_id,doctor_id,service_id,start,"end",status,created,patient_name,patient_email,patient_phone,summary,google_calendar_id,google_event_id,google_etag,google_event_link)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    ON CONFLICT(id) DO UPDATE SET start=EXCLUDED.start,"end"=EXCLUDED."end",status=EXCLUDED.status,
    patient_name=EXCLUDED.patient_name,patient_email=EXCLUDED.patient_email,patient_phone=EXCLUDED.patient_phone,summary=EXCLUDED.summary,
    google_calendar_id=EXCLUDED.google_calendar_id,google_event_id=EXCLUDED.google_event_id,google_etag=EXCLUDED.google_etag,google_event_link=EXCLUDED.google_event_link`,
    [booking.id,booking.user_id,booking.doctor_id,booking.service_id,booking.start,booking.end,booking.status,booking.created,
      booking.patient_name,booking.patient_email,booking.patient_phone,booking.summary,booking.google_calendar_id,booking.google_event_id,booking.google_etag,booking.google_event_link]);
}
export async function runCalendarOperation(id: string): Promise<Booking> {
  try {
    return await transaction(async () => {
      const row = (await query('SELECT * FROM calendar_operations WHERE id=$1', [id])).rows[0];
      if (!row) throw new AppError('proposal_not_found', 404);
      if (row.state === 'failed') throw new AppError(row.error || 'calendar_conflict', 409);
      if (row.state === 'completed') return (await query('SELECT * FROM bookings WHERE id=$1', [row.booking_id])).rows[0] as Booking;
      const operation = JSON.parse(row.payload) as CalendarOperation;
      const event = await applyRemote(operation, id);
      const booking: Booking = { ...operation.booking, google_calendar_id: operation.calendarId,
        google_event_id: operation.eventId, google_etag: event?.etag || null, google_event_link: event?.htmlLink || operation.booking.google_event_link || null };
      await persistBooking(booking);
      await query('UPDATE proposals SET result=$1 WHERE id=$2', [JSON.stringify(booking), id]);
      await query("UPDATE calendar_operations SET state='completed',error=NULL,updated=$1 WHERE id=$2", [Date.now(),id]);
      return booking;
    });
  } catch (error) {
    const code = error instanceof AppError ? error.code : 'calendar_unavailable';
    const definite = ['calendar_conflict','calendar_access_denied','slot_unavailable','calendar_event_missing'].includes(code);
    // Intent survives network errors and process death; only definite rejection releases the reserved slot.
    await transaction(async () => {
      await query("UPDATE calendar_operations SET state=$1,error=$2,updated=$3 WHERE id=$4 AND state='pending'", [definite ? 'failed' : 'pending',code,Date.now(),id]);
      if (definite) await query('UPDATE proposals SET expires=0 WHERE id=$1 AND result IS NULL', [id]);
    });
    throw new AppError(definite ? code : 'calendar_sync_pending', definite ? 409 : 503);
  }
}
export async function reconcileCalendarOperations() {
  const rows = (await query("SELECT id FROM calendar_operations WHERE state='pending' AND updated<$1 ORDER BY created LIMIT 3", [Date.now()-30000])).rows;
  let completed = 0;
  for (const row of rows) { try { await runCalendarOperation(row.id); completed++; } catch { /* Retained state records sanitized failure. */ } }
  return { checked: rows.length, completed };
}
