import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { services, timezone } from './clinic';
import { db } from './db';
import { AppError } from './errors';

export type Booking = { id: string; user_id: string; service_id: string; start: string; end: string; status: 'confirmed' | 'cancelled'; created: number };
export type Slot = { start: string; end: string };
export const changeSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), service_id: z.string(), start: z.string().max(40) }),
  z.object({ action: z.literal('reschedule'), booking_id: z.string(), start: z.string().max(40) }),
  z.object({ action: z.literal('cancel'), booking_id: z.string() }),
]);
export type Change = z.infer<typeof changeSchema>;
export type Proposal = { id: string; change: Change; booking?: Booking; service_id: string; start: string; end: string; expires: number };

export function clinicDates() {
  const today = DateTime.now().setZone(timezone).startOf('day');
  return Array.from({ length: 21 }, (_, i) => today.plus({ days: i }))
    .filter(d => d.weekday <= 5).map(d => d.toISODate()!);
}
export function getService(id: string) {
  const service = services.find(s => s.id === id);
  if (!service) throw new AppError('invalid_service');
  return service;
}
export function listBookings(userId: string) {
  return db().prepare('SELECT * FROM bookings WHERE user_id=? ORDER BY start').all(userId) as Booking[];
}
function ownedBooking(userId: string, id: string) {
  const row = db().prepare('SELECT * FROM bookings WHERE id=? AND user_id=?').get(id, userId) as Booking | undefined;
  if (!row) throw new AppError('booking_not_found', 404);
  return row;
}
export function listSlots(serviceId: string, date: string, excludeId = ''): Slot[] {
  const service = getService(serviceId);
  if (!clinicDates().includes(date)) throw new AppError('invalid_date');
  const day = DateTime.fromISO(date, { zone: timezone }).startOf('day');
  const busy = db().prepare("SELECT start,end FROM bookings WHERE status='confirmed' AND id!=? AND start<? AND end>?")
    .all(excludeId, day.plus({ days: 1 }).toUTC().toISO(), day.toUTC().toISO()) as Slot[];
  const result: Slot[] = [];
  for (let minute = 9 * 60; minute + service.minutes <= 17 * 60; minute += 30) {
    if (minute < 13 * 60 && minute + service.minutes > 12 * 60) continue;
    const start = day.plus({ minutes: minute });
    const end = start.plus({ minutes: service.minutes });
    if (start.toMillis() < DateTime.now().toMillis() + 30 * 60_000) continue;
    const slot = { start: start.toUTC().toISO()!, end: end.toUTC().toISO()! };
    if (!busy.some(b => b.start < slot.end && b.end > slot.start)) result.push(slot);
  }
  return result;
}
function available(serviceId: string, start: string, excludeId = '') {
  const time = DateTime.fromISO(start, { setZone: true });
  if (!time.isValid || !/(Z|[+-]\d{2}:\d{2})$/.test(start)) throw new AppError('invalid_date');
  const slot = listSlots(serviceId, time.setZone(timezone).toISODate()!, excludeId).find(s => s.start === time.toUTC().toISO());
  if (!slot) throw new AppError('slot_unavailable', 409);
  return slot;
}
export function prepareChange(userId: string, input: Change): Proposal {
  const change = changeSchema.parse(input);
  let booking: Booking | undefined;
  if (change.action !== 'create') {
    booking = ownedBooking(userId, change.booking_id);
    if (booking.status !== 'confirmed') throw new AppError('booking_cancelled', 409);
    if (Date.parse(booking.start) <= Date.now()) throw new AppError('booking_in_past', 409);
  }
  const serviceId = change.action === 'create' ? change.service_id : booking!.service_id;
  const slot = change.action === 'cancel' ? booking! : available(serviceId, change.start, booking?.id);
  const proposal: Proposal = { id: randomUUID(), change, booking, service_id: serviceId, start: slot.start, end: slot.end, expires: Date.now() + 5 * 60_000 };
  db().transaction(() => {
    db().prepare('UPDATE proposals SET expires=0 WHERE user_id=? AND result IS NULL').run(userId);
    db().prepare('INSERT INTO proposals(id,user_id,payload,expires) VALUES (?,?,?,?)').run(proposal.id, userId, JSON.stringify(proposal), proposal.expires);
  })();
  return proposal;
}
export function pendingProposal(userId: string): Proposal | null {
  const row = db().prepare('SELECT payload FROM proposals WHERE user_id=? AND result IS NULL AND expires>? ORDER BY expires DESC LIMIT 1').get(userId, Date.now()) as { payload: string } | undefined;
  return row ? JSON.parse(row.payload) : null;
}
export function dismissProposal(userId: string, id: string) {
  db().prepare('UPDATE proposals SET expires=0 WHERE id=? AND user_id=? AND result IS NULL').run(id, userId);
}
export function confirmChange(userId: string, id: string): Booking {
  return db().transaction(() => {
    const row = db().prepare('SELECT * FROM proposals WHERE id=? AND user_id=?').get(id, userId) as { payload: string; expires: number; result: string | null } | undefined;
    if (!row) throw new AppError('proposal_not_found', 404);
    if (row.result) return JSON.parse(row.result) as Booking;
    if (row.expires <= Date.now()) throw new AppError('proposal_expired', 409);
    const proposal = JSON.parse(row.payload) as Proposal;
    const { change } = proposal;
    let booking: Booking;
    if (change.action === 'create') {
      const slot = available(change.service_id, change.start);
      booking = { id: randomUUID(), user_id: userId, service_id: change.service_id, ...slot, status: 'confirmed', created: Date.now() };
      db().prepare('INSERT INTO bookings(id,user_id,service_id,start,end,status,created) VALUES (@id,@user_id,@service_id,@start,@end,@status,@created)').run(booking);
    } else {
      booking = ownedBooking(userId, change.booking_id);
      if (booking.status !== 'confirmed') throw new AppError('booking_cancelled', 409);
      if (Date.parse(booking.start) <= Date.now()) throw new AppError('booking_in_past', 409);
      // A preview of an old appointment must never modify a subsequently changed appointment.
      if (booking.start !== proposal.booking?.start) throw new AppError('proposal_expired', 409);
      if (change.action === 'cancel') booking.status = 'cancelled';
      else Object.assign(booking, available(booking.service_id, change.start, booking.id));
      db().prepare('UPDATE bookings SET start=@start,end=@end,status=@status WHERE id=@id').run(booking);
    }
    db().prepare('UPDATE proposals SET result=? WHERE id=?').run(JSON.stringify(booking), id);
    return booking;
  }).immediate();
}
