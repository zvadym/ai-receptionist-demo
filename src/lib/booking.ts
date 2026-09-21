import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { services, doctors, doctorForService, timezone } from './clinic';
import { query, transaction } from './db';
import { AppError } from './errors';
import { schedule, workingPeriods } from './schedule';
export type Booking = {
    id: string;
    user_id: string;
    doctor_id: string;
    service_id: string;
    start: string;
    end: string;
    status: 'confirmed' | 'cancelled';
    created: number;
};
export type Slot = {
    start: string;
    end: string;
};
export const changeSchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('create'), doctor_id: z.string(), service_id: z.string(), start: z.string().max(40) }),
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
    (await transaction(async () => {
        (await query("UPDATE proposals SET expires=0 WHERE user_id=$1 AND result IS NULL", [userId]));
        (await query("INSERT INTO proposals(id,user_id,payload,expires) VALUES ($1,$2,$3,$4)", [proposal.id, userId, JSON.stringify(proposal), proposal.expires]));
    }));
    return proposal;
}
export async function pendingProposal(userId: string): Promise<Proposal | null> {
    const row = (await query("SELECT payload FROM proposals WHERE user_id=$1 AND result IS NULL AND expires>$2 ORDER BY expires DESC LIMIT 1", [userId, Date.now()])).rows[0] as {
        payload: string;
    } | undefined;
    return row ? JSON.parse(row.payload) : null;
}
export async function dismissProposal(userId: string, id: string) {
    (await query("UPDATE proposals SET expires=0 WHERE id=$1 AND user_id=$2 AND result IS NULL", [id, userId]));
}
export async function confirmChange(userId: string, id: string): Promise<Booking> {
    return (await transaction(async () => {
        const row = (await query("SELECT * FROM proposals WHERE id=$1 AND user_id=$2", [id, userId])).rows[0] as {
            payload: string;
            expires: number;
            result: string | null;
        } | undefined;
        if (!row)
            throw new AppError('proposal_not_found', 404);
        if (row.result)
            return JSON.parse(row.result) as Booking;
        if (row.expires <= Date.now())
            throw new AppError('proposal_expired', 409);
        const proposal = JSON.parse(row.payload) as Proposal;
        const { change } = proposal;
        let booking: Booking;
        if (change.action === 'create') {
            const slot = (await available(change.service_id, change.doctor_id, change.start));
            booking = { id: randomUUID(), user_id: userId, doctor_id: change.doctor_id, service_id: change.service_id, ...slot, status: 'confirmed', created: Date.now() };
            (await query("INSERT INTO bookings(id,user_id,doctor_id,service_id,start,\"end\",status,created) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [booking.id, booking.user_id, booking.doctor_id, booking.service_id, booking.start, booking.end, booking.status, booking.created]));
        }
        else {
            booking = (await ownedBooking(userId, change.booking_id));
            if (booking.status !== 'confirmed')
                throw new AppError('booking_cancelled', 409);
            if (Date.parse(booking.start) <= Date.now())
                throw new AppError('booking_in_past', 409);
            // A preview of an old appointment must never modify a subsequently changed appointment.
            if (booking.start !== proposal.booking?.start)
                throw new AppError('proposal_expired', 409);
            if (change.action === 'cancel')
                booking.status = 'cancelled';
            else
                Object.assign(booking, (await available(booking.service_id, booking.doctor_id, change.start, booking.id)));
            (await query("UPDATE bookings SET start=$1,\"end\"=$2,status=$3 WHERE id=$4", [booking.start, booking.end, booking.status, booking.id]));
        }
        (await query("UPDATE proposals SET result=$1 WHERE id=$2", [JSON.stringify(booking), id]));
        return booking;
    }));
}
