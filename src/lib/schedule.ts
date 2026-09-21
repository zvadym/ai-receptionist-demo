import { DateTime } from 'luxon';
import { timezone } from './clinic';

// Demo schedule, shared by the booking engine and the calendar overview.
export const schedule = {
  weekdays: [1, 2, 3, 4, 5],
  opens: 9 * 60,
  closes: 17 * 60,
  breakStart: 12 * 60,
  breakEnd: 13 * 60,
  slotStep: 30,
  leadMinutes: 30,
};

export function workingPeriods(date: string) {
  const day = DateTime.fromISO(date, { zone: timezone });
  if (!schedule.weekdays.includes(day.weekday)) return [];
  return [
    { start: schedule.opens, end: schedule.breakStart },
    { start: schedule.breakEnd, end: schedule.closes },
  ];
}
