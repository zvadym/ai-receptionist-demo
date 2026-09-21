import { timingSafeEqual } from 'node:crypto';
import { handle, json } from '@/lib/http';
import { reconcileCalendarOperations } from '@/lib/calendar-sync';
import { reconcileVoiceSessions } from '@/lib/live-cleanup';
export const runtime = 'nodejs';
export const maxDuration = 180;
export async function GET(request: Request) {
  const expected = `Bearer ${process.env.CRON_SECRET || ''}`;
  const supplied = request.headers.get('authorization') || '';
  if (!process.env.CRON_SECRET || Buffer.byteLength(expected) !== Buffer.byteLength(supplied)
      || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return json({ error: 'unauthorized' }, 401);
  return handle(async () => json({ voice: await reconcileVoiceSessions(), calendar: await reconcileCalendarOperations() }));
}
