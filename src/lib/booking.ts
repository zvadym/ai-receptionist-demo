import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { services, doctors, doctorForService, timezone } from './clinic';
import { query, transaction } from './db';
import { AppError } from './errors';
import { schedule, workingPeriods } from './schedule';
import { calendarForDoctor, googleBusy, googleEventId, readGoogleEvent } from './google-calendar';
import { assertNoPendingCalendarChange, pendingCalendarSlots, persistBooking, saveCalendarOperation, runCalendarOperation } from './calendar-sync';
export type Booking = {
    id: string;
    user_id: string;
    doctor_id: string;
    service_id: string;
    start: string;
    end: string;
    status: 'confirmed' | 'cancelled';
    created: number;
    patient_name?: string | null;
    patient_email?: string | null;
    patient_phone?: string | null;
    summary?: string | null;
    google_calendar_id?: string | null;
    google_event_id?: string | null;
    google_etag?: string | null;
    google_event_link?: string | null;
};
export type Slot = {
    start: string;
    end: string;
};
export const changeSchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('create'), doctor_id: z.string(), service_id: z.string(), start: z.string().max(40),
      patient_name: z.string().trim().min(2).max(80).optional(), patient_email: z.email().max(254).optional(),
      patient_phone: z.string().trim().max(40).optional(), summary: z.string().trim().max(600).optional() }),
    z.object({ action: z.literal('reschedule'), booking_id: z.string(), start: z.string().max(40) }),
    z.object({ action: z.literal('cancel'), booking_id: z.string() }),
]);
export type Change = z.infer<typeof changeSchema>;
export type Proposal = {
    id: string;
    change: Change;
    booking?: Booking;
    doctor_id: string;
    service_id: string;
    start: string;
    end: string;
    expires: number;
    google_etag?: string;
    patient?: { name: string; email: string; phone: string; summary: string };
};
export function clinicDates() {
    const today = DateTime.now().setZone(timezone).startOf('day');
    return Array.from({ length: 21 }, (_, i) => today.plus({ days: i }))
        .filter(d => schedule.weekdays.includes(d.weekday)).map(d => d.toISODate()!);
}
export function getService(id: string) {
    const service = services.find(s => s.id === id);
    if (!service)
        throw new AppError('invalid_service');
    return service;
}
export function getDoctor(id: string) {
    const doctor = doctors.find(d => d.id === id);
    if (!doctor)
        throw new AppError('invalid_doctor');
    return doctor;
}
export function eligibleDoctor(id: string, serviceId: string) {
    getService(serviceId);
    const doctor = getDoctor(id);
    if (!doctor.service_ids.includes(serviceId))
        throw new AppError('doctor_service_unavailable');
    return doctor;
}
export async function listBookings(userId: string) {
    return (await query("SELECT * FROM bookings WHERE user_id=$1 ORDER BY start", [userId])).rows as Booking[];
}
async function ownedBooking(userId: string, id: string) {
    const row = (await query("SELECT * FROM bookings WHERE id=$1 AND user_id=$2", [id, userId])).rows[0] as Booking | undefined;
    if (!row)
        throw new AppError('booking_not_found', 404);
    return row;
}
export async function listSlots(serviceId: string, date: string, excludeId = '', doctorId = doctorForService(serviceId).id): Promise<Slot[]> {
    const service = getService(serviceId);
    eligibleDoctor(doctorId, serviceId);
    if (!clinicDates().includes(date))
        throw new AppError('invalid_date');
    const day = DateTime.fromISO(date, { zone: timezone }).startOf('day');
    const busy = (await query("SELECT start,\"end\" FROM bookings WHERE status='confirmed' AND doctor_id=$1 AND id!=$2 AND start<$3 AND \"end\">$4", [doctorId, excludeId, day.plus({ days: 1 }).toUTC().toISO(), day.toUTC().toISO()])).rows as Slot[];
    const calendarId = calendarForDoctor(doctorId);
    if (calendarId) {
        const excluded = excludeId ? (await query('SELECT google_event_id,google_calendar_id FROM bookings WHERE id=$1', [excludeId])).rows[0] : null;
        busy.push(...await googleBusy(calendarId, day.toUTC().toISO()!, day.plus({ days: 1 }).toUTC().toISO()!,
            excluded?.google_calendar_id === calendarId ? excluded.google_event_id : ''));
    }
    busy.push(...await pendingCalendarSlots(doctorId, excludeId));
    const result: Slot[] = [];
    for (const period of workingPeriods(date)) {
        for (let minute = period.start; minute + service.minutes <= period.end; minute += schedule.slotStep) {
            const start = day.plus({ minutes: minute });
            const end = start.plus({ minutes: service.minutes });
            if (start.toMillis() < DateTime.now().toMillis() + schedule.leadMinutes * 60000)
                continue;
            const slot = { start: start.toUTC().toISO()!, end: end.toUTC().toISO()! };
            if (!busy.some(b => b.start < slot.end && b.end > slot.start))
                result.push(slot);
        }
    }
    return result;
}
async function available(serviceId: string, doctorId: string, start: string, excludeId = '') {
    const time = DateTime.fromISO(start, { setZone: true });
    if (!time.isValid || !/(Z|[+-]\d{2}:\d{2})$/.test(start))
        throw new AppError('invalid_date');
    const slot = (await listSlots(serviceId, time.setZone(timezone).toISODate()!, excludeId, doctorId)).find(s => s.start === time.toUTC().toISO());
    if (!slot)
        throw new AppError('slot_unavailable', 409);
    return slot;
}
export async function prepareChange(userId: string, input: Change): Promise<Proposal> {
    const change = changeSchema.parse(input);
    await assertNoPendingCalendarChange(userId);
    let booking: Booking | undefined;
    if (change.action !== 'create') {
        booking = (await ownedBooking(userId, change.booking_id));
        if (booking.status !== 'confirmed')
            throw new AppError('booking_cancelled', 409);
        if (Date.parse(booking.start) <= Date.now())
            throw new AppError('booking_in_past', 409);
    }
    const serviceId = change.action === 'create' ? change.service_id : booking!.service_id;
    const doctorId = change.action === 'create' ? change.doctor_id : booking!.doctor_id;
    const slot = change.action === 'cancel' ? booking! : (await available(serviceId, doctorId, change.start, booking?.id));
    const proposal: Proposal = { id: randomUUID(), change, booking, doctor_id: doctorId, service_id: serviceId, start: slot.start, end: slot.end, expires: Date.now() + 5 * 60000 };
    if (booking?.google_event_id && booking.google_calendar_id) {
        const event = await readGoogleEvent(booking.google_calendar_id, booking.google_event_id);
        if ((!event || event.status === 'cancelled') && change.action !== 'cancel') throw new AppError('calendar_conflict', 409);
        if (event && event.status !== 'cancelled') {
            if (booking.google_etag && event.etag !== booking.google_etag) throw new AppError('calendar_conflict', 409);
            if (Date.parse(event.start?.dateTime || '') !== Date.parse(booking.start) || Date.parse(event.end?.dateTime || '') !== Date.parse(booking.end)) throw new AppError('calendar_conflict', 409);
            proposal.google_etag = event.etag;
        }
    }
    const user = (await query('SELECT name,email FROM users WHERE id=$1', [userId])).rows[0];
    proposal.patient = {
        name: change.action === 'create' ? change.patient_name || user.name : booking!.patient_name || user.name,
        email: change.action === 'create' ? change.patient_email || user.email : booking!.patient_email || user.email,
        phone: change.action === 'create' ? change.patient_phone || '' : booking!.patient_phone || '',
        summary: change.action === 'create' ? change.summary || getService(serviceId).name.en : booking!.summary || getService(serviceId).name.en,
    };
    (await transaction(async () => {
        await assertNoPendingCalendarChange(userId);
        (await query("UPDATE proposals SET expires=0 WHERE user_id=$1 AND result IS NULL", [userId]));
        (await query("INSERT INTO proposals(id,user_id,payload,expires) VALUES ($1,$2,$3,$4)", [proposal.id, userId, JSON.stringify(proposal), proposal.expires]));
    }));
    return proposal;
}
export async function pendingProposal(userId: string): Promise<Proposal | null> {
    const row = (await query("SELECT payload FROM proposals WHERE user_id=$1 AND result IS NULL AND (expires>$2 OR id IN (SELECT id FROM calendar_operations WHERE state='pending')) ORDER BY expires DESC LIMIT 1", [userId, Date.now()])).rows[0] as {
        payload: string;
    } | undefined;
    return row ? JSON.parse(row.payload) : null;
}
export async function dismissProposal(userId: string, id: string) {
    await assertNoPendingCalendarChange(userId);
    (await query("UPDATE proposals SET expires=0 WHERE id=$1 AND user_id=$2 AND result IS NULL", [id, userId]));
}
export async function confirmChange(userId: string, id: string): Promise<Booking> {
    const prepared = await transaction(async (): Promise<Booking | null> => {
        const row = (await query('SELECT * FROM proposals WHERE id=$1 AND user_id=$2', [id,userId])).rows[0];
        if (!row) throw new AppError('proposal_not_found', 404);
        if (row.result) return JSON.parse(row.result) as Booking;
        const operation = (await query('SELECT state,error FROM calendar_operations WHERE id=$1', [id])).rows[0];
        if (operation?.state === 'pending') return null;
        if (operation?.state === 'failed') throw new AppError(operation.error || 'calendar_conflict', 409);
        if (row.expires <= Date.now()) throw new AppError('proposal_expired', 409);
        await assertNoPendingCalendarChange(userId);
        const proposal = JSON.parse(row.payload) as Proposal;
        const { change } = proposal;
        let booking: Booking;
        if (change.action === 'create') {
            const slot = await available(change.service_id, change.doctor_id, change.start);
            booking = { id: proposal.id, user_id: userId, doctor_id: change.doctor_id, service_id: change.service_id, ...slot, status: 'confirmed', created: Date.now() };
        } else {
            booking = await ownedBooking(userId, change.booking_id);
            if (booking.status !== 'confirmed') throw new AppError('booking_cancelled', 409);
            if (Date.parse(booking.start) <= Date.now()) throw new AppError('booking_in_past', 409);
            if (booking.start !== proposal.booking?.start) throw new AppError('proposal_expired', 409);
            if (change.action === 'cancel') booking.status = 'cancelled';
            else Object.assign(booking, await available(booking.service_id, booking.doctor_id, change.start, booking.id));
        }
        const user = (await query('SELECT name,email FROM users WHERE id=$1', [userId])).rows[0];
        booking.patient_name = proposal.patient?.name || booking.patient_name || user.name;
        booking.patient_email = proposal.patient?.email || booking.patient_email || user.email;
        booking.patient_phone = proposal.patient?.phone || booking.patient_phone || '';
        booking.summary = proposal.patient?.summary || booking.summary || getService(booking.service_id).name.en;
        const calendarId = booking.google_calendar_id || calendarForDoctor(booking.doctor_id);
        if (calendarId) {
            await saveCalendarOperation(id, { action: change.action, booking, calendarId,
                eventId: booking.google_event_id || googleEventId(booking.id), expectedEtag: proposal.google_etag });
            return null;
        }
        await persistBooking(booking);
        await query('UPDATE proposals SET result=$1 WHERE id=$2', [JSON.stringify(booking),id]);
        return booking;
    });
    return prepared || runCalendarOperation(id);
}

// Explicit deployment backfill of existing future reservations; never invent historical symptoms.
export async function exportBooking(id: string): Promise<Booking> {
    const operationId = `export-${id}`;
    await transaction(async () => {
        if ((await query('SELECT id FROM calendar_operations WHERE id=$1', [operationId])).rows[0]) return;
        const booking = (await query('SELECT * FROM bookings WHERE id=$1', [id])).rows[0] as Booking;
        if (!booking || booking.status !== 'confirmed' || Date.parse(booking.start) <= Date.now()) throw new AppError('booking_in_past', 409);
        if (booking.google_event_id) throw new AppError('calendar_conflict', 409);
        await assertNoPendingCalendarChange(booking.user_id);
        const calendarId = calendarForDoctor(booking.doctor_id);
        if (!calendarId) throw new AppError('calendar_not_configured', 503);
        const user = (await query('SELECT name,email FROM users WHERE id=$1', [booking.user_id])).rows[0];
        booking.patient_name ||= user.name; booking.patient_email ||= user.email; booking.patient_phone ||= '';
        booking.summary ||= getService(booking.service_id).name.en;
        await saveCalendarOperation(operationId, { action: 'export', booking, calendarId, eventId: googleEventId(booking.id) });
    });
    return runCalendarOperation(operationId);
}
