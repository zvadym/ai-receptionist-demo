import { z } from 'zod';
import { handle, json, requireUser } from '@/lib/http';
import { rateLimit } from '@/lib/auth';
import { db } from '@/lib/db';
import { timezone } from '@/lib/clinic';
import { googleAvailability } from '@/lib/google-calendar';
import { calendarRange, calendarSegments, displayStart, displayEnd, type CalendarOverviewData } from '@/lib/calendar-overview';

export const runtime = 'nodejs';
export const maxDuration = 30;
export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const query = new URL(request.url).searchParams;
    const { date, view } = z.object({ date: z.string(), view: z.enum(['day', 'week']) }).parse({ date: query.get('date'), view: query.get('view') });
    const range = calendarRange(date, view);
    rateLimit(`calendar:${user.id}`, 20, 60_000);
    const google = await googleAvailability(range.timeMin, range.timeMax);
    // Availability is shared; patient fields and booking IDs are deliberately excluded.
    const local = db().prepare("SELECT doctor_id,start,end FROM bookings WHERE status='confirmed' AND start<? AND end>?")
      .all(range.timeMax, range.timeMin) as { doctor_id: string; start: string; end: string }[];
    const data: CalendarOverviewData = {
      dates: range.dates, timezone, displayStart, displayEnd, updatedAt: new Date().toISOString(),
      calendars: google.map(calendar => ({ doctorId: calendar.doctorId, status: calendar.status,
        days: calendar.status === 'ready' ? range.dates.map(date => ({ date, segments: calendarSegments(date, [
          ...calendar.busy, ...local.filter(b => b.doctor_id === calendar.doctorId).map(b => ({ start: b.start, end: b.end, source: 'local' as const })),
        ]) })) : [],
      })),
    };
    return json(data);
  });
}
