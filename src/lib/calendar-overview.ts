import { DateTime } from 'luxon';
import { timezone } from './clinic';
import { schedule } from './schedule';
import { AppError } from './errors';

export type CalendarView = 'day' | 'week';
export type BusyInterval = { start: string; end: string; source: 'google' | 'local' };
export type CalendarStatus = 'ready' | 'unavailable' | 'unconfigured';
export type CalendarSegment = {
  start: number; end: number;
  kind: 'free' | 'busy' | 'break' | 'closed' | 'past';
  source?: 'google' | 'local' | 'both';
};
export type DoctorCalendar = {
  doctorId: string; status: CalendarStatus;
  days: { date: string; segments: CalendarSegment[] }[];
};
export type CalendarOverviewData = {
  dates: string[]; calendars: DoctorCalendar[]; updatedAt: string;
  timezone: string; displayStart: number; displayEnd: number;
};
export const displayStart = 8 * 60;
export const displayEnd = 18 * 60;

export function calendarRange(date: string, view: CalendarView) {
  const day = DateTime.fromISO(date, { zone: timezone }).startOf('day');
  const today = DateTime.now().setZone(timezone).startOf('day');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !day.isValid || Math.abs(day.diff(today, 'days').days) > 366) {
    throw new AppError('invalid_date');
  }
  const start = view === 'week' ? day.startOf('week') : day;
  const end = start.plus({ days: view === 'week' ? 7 : 1 });
  const dates = Array.from({ length: view === 'week' ? 5 : 1 }, (_, i) => start.plus({ days: i }).toISODate()!);
  return { dates, timeMin: start.toUTC().toISO()!, timeMax: end.toUTC().toISO()! };
}

// Partition each doctor's timeline so simultaneous calendars never hide each other.
export function calendarSegments(date: string, intervals: BusyInterval[], now = Date.now()): CalendarSegment[] {
  const day = DateTime.fromISO(date, { zone: timezone }).startOf('day');
  const startMs = day.set({ hour: displayStart / 60 }).toMillis();
  const endMs = day.set({ hour: displayEnd / 60 }).toMillis();
  const minuteOfDay = (ms: number) => {
    if (ms < startMs) return displayStart - 1;
    if (ms > endMs) return displayEnd + 1;
    const time = DateTime.fromMillis(ms, { zone: timezone });
    return time.hour * 60 + time.minute + time.second / 60;
  };
  const busy = intervals.filter(b => Date.parse(b.start) < endMs && Date.parse(b.end) > startMs)
    .map(b => ({ start: Math.max(displayStart, minuteOfDay(Date.parse(b.start))), end: Math.min(displayEnd, minuteOfDay(Date.parse(b.end))), source: b.source }));
  const currentMinute = minuteOfDay(now);
  const points = [...new Set([displayStart, displayEnd, schedule.opens, schedule.breakStart, schedule.breakEnd, schedule.closes,
    ...busy.flatMap(b => [b.start, b.end]), Math.max(displayStart, Math.min(displayEnd, currentMinute))])].sort((a, b) => a - b);
  const result: CalendarSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i], end = points[i + 1];
    const occupied = busy.filter(b => b.start < end && b.end > start);
    const segment: CalendarSegment = { start, end, kind: 'free' };
    if (occupied.length) {
      segment.kind = 'busy';
      const sources = new Set(occupied.map(b => b.source));
      segment.source = sources.size > 1 ? 'both' : occupied[0].source;
    } else if (!schedule.weekdays.includes(day.weekday) || start < schedule.opens || start >= schedule.closes) segment.kind = 'closed';
    else if (start >= schedule.breakStart && start < schedule.breakEnd) segment.kind = 'break';
    else if (start < currentMinute) segment.kind = 'past';
    const last = result.at(-1);
    if (last && last.kind === segment.kind && last.source === segment.source && last.end === segment.start) last.end = segment.end;
    else result.push(segment);
  }
  return result;
}
