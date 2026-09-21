import { GoogleAuth } from 'google-auth-library';
import { z } from 'zod';
import { doctors, timezone } from './clinic';
import { AppError } from './errors';
import type { BusyInterval, CalendarStatus } from './calendar-overview';

const calendarVariables: Record<string, string> = {
  'anna-weber': 'GOOGLE_CALENDAR_ANNA_WEBER',
  'max-hoffmann': 'GOOGLE_CALENDAR_MAX_HOFFMANN',
  'lara-fischer': 'GOOGLE_CALENDAR_LARA_FISCHER',
};
export type CalendarMapping = { doctorId: string; calendarId: string | undefined };
type Availability = { doctorId: string; status: CalendarStatus; busy: BusyInterval[] };
const intervalSchema = z.object({
  start: z.iso.datetime({ offset: true }), end: z.iso.datetime({ offset: true }),
}).refine(b => Date.parse(b.start) < Date.parse(b.end));
const freeBusySchema = z.object({ calendars: z.record(z.string(), z.object({
  busy: z.array(intervalSchema).optional(),
  errors: z.array(z.object({ reason: z.string().optional() })).optional(),
})) });

export function parseFreeBusy(data: unknown, mappings: CalendarMapping[]): Availability[] {
  const parsed = freeBusySchema.safeParse(data);
  if (!parsed.success) throw new AppError('calendar_unavailable', 502);
  return mappings.map(({ doctorId, calendarId }) => {
    if (!calendarId) return { doctorId, status: 'unconfigured', busy: [] };
    const calendar = parsed.data.calendars[calendarId];
    if (!calendar || calendar.errors?.length || !calendar.busy) return { doctorId, status: 'unavailable', busy: [] };
    return { doctorId, status: 'ready', busy: calendar.busy.map(b => ({ ...b, source: 'google' })) };
  });
}

let auth: GoogleAuth | undefined;
export async function googleAvailability(timeMin: string, timeMax: string): Promise<Availability[]> {
  const mappings = doctors.map(d => ({ doctorId: d.id, calendarId: process.env[calendarVariables[d.id]] }));
  const configured = mappings.filter(m => m.calendarId);
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if ((!keyFile && !credentials) || !configured.length) throw new AppError('calendar_not_configured', 503);
  auth ??= new GoogleAuth({ ...(credentials ? { credentials: JSON.parse(credentials) } : { keyFile }), scopes: ['https://www.googleapis.com/auth/calendar.readonly'] });
  try {
    const client = await auth.getClient();
    const response = await client.request({
      url: 'https://www.googleapis.com/calendar/v3/freeBusy', method: 'POST', timeout: 15_000,
      data: { timeMin, timeMax, timeZone: timezone, items: configured.map(m => ({ id: m.calendarId })) },
    });
    return parseFreeBusy(response.data, mappings);
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Provider errors may include credential/request data. Never send or log them verbatim.
    throw new AppError('calendar_unavailable', 502);
  }
}
