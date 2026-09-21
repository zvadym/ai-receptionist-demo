import { DateTime } from 'luxon';
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
  auth ??= new GoogleAuth({ ...(credentials ? { credentials: JSON.parse(credentials) } : { keyFile }), scopes: ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar.events'] });
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

export function calendarForDoctor(doctorId: string): string | undefined {
  const id = process.env[calendarVariables[doctorId]];
  const enabled = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (!id && !enabled && !process.env.VERCEL) return undefined; // Explicit credential-free local demo.
  if (!id || !enabled) throw new AppError('calendar_not_configured', 503);
  return id;
}
export type GoogleEvent = {
  id: string; etag?: string; htmlLink?: string; status?: string; transparency?: string;
  summary?: string; description?: string;
  start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
};
export const googleCalendarApi = {
  async request<T>(method: 'GET'|'POST'|'PATCH'|'DELETE', path: string, data?: unknown, params?: Record<string, string|number|boolean>, etag?: string): Promise<T> {
    const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    auth ??= new GoogleAuth({ ...(credentials ? { credentials: JSON.parse(credentials) } : { keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS }),
      scopes: ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar.events'] });
    try {
      const client = await auth.getClient();
      const result = await client.request<T>({ url: `https://www.googleapis.com/calendar/v3/${path}`, method, data, params,
        timeout: 10_000, retry: false, headers: etag ? { 'If-Match': etag } : undefined });
      return result.data;
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      if (status === 404 || status === 410) throw new AppError('calendar_event_missing', 409);
      if (status === 409 || status === 412) throw new AppError('calendar_conflict', 409);
      if (status === 401 || status === 403) throw new AppError('calendar_access_denied', 503);
      throw new AppError('calendar_unavailable', 502);
    }
  },
};
export const eventPath = (calendarId: string, eventId?: string) => `calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ''}`;
export const googleEventId = (bookingId: string) => `linden${bookingId.replace(/-/g, '')}`;
export async function readGoogleEvent(calendarId: string, eventId: string): Promise<GoogleEvent | null> {
  try { return await googleCalendarApi.request<GoogleEvent>('GET', eventPath(calendarId, eventId)); }
  catch (e) { if (e instanceof AppError && e.code === 'calendar_event_missing') return null; throw e; }
}
export async function googleBusy(calendarId: string, timeMin: string, timeMax: string, excludeEventId = ''): Promise<BusyInterval[]> {
  const busy: BusyInterval[] = [];
  let pageToken: string | undefined;
  do {
    const page: { items?: GoogleEvent[]; nextPageToken?: string } = await googleCalendarApi.request('GET', eventPath(calendarId), undefined,
      { timeMin, timeMax, singleEvents: true, showDeleted: false, maxResults: 2500, timeZone: timezone, ...(pageToken ? { pageToken } : {}) });
    if (!Array.isArray(page.items)) throw new AppError('calendar_unavailable', 502);
    for (const event of page.items) {
      if (event.id === excludeEventId || event.status === 'cancelled' || event.transparency === 'transparent') continue;
      const start = event.start?.dateTime || (event.start?.date && DateTime.fromISO(event.start.date, { zone: timezone }).toUTC().toISO());
      const end = event.end?.dateTime || (event.end?.date && DateTime.fromISO(event.end.date, { zone: timezone }).toUTC().toISO());
      if (!start || !end || !Number.isFinite(Date.parse(start)) || !(Date.parse(end) > Date.parse(start))) throw new AppError('calendar_unavailable', 502);
      busy.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString(), source: 'google' });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return busy;
}
