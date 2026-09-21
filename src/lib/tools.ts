import { z } from 'zod';
import { clinic, doctors } from './clinic';
import { query, transaction } from './db';
import { listSlots, listBookings, prepareChange, confirmChange, dismissProposal, clinicDates, getService, getDoctor, eligibleDoctor, type Booking, type Proposal } from './booking';
import { AppError } from './errors';
function appointmentDetails(appointment: Booking | Proposal) {
    return { ...appointment, doctor: getDoctor(appointment.doctor_id), service: getService(appointment.service_id), currency: clinic.currency, timezone: clinic.timezone };
}
const definitions = [
    { name: 'get_clinic_info', description: 'Get fictional clinic services, prices, business hours and bookable dates.', schema: z.object({}), run: () => ({ ...clinic, bookable_dates: clinicDates() }) },
    { name: 'get_doctors', description: 'Get the actual fictional doctor roster, specialties and supported service IDs. Call before recommending or naming a doctor. Do not infer additional doctors or qualifications.', schema: z.object({}), run: () => ({ doctors }) },
    { name: 'find_available_slots', description: 'Get checked slots, doctor and service details for a doctor_id from get_doctors, service_id from get_clinic_info and Vienna local YYYY-MM-DD date. Search after the visitor supplies doctor/time preferences or explicitly says they have none; ask for preferences first if not yet discussed. Honor supplied preferences. With no preference start at earliest bookable_dates, skipping empty days. Offer only returned slots for this doctor.', schema: z.object({ doctor_id: z.string(), service_id: z.string(), date: z.string() }), run: async (a: Record<string, string>) => ({ doctor: eligibleDoctor(a.doctor_id, a.service_id), service: getService(a.service_id), timezone: clinic.timezone, currency: clinic.currency, date: a.date, slots: (await listSlots(a.service_id, a.date, '', a.doctor_id)) }) },
    { name: 'list_my_bookings', description: 'Get ONLY this authenticated visitor’s appointments, including their doctor and service details.', schema: z.object({}), run: async (_: Record<string, string>, userId: string) => (await listBookings(userId)).map(appointmentDetails) },
    { name: 'prepare_booking', description: 'Prepare a preview for the selected doctor and an exact returned slot. Does NOT book. Supply a concise summary only of information actually provided, or null to use the service name. Patient name/email default to the verified visitor when null; phone is optional. Read back patient, summary, doctor, service, date/time and ask for confirmation.', schema: z.object({ doctor_id: z.string(), service_id: z.string(), start: z.string(), patient_name: z.string().nullable(), patient_email: z.string().nullable(), patient_phone: z.string().nullable(), summary: z.string().nullable() }), run: async (a: Record<string, string>, userId: string) => { return appointmentDetails((await prepareChange(userId, { action: 'create', doctor_id: a.doctor_id, service_id: a.service_id, start: a.start, patient_name: a.patient_name ?? undefined, patient_email: a.patient_email ?? undefined, patient_phone: a.patient_phone ?? undefined, summary: a.summary ?? undefined }))); } },
    { name: 'prepare_reschedule', description: 'Prepare moving an owned appointment with the same doctor and service. Does NOT change it yet. Read back doctor, new date and time and ask for confirmation.', schema: z.object({ booking_id: z.string(), start: z.string() }), run: async (a: Record<string, string>, userId: string) => appointmentDetails((await prepareChange(userId, { action: 'reschedule', booking_id: a.booking_id, start: a.start }))) },
    { name: 'prepare_cancellation', description: 'Prepare cancelling an owned appointment. Ask for confirmation before committing.', schema: z.object({ booking_id: z.string() }), run: async (a: Record<string, string>, userId: string) => appointmentDetails((await prepareChange(userId, { action: 'cancel', booking_id: a.booking_id }))) },
    { name: 'confirm_booking_change', description: 'Commit the latest prepared proposal ONLY after the user explicitly confirms the exact proposed change in a subsequent reply. Never call in the same response as prepare. Return success only after this tool succeeds.', schema: z.object({ proposal_id: z.string() }), run: async (a: Record<string, string>, userId: string) => appointmentDetails((await confirmChange(userId, a.proposal_id))) },
    { name: 'dismiss_booking_change', description: 'Discard a proposal when the user rejects it or changes their mind.', schema: z.object({ proposal_id: z.string() }), run: async (a: Record<string, string>, userId: string) => { (await dismissProposal(userId, a.proposal_id)); return { dismissed: true }; } },
];
export const toolDefinitions = definitions.map(d => {
    const { $schema, ...parameters } = z.toJSONSchema(d.schema);
    void $schema;
    return { type: 'function', name: d.name, description: d.description, strict: true, parameters };
});
export async function executeTool(userId: string, sessionId: string, callId: string, name: string, args: string): Promise<string> {
    const work = async () => {
        const cached = (await query("SELECT result FROM tool_results WHERE session_id=$1 AND call_id=$2", [sessionId, callId])).rows[0] as {
            result: string;
        } | undefined;
        if (cached)
            return cached.result;
        let result: string;
        try {
            const tool = definitions.find(d => d.name === name);
            if (!tool)
                throw new AppError('unknown_tool');
            const input = tool.schema.parse(JSON.parse(args));
            result = JSON.stringify({ ok: true, result: await tool.run(input as Record<string, string>, userId) });
        }
        catch (error) {
            result = JSON.stringify({ ok: false, error: error instanceof AppError ? error.code : 'invalid_tool_arguments' });
        }
        (await query("INSERT INTO tool_results(session_id,call_id,result) VALUES ($1,$2,$3) ON CONFLICT(session_id,call_id) DO NOTHING", [sessionId, callId, result]));
        return result;
    };
    // A confirmed change must commit its durable intent before writing to Google.
    return name === 'confirm_booking_change' ? work() : transaction(work);
}
