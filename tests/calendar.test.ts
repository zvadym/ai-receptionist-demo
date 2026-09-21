import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime, Settings } from 'luxon';
import { calendarRange, calendarSegments, type BusyInterval } from '../src/lib/calendar-overview';
import { parseFreeBusy } from '../src/lib/google-calendar';
import { workingPeriods } from '../src/lib/schedule';

const date = '2030-04-01';
const before = Date.parse('2030-03-01T00:00:00Z');
const interval = (start: string, end: string, source: 'google' | 'local' = 'google'): BusyInterval => ({
  start: DateTime.fromISO(`${date}T${start}`, { zone: 'Europe/Vienna' }).toUTC().toISO()!,
  end: DateTime.fromISO(`${date}T${end}`, { zone: 'Europe/Vienna' }).toUTC().toISO()!, source,
});

test('overview partitions working hours and lunch using the booking schedule', () => {
  assert.deepEqual(workingPeriods(date), [{ start: 540, end: 720 }, { start: 780, end: 1020 }]);
  assert.deepEqual(calendarSegments(date, [], before), [
    { start: 480, end: 540, kind: 'closed' },
    { start: 540, end: 720, kind: 'free' },
    { start: 720, end: 780, kind: 'break' },
    { start: 780, end: 1020, kind: 'free' },
    { start: 1020, end: 1080, kind: 'closed' },
  ]);
});

test('overlapping Google/local blocks retain provenance and exact exclusive ends', () => {
  const result = calendarSegments(date, [interval('09:00', '10:00'), interval('09:30', '10:30', 'local')], before);
  assert.deepEqual(result.filter(s => s.kind === 'busy'), [
    { start: 540, end: 570, kind: 'busy', source: 'google' },
    { start: 570, end: 600, kind: 'busy', source: 'both' },
    { start: 600, end: 630, kind: 'busy', source: 'local' },
  ]);
  assert.equal(result.find(s => s.start === 630)?.kind, 'free');
  assert.equal(result.reduce((sum, s) => sum + s.end - s.start, 0), 600);
  for (let i = 1; i < result.length; i++) assert.equal(result[i - 1].end, result[i].start);
});

test('all-day and multi-day busy periods cover the visible day; weekends stay closed', () => {
  assert.deepEqual(calendarSegments(date, [{ start: '2030-03-31T22:00:00Z', end: '2030-04-02T22:00:00Z', source: 'google' }], before), [
    { start: 480, end: 1080, kind: 'busy', source: 'google' },
  ]);
  assert.deepEqual(workingPeriods('2030-04-06'), []);
  assert.deepEqual(calendarSegments('2030-04-06', [], before), [{ start: 480, end: 1080, kind: 'closed' }]);
});

test('Vienna daylight-saving days preserve wall-clock event positions', () => {
  const spring = calendarSegments('2030-03-31', [{ start: '2030-03-31T07:00:00Z', end: '2030-03-31T08:00:00Z', source: 'google' }], before);
  const autumn = calendarSegments('2030-10-27', [{ start: '2030-10-27T08:00:00Z', end: '2030-10-27T09:00:00Z', source: 'google' }], before);
  for (const day of [spring, autumn]) assert.deepEqual(day.filter(s => s.kind === 'busy'), [{ start: 540, end: 600, kind: 'busy', source: 'google' }]);
});

test('elapsed working time is not displayed as future availability', () => {
  const now = DateTime.fromISO(`${date}T10:15`, { zone: 'Europe/Vienna' }).toMillis();
  const result = calendarSegments(date, [], now);
  assert.deepEqual(result.find(s => s.kind === 'past'), { start: 540, end: 615, kind: 'past' });
  assert.equal(result.find(s => s.kind === 'free')?.start, 615);
});

test('range construction uses Vienna midnight across DST and rejects invalid/unbounded dates', () => {
  const original = Settings.now;
  Settings.now = () => Date.parse('2030-03-30T12:00:00Z');
  try {
    const range = calendarRange('2030-03-31', 'day');
    assert.equal(range.timeMin, '2030-03-30T23:00:00.000Z');
    assert.equal(range.timeMax, '2030-03-31T22:00:00.000Z');
    assert.deepEqual(calendarRange('2030-03-31', 'week').dates, ['2030-03-25','2030-03-26','2030-03-27','2030-03-28','2030-03-29']);
    assert.throws(() => calendarRange('2030-02-30', 'day'), /invalid_date/);
    assert.throws(() => calendarRange('2000-01-01', 'day'), /invalid_date/);
  } finally { Settings.now = original; }
});

test('provider mapping never treats calendar-specific errors or omissions as free time', () => {
  const mappings = [{ doctorId: 'anna-weber', calendarId: 'calendar-a' }, { doctorId: 'max-hoffmann', calendarId: 'calendar-b' }, { doctorId: 'lara-fischer', calendarId: undefined }];
  const data = parseFreeBusy({ calendars: {
    'calendar-a': { busy: [interval('09:00', '10:00')], summary: 'Private patient data' },
    'calendar-b': { busy: [], errors: [{ reason: 'notFound' }] },
  } }, mappings);
  assert.deepEqual(data.map(d => d.status), ['ready', 'unavailable', 'unconfigured']);
  assert.equal(data[0].busy[0].source, 'google');
  assert(!JSON.stringify(data).includes('Private patient'));
  assert(!JSON.stringify(data).includes('calendar-a'));
  assert.equal(parseFreeBusy({ calendars: {} }, mappings)[0].status, 'unavailable');
  assert.throws(() => parseFreeBusy({ calendars: { 'calendar-a': { busy: [{ start: 'bad-date', end: 'also-bad' }] } } }, mappings), /calendar_unavailable/);
});
