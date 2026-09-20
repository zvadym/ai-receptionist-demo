import { z } from 'zod';
import { clinic } from './clinic';
import { db } from './db';
import { listSlots, listBookings, prepareChange, confirmChange, dismissProposal, clinicDates } from './booking';
import { AppError } from './errors';

const definitions = [
  { name: 'get_clinic_info', description: 'Get fictional clinic services, prices, business hours and bookable dates.', schema: z.object({}), run: () => ({ ...clinic, bookable_dates: clinicDates() }) },
  { name: 'find_available_slots', description: 'Find available appointments for a service and a Vienna local YYYY-MM-DD date. Always check before offering times.', schema: z.object({ service_id: z.string(), date: z.string() }), run: (a: Record<string,string>) => listSlots(a.service_id, a.date) },
  { name: 'list_my_bookings', description: 'Get ONLY this authenticated visitor’s appointments.', schema: z.object({}), run: (_: Record<string,string>, userId: string) => listBookings(userId) },
  { name: 'prepare_booking', description: 'Prepare a booking preview. Does NOT book. Ask the user to confirm the exact service, date and time before confirming this proposal.', schema: z.object({ service_id: z.string(), start: z.string() }), run: (a: Record<string,string>, userId: string) => prepareChange(userId, { action: 'create', service_id: a.service_id, start: a.start }) },
  { name: 'prepare_reschedule', description: 'Prepare moving an owned appointment. Does NOT change it yet. Read back new date and time and ask for confirmation.', schema: z.object({ booking_id: z.string(), start: z.string() }), run: (a: Record<string,string>, userId: string) => prepareChange(userId, { action: 'reschedule', booking_id: a.booking_id, start: a.start }) },
  { name: 'prepare_cancellation', description: 'Prepare cancelling an owned appointment. Ask for confirmation before committing.', schema: z.object({ booking_id: z.string() }), run: (a: Record<string,string>, userId: string) => prepareChange(userId, { action: 'cancel', booking_id: a.booking_id }) },
  { name: 'confirm_booking_change', description: 'Commit the latest prepared proposal ONLY after the user explicitly confirms the exact proposed change in a subsequent reply. Never call in the same response as prepare. Return success only after this tool succeeds.', schema: z.object({ proposal_id: z.string() }), run: (a: Record<string,string>, userId: string) => confirmChange(userId, a.proposal_id) },
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
