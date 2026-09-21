import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DateTime, Settings } from 'luxon';
import Database from 'better-sqlite3';
import { db, migrateDoctorCalendars } from '../src/lib/db';
import { issueCode, verifyCode, userForToken, rateLimit } from '../src/lib/auth';
import { clinicDates, listSlots, listBookings, prepareChange, confirmChange, dismissProposal } from '../src/lib/booking';
import { executeTool } from '../src/lib/tools';
import { doctors, doctorForService } from '../src/lib/clinic';
import { voiceSessionConfig } from '../src/lib/live';

const doctor = doctorForService('checkup');
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
  const first = prepareChange(a, { action: 'create', doctor_id: doctorForService('cleaning').id, service_id: 'cleaning', start: slot.start });
  const second = prepareChange(b, { action: 'create', doctor_id: doctorForService('cleaning').id, service_id: 'cleaning', start: DateTime.fromISO(slot.start).plus({ minutes: 30 }).toUTC().toISO()! });
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
  const booking = confirmChange(u, prepareChange(u, { action: 'create', doctor_id: doctorForService('checkup').id, service_id: 'checkup', start: first.start }).id);
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
  const old = prepareChange(u, { action: 'create', doctor_id: doctorForService('checkup').id, service_id: 'checkup', start: one.start });
  const current = prepareChange(u, { action: 'create', doctor_id: doctorForService('checkup').id, service_id: 'checkup', start: two.start });
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
  const result = executeTool(u, 'test-session', 'prepare-1', 'prepare_booking', JSON.stringify({ doctor_id: doctor.id, service_id: 'checkup', start: slot.start }));
  assert.equal(executeTool(u, 'test-session', 'prepare-1', 'prepare_booking', '{}'), result);
  const proposal = JSON.parse(result).result;
  const booked = executeTool(u, 'test-session', 'confirm-1', 'confirm_booking_change', JSON.stringify({ proposal_id: proposal.id }));
  assert.equal(executeTool(u, 'test-session', 'confirm-1', 'confirm_booking_change', '{}'), booked);
  assert.equal(listBookings(u).length, 1);
  assert.equal(JSON.parse(executeTool(u, 'test-session', 'unknown', 'not_a_tool', '{}')).ok, false);
});

test('doctor facts are returned by tools, never embedded in either agent prompt', () => {
  const config = voiceSessionConfig({ id: 'prompt-test', name: 'Visitor', email: 'visitor@example.test' }, 'uk');
  const prompts = config.instructions + config.delegation.responses.instructions;
  for (const d of doctors) { assert(!prompts.includes(d.name)); assert(!prompts.includes(d.id)); }
  assert(!prompts.includes('Configured clinic reference'));
  const roster = JSON.parse(executeTool(user('Roster'), 'roster', 'list', 'get_doctors', '{}'));
  assert.deepEqual(roster.result.doctors, doctors);
});

test('tools bind slots and booking changes to the configured doctor and reject invented IDs', () => {
  const u = user('Doctor');
  let callId = 0;
  const call = (name: string, input: object = {}) => JSON.parse(executeTool(u, 'doctor-flow', String(++callId), name, JSON.stringify(input)));
  const date = clinicDates()[6];
  const query = { doctor_id: doctor.id, service_id: 'checkup', date };
  assert.equal(call('find_available_slots', { ...query, doctor_id: 'imaginary-dentist' }).error, 'invalid_doctor');
  const available = call('find_available_slots', query);
  assert.equal(available.ok, true);
  assert.equal(available.result.doctor.id, doctor.id);
  assert.equal(available.result.service.id, 'checkup');
  const [first, second] = available.result.slots;
  const selection = { doctor_id: doctor.id, service_id: 'checkup', start: first.start };
  assert.equal(call('prepare_booking', { ...selection, doctor_id: 'imaginary-dentist' }).error, 'invalid_doctor');
  assert.equal(listBookings(u).length, 0);
  const prepared = call('prepare_booking', selection).result;
  assert.equal(prepared.doctor.id, doctor.id);
  const booked = call('confirm_booking_change', { proposal_id: prepared.id }).result;
  assert.equal(booked.doctor_id, doctor.id);
  assert.equal(booked.start, first.start);
  const move = call('prepare_reschedule', { booking_id: booked.id, start: second.start }).result;
  const moved = call('confirm_booking_change', { proposal_id: move.id }).result;
  assert.equal(moved.doctor.id, doctor.id);
  assert.equal(moved.start, second.start);
  assert.equal(call('list_my_bookings').result[0].doctor.id, doctor.id);
  const cancel = call('prepare_cancellation', { booking_id: booked.id }).result;
  const cancelled = call('confirm_booking_change', { proposal_id: cancel.id }).result;
  assert.equal(cancelled.doctor.id, doctor.id);
  assert.equal(cancelled.status, 'cancelled');
});


test('each doctor has an independent calendar and rejects another service', () => {
  const date = clinicDates()[7];
  const start = listSlots('cleaning', date)[0].start;
  const ids = doctors.map(d => d.id);
  assert.equal(new Set(ids).size, 3);
  for (const doctor of doctors) {
    const u = user(doctor.name);
    const serviceId = doctor.service_ids[0];
    const proposal = prepareChange(u, { action: 'create', doctor_id: doctor.id, service_id: serviceId, start });
    assert.equal(proposal.doctor_id, doctor.id);
    const booking = confirmChange(u, proposal.id);
    assert.equal(booking.doctor_id, doctor.id);
    assert(!listSlots(serviceId, date).some(s => s.start === start));
    const wrongService = serviceId === 'cleaning' ? 'checkup' : 'cleaning';
    assert.throws(() => listSlots(wrongService, date, '', doctor.id), /doctor_service_unavailable/);
    assert.throws(() => prepareChange(u, { action: 'create', doctor_id: doctor.id, service_id: wrongService, start }), /doctor_service_unavailable/);
    const next = listSlots(serviceId, date).find(s => s.start > booking.end)!;
    const moved = confirmChange(u, prepareChange(u, { action: 'reschedule', booking_id: booking.id, start: next.start }).id);
    assert.equal(moved.doctor_id, doctor.id);
    assert(listSlots(serviceId, date).some(s => s.start === start));
    confirmChange(u, prepareChange(u, { action: 'cancel', booking_id: booking.id }).id);
  }
  // Three different patients can actually hold the same start time simultaneously.
  for (const d of doctors) {
    const u = user('Parallel');
    confirmChange(u, prepareChange(u, { action: 'create', doctor_id: d.id, service_id: d.service_ids[0], start }).id);
  }
  assert.equal((db().prepare("SELECT COUNT(*) AS n FROM bookings WHERE start=? AND status='confirmed'").get(start) as { n: number }).n, 3);
});

test('legacy calendar migration preserves appointments and completed confirmations', () => {
  const legacy = new Database(':memory:');
  try {
    legacy.exec('CREATE TABLE bookings(id TEXT PRIMARY KEY,service_id TEXT,status TEXT,start TEXT,end TEXT); CREATE TABLE proposals(id TEXT PRIMARY KEY,result TEXT,expires INTEGER);');
    for (const d of doctors) {
      const booking = { id: d.id, service_id: d.service_ids[0], status: 'confirmed', start: '2030-01-01T09:00:00Z', end: '2030-01-01T10:00:00Z' };
      legacy.prepare('INSERT INTO bookings VALUES (@id,@service_id,@status,@start,@end)').run(booking);
      legacy.prepare('INSERT INTO proposals VALUES (?,?,?)').run(d.id, JSON.stringify(booking), 123);
    }
    legacy.prepare('INSERT INTO proposals VALUES (?,NULL,?)').run('pending', Date.now()+300000);
    migrateDoctorCalendars(legacy);
    migrateDoctorCalendars(legacy);
    for (const d of doctors) {
      const row = legacy.prepare('SELECT * FROM bookings WHERE id=?').get(d.id) as { doctor_id: string; status: string };
      assert.equal(row.doctor_id, d.id);
      assert.equal(row.status, 'confirmed');
      const completed = legacy.prepare('SELECT result FROM proposals WHERE id=?').get(d.id) as { result: string };
      assert.equal(JSON.parse(completed.result).doctor_id, d.id);
    }
    assert.equal((legacy.prepare("SELECT expires FROM proposals WHERE id='pending'").get() as { expires: number }).expires, 0);
  } finally { legacy.close(); }
});
