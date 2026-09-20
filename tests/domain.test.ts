import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DateTime, Settings } from 'luxon';
import { db } from '../src/lib/db';
import { issueCode, verifyCode, userForToken, rateLimit } from '../src/lib/auth';
import { clinicDates, listSlots, listBookings, prepareChange, confirmChange, dismissProposal } from '../src/lib/booking';
import { executeTool } from '../src/lib/tools';

const folder = mkdtempSync(join(tmpdir(), 'linden-test-'));
process.env.APP_DATA_DIR = folder;
const user = (name: string) => { const id = randomUUID(); db().prepare('INSERT INTO users VALUES (?,?,?)').run(id, `${id}@example.test`, name); return id; };
after(() => { db().close(); rmSync(folder, { recursive: true, force: true }); });

test('email codes are one-time, hashed and survive wrong-code attempts', () => {
  const code = issueCode(' Person@Example.test ', 'Person');
  const record = db().prepare('SELECT hash FROM codes WHERE email=?').get('person@example.test') as { hash: string };
  assert.notEqual(record.hash, code);
  assert.throws(() => verifyCode('person@example.test', '000000'), /invalid_code/);
  const signedIn = verifyCode('person@example.test', code);
  assert.equal(userForToken(signedIn.token)?.email, 'person@example.test');
  assert.throws(() => verifyCode('person@example.test', code), /invalid_code/);
});
test('expired codes and five invalid attempts cannot authenticate', () => {
  const expired = issueCode('expired@example.test', 'Expired');
  db().prepare('UPDATE codes SET expires=0 WHERE email=?').run('expired@example.test');
  assert.throws(() => verifyCode('expired@example.test', expired), /invalid_code/);
  const locked = issueCode('locked@example.test', 'Locked');
  for (let i=0;i<5;i++) assert.throws(() => verifyCode('locked@example.test', '000000'), /invalid_code/);
  assert.throws(() => verifyCode('locked@example.test', locked), /invalid_code/);
});
test('resending invalidates the previous code and rate limits persist', () => {
  const first = issueCode('resend@example.test', 'Resend');
  const second = issueCode('resend@example.test', 'Resend');
  if (first !== second) assert.throws(() => verifyCode('resend@example.test', first), /invalid_code/);
  assert.ok(verifyCode('resend@example.test', second).token);
  rateLimit('test-cap', 1, 60_000);
  assert.throws(() => rateLimit('test-cap', 1, 60_000), /rate_limited/);
});
test('confirm is idempotent; overlapping proposals cannot double book', () => {
  const a = user('A'), b = user('B');
  const slot = listSlots('cleaning', clinicDates()[1])[0];
  const first = prepareChange(a, { action: 'create', service_id: 'cleaning', start: slot.start });
  const second = prepareChange(b, { action: 'create', service_id: 'checkup', start: DateTime.fromISO(slot.start).plus({ minutes: 30 }).toUTC().toISO()! });
  const booked = confirmChange(a, first.id);
  assert.deepEqual(confirmChange(a, first.id), booked);
  assert.equal(listBookings(a).length, 1);
  assert.throws(() => confirmChange(b, second.id), /slot_unavailable/);
  assert.throws(() => prepareChange(b, { action: 'cancel', booking_id: booked.id }), /booking_not_found/);
  assert.throws(() => confirmChange(b, first.id), /proposal_not_found/);
});
test('rescheduling frees the old slot; cancellation frees the new one', () => {
  const u = user('Move');
  const date = clinicDates()[2];
  const [first, second] = listSlots('checkup', date);
  const booking = confirmChange(u, prepareChange(u, { action: 'create', service_id: 'checkup', start: first.start }).id);
  const moved = confirmChange(u, prepareChange(u, { action: 'reschedule', booking_id: booking.id, start: second.start }).id);
  assert.equal(moved.start, second.start);
  assert.ok(listSlots('checkup', date).some(s => s.start === first.start));
  assert.ok(!listSlots('checkup', date).some(s => s.start === second.start));
  const cancelled = confirmChange(u, prepareChange(u, { action: 'cancel', booking_id: booking.id }).id);
  assert.equal(cancelled.status, 'cancelled');
  assert.ok(listSlots('checkup', date).some(s => s.start === second.start));
});
test('outdated, dismissed and expired proposals cannot execute', () => {
  const u = user('Preview'); const date = clinicDates()[3];
  const [one, two] = listSlots('checkup', date);
  const old = prepareChange(u, { action: 'create', service_id: 'checkup', start: one.start });
  const current = prepareChange(u, { action: 'create', service_id: 'checkup', start: two.start });
  assert.throws(() => confirmChange(u, old.id), /proposal_expired/);
  dismissProposal(u, current.id);
  assert.throws(() => confirmChange(u, current.id), /proposal_expired/);
});
test('office hours, lunch, date horizon and timezone are enforced', () => {
  assert.throws(() => listSlots('checkup', '2000-01-01'), /invalid_date/);
  assert.throws(() => listSlots('unknown', clinicDates()[0]), /invalid_service/);
  for (const slot of listSlots('cleaning', clinicDates()[4])) {
    const start = DateTime.fromISO(slot.start).setZone('Europe/Vienna');
    const end = DateTime.fromISO(slot.end).setZone('Europe/Vienna');
    assert.ok(start.hour >= 9 && end.hour <= 17);
    assert.ok(end.hour <= 12 || start.hour >= 13);
  }
  const original = Settings.now;
  const epoch = Date.parse('2030-03-29T00:00:00Z');
  try {
    Settings.now = () => epoch;
    assert.equal(listSlots('checkup', '2030-03-29')[0].start, '2030-03-29T08:00:00.000Z');
    assert.equal(listSlots('checkup', '2030-04-01')[0].start, '2030-04-01T07:00:00.000Z');
  } finally { Settings.now = original; }
});
test('tool replay returns the exact persisted result without another mutation', () => {
  const u = user('Tool'); const slot = listSlots('checkup', clinicDates()[5])[0];
  const result = executeTool(u, 'test-session', 'prepare-1', 'prepare_booking', JSON.stringify({ service_id: 'checkup', start: slot.start }));
  assert.equal(executeTool(u, 'test-session', 'prepare-1', 'prepare_booking', '{}'), result);
  const proposal = JSON.parse(result).result;
  const booked = executeTool(u, 'test-session', 'confirm-1', 'confirm_booking_change', JSON.stringify({ proposal_id: proposal.id }));
  assert.equal(executeTool(u, 'test-session', 'confirm-1', 'confirm_booking_change', '{}'), booked);
  assert.equal(listBookings(u).length, 1);
  assert.equal(JSON.parse(executeTool(u, 'test-session', 'unknown', 'not_a_tool', '{}')).ok, false);
});
