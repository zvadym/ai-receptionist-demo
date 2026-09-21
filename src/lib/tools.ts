import { z } from 'zod';
import { clinic, doctors } from './clinic';
import { db } from './db';
import { listSlots, listBookings, prepareChange, confirmChange, dismissProposal, clinicDates, getService, getDoctor, eligibleDoctor, type Booking, type Proposal } from './booking';
import { AppError } from './errors';

function appointmentDetails(appointment: Booking | Proposal) {
  return { ...appointment, doctor: getDoctor(appointment.doctor_id), service: getService(appointment.service_id), currency: clinic.currency, timezone: clinic.timezone };
}
const definitions = [
  { name: 'get_clinic_info', description: 'Get fictional clinic services, prices, business hours and bookable dates.', schema: z.object({}), run: () => ({ ...clinic, bookable_dates: clinicDates() }) },
  { name: 'get_doctors', description: 'Get the actual fictional doctor roster, specialties and supported service IDs. Call before recommending or naming a doctor. Do not infer additional doctors or qualifications.', schema: z.object({}), run: () => ({ doctors }) },
  { name: 'find_available_slots', description: 'Get checked slots, doctor and service details for a doctor_id from get_doctors, service_id from get_clinic_info and Vienna local YYYY-MM-DD date. Search after the visitor supplies doctor/time preferences or explicitly says they have none; ask for preferences first if not yet discussed. Honor supplied preferences. With no preference start at earliest bookable_dates, skipping empty days. Offer only returned slots for this doctor.', schema: z.object({ doctor_id: z.string(), service_id: z.string(), date: z.string() }), run: (a: Record<string,string>) => ({ doctor: eligibleDoctor(a.doctor_id, a.service_id), service: getService(a.service_id), timezone: clinic.timezone, currency: clinic.currency, date: a.date, slots: listSlots(a.service_id, a.date, '', a.doctor_id) }) },
  { name: 'list_my_bookings', description: 'Get ONLY this authenticated visitor’s appointments, including their doctor and service details.', schema: z.object({}), run: (_: Record<string,string>, userId: string) => listBookings(userId).map(appointmentDetails) },
  { name: 'prepare_booking', description: 'Prepare a preview for the selected doctor and an exact returned slot. Does NOT book. Ask for confirmation of doctor, service, date and time before confirming this proposal.', schema: z.object({ doctor_id: z.string(), service_id: z.string(), start: z.string() }), run: (a: Record<string,string>, userId: string) => { return appointmentDetails(prepareChange(userId, { action: 'create', doctor_id: a.doctor_id, service_id: a.service_id, start: a.start })); } },
  { name: 'prepare_reschedule', description: 'Prepare moving an owned appointment with the same doctor and service. Does NOT change it yet. Read back doctor, new date and time and ask for confirmation.', schema: z.object({ booking_id: z.string(), start: z.string() }), run: (a: Record<string,string>, userId: string) => appointmentDetails(prepareChange(userId, { action: 'reschedule', booking_id: a.booking_id, start: a.start })) },
  { name: 'prepare_cancellation', description: 'Prepare cancelling an owned appointment. Ask for confirmation before committing.', schema: z.object({ booking_id: z.string() }), run: (a: Record<string,string>, userId: string) => appointmentDetails(prepareChange(userId, { action: 'cancel', booking_id: a.booking_id })) },
  { name: 'confirm_booking_change', description: 'Commit the latest prepared proposal ONLY after the user explicitly confirms the exact proposed change in a subsequent reply. Never call in the same response as prepare. Return success only after this tool succeeds.', schema: z.object({ proposal_id: z.string() }), run: (a: Record<string,string>, userId: string) => appointmentDetails(confirmChange(userId, a.proposal_id)) },
  { name: 'dismiss_booking_change', description: 'Discard a proposal when the user rejects it or changes their mind.', schema: z.object({ proposal_id: z.string() }), run: (a: Record<string,string>, userId: string) => { dismissProposal(userId, a.proposal_id); return { dismissed: true }; } },
];
export const toolDefinitions = definitions.map(d => {
  const { $schema, ...parameters } = z.toJSONSchema(d.schema);
  void $schema;
  return { type: 'function', name: d.name, description: d.description, strict: true, parameters };
});

export function executeTool(userId: string, sessionId: string, callId: string, name: string, args: string): string {
  return db().transaction(() => {
    const cached = db().prepare('SELECT result FROM tool_results WHERE session_id=? AND call_id=?').get(sessionId, callId) as { result: string } | undefined;
    if (cached) return cached.result;
    let result: string;
    try {
      const tool = definitions.find(d => d.name === name);
      if (!tool) throw new AppError('unknown_tool');
      const input = tool.schema.parse(JSON.parse(args));
      result = JSON.stringify({ ok: true, result: tool.run(input as Record<string,string>, userId) });
    } catch (error) {
      result = JSON.stringify({ ok: false, error: error instanceof AppError ? error.code : 'invalid_tool_arguments' });
    }
    db().prepare('INSERT INTO tool_results(session_id,call_id,result) VALUES (?,?,?)').run(sessionId, callId, result);
    return result;
  }).immediate();
}
