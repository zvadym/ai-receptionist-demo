import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DateTime, Settings } from 'luxon';
import { query, closeDb } from '../src/lib/db';
import { issueCode, verifyCode, userForToken, rateLimit } from '../src/lib/auth';
import { clinicDates, listSlots, listBookings, prepareChange, confirmChange, dismissProposal } from '../src/lib/booking';
import { executeTool } from '../src/lib/tools';
import { doctors, doctorForService } from '../src/lib/clinic';
import { voiceSessionConfig } from '../src/lib/live';
const doctor = doctorForService('checkup');
const folder = mkdtempSync(join(tmpdir(), 'linden-test-'));
process.env.APP_DATA_DIR = folder;
const user = async (name: string) => { const id = randomUUID(); (await query("INSERT INTO users VALUES ($1,$2,$3)", [id, `${id}@example.test`, name])); return id; };
after(async () => { (await closeDb()); rmSync(folder, { recursive: true, force: true }); });
test('email codes are one-time, hashed and survive wrong-code attempts', async () => {
    const code = (await issueCode(' Person@Example.test ', 'Person'));
    const record = (await query("SELECT hash FROM codes WHERE email=$1", ['person@example.test'])).rows[0] as {
        hash: string;
    };
    assert.notEqual(record.hash, code);
    (await assert.rejects(async () => (await verifyCode('person@example.test', '000000')), /invalid_code/));
    const signedIn = (await verifyCode('person@example.test', code));
    assert.equal((await userForToken(signedIn.token))?.email, 'person@example.test');
    (await assert.rejects(async () => (await verifyCode('person@example.test', code)), /invalid_code/));
});
test('expired codes and five invalid attempts cannot authenticate', async () => {
    const expired = (await issueCode('expired@example.test', 'Expired'));
    (await query("UPDATE codes SET expires=0 WHERE email=$1", ['expired@example.test']));
    (await assert.rejects(async () => (await verifyCode('expired@example.test', expired)), /invalid_code/));
    const locked = (await issueCode('locked@example.test', 'Locked'));
    for (let i = 0; i < 5; i++)
        (await assert.rejects(async () => (await verifyCode('locked@example.test', '000000')), /invalid_code/));
    (await assert.rejects(async () => (await verifyCode('locked@example.test', locked)), /invalid_code/));
});
test('resending invalidates the previous code and rate limits persist', async () => {
    const first = (await issueCode('resend@example.test', 'Resend'));
    const second = (await issueCode('resend@example.test', 'Resend'));
    if (first !== second)
        (await assert.rejects(async () => (await verifyCode('resend@example.test', first)), /invalid_code/));
    assert.ok((await verifyCode('resend@example.test', second)).token);
    (await rateLimit('test-cap', 1, 60000));
    (await assert.rejects(async () => (await rateLimit('test-cap', 1, 60000)), /rate_limited/));
});
test('confirm is idempotent; overlapping proposals cannot double book', async () => {
    const a = (await user('A')), b = (await user('B'));
    const slot = (await listSlots('cleaning', clinicDates()[1]))[0];
    const first = (await prepareChange(a, { action: 'create', doctor_id: doctorForService('cleaning').id, service_id: 'cleaning', start: slot.start }));
    const second = (await prepareChange(b, { action: 'create', doctor_id: doctorForService('cleaning').id, service_id: 'cleaning', start: DateTime.fromISO(slot.start).plus({ minutes: 30 }).toUTC().toISO()! }));
    const booked = (await confirmChange(a, first.id));
    assert.deepEqual((await confirmChange(a, first.id)), booked);
    assert.equal((await listBookings(a)).length, 1);
    (await assert.rejects(async () => (await confirmChange(b, second.id)), /slot_unavailable/));
    (await assert.rejects(async () => (await prepareChange(b, { action: 'cancel', booking_id: booked.id })), /booking_not_found/));
    (await assert.rejects(async () => (await confirmChange(b, first.id)), /proposal_not_found/));
});
test('rescheduling frees the old slot; cancellation frees the new one', async () => {
    const u = (await user('Move'));
    const date = clinicDates()[2];
    const [first, second] = (await listSlots('checkup', date));
    const booking = (await confirmChange(u, (await prepareChange(u, { action: 'create', doctor_id: doctorForService('checkup').id, service_id: 'checkup', start: first.start })).id));
    const moved = (await confirmChange(u, (await prepareChange(u, { action: 'reschedule', booking_id: booking.id, start: second.start })).id));
    assert.equal(moved.start, second.start);
    assert.ok((await listSlots('checkup', date)).some(s => s.start === first.start));
    assert.ok(!(await listSlots('checkup', date)).some(s => s.start === second.start));
    const cancelled = (await confirmChange(u, (await prepareChange(u, { action: 'cancel', booking_id: booking.id })).id));
    assert.equal(cancelled.status, 'cancelled');
    assert.ok((await listSlots('checkup', date)).some(s => s.start === second.start));
});
test('outdated, dismissed and expired proposals cannot execute', async () => {
    const u = (await user('Preview'));
    const date = clinicDates()[3];
    const [one, two] = (await listSlots('checkup', date));
    const old = (await prepareChange(u, { action: 'create', doctor_id: doctorForService('checkup').id, service_id: 'checkup', start: one.start }));
    const current = (await prepareChange(u, { action: 'create', doctor_id: doctorForService('checkup').id, service_id: 'checkup', start: two.start }));
    (await assert.rejects(async () => (await confirmChange(u, old.id)), /proposal_expired/));
    (await dismissProposal(u, current.id));
    (await assert.rejects(async () => (await confirmChange(u, current.id)), /proposal_expired/));
});
test('office hours, lunch, date horizon and timezone are enforced', async () => {
    (await assert.rejects(async () => (await listSlots('checkup', '2000-01-01')), /invalid_date/));
    (await assert.rejects(async () => (await listSlots('unknown', clinicDates()[0])), /invalid_service/));
    for (const slot of (await listSlots('cleaning', clinicDates()[4]))) {
        const start = DateTime.fromISO(slot.start).setZone('Europe/Vienna');
        const end = DateTime.fromISO(slot.end).setZone('Europe/Vienna');
        assert.ok(start.hour >= 9 && end.hour <= 17);
        assert.ok(end.hour <= 12 || start.hour >= 13);
    }
    const original = Settings.now;
    const epoch = Date.parse('2030-03-29T00:00:00Z');
    try {
        Settings.now = () => epoch;
        assert.equal((await listSlots('checkup', '2030-03-29'))[0].start, '2030-03-29T08:00:00.000Z');
        assert.equal((await listSlots('checkup', '2030-04-01'))[0].start, '2030-04-01T07:00:00.000Z');
    }
    finally {
        Settings.now = original;
    }
});
test('tool replay returns the exact persisted result without another mutation', async () => {
    const u = (await user('Tool'));
    const slot = (await listSlots('checkup', clinicDates()[5]))[0];
    const result = (await executeTool(u, 'test-session', 'prepare-1', 'prepare_booking', JSON.stringify({ doctor_id: doctor.id, service_id: 'checkup', start: slot.start })));
    assert.equal((await executeTool(u, 'test-session', 'prepare-1', 'prepare_booking', '{}')), result);
    const proposal = JSON.parse(result).result;
    const booked = (await executeTool(u, 'test-session', 'confirm-1', 'confirm_booking_change', JSON.stringify({ proposal_id: proposal.id })));
    assert.equal((await executeTool(u, 'test-session', 'confirm-1', 'confirm_booking_change', '{}')), booked);
    assert.equal((await listBookings(u)).length, 1);
    assert.equal(JSON.parse((await executeTool(u, 'test-session', 'unknown', 'not_a_tool', '{}'))).ok, false);
});
test('doctor facts are returned by tools, never embedded in either agent prompt', async () => {
    const config = voiceSessionConfig({ id: 'prompt-test', name: 'Visitor', email: 'visitor@example.test' }, 'uk');
    const prompts = config.instructions + config.delegation.responses.instructions;
    for (const d of doctors) {
        assert(!prompts.includes(d.name));
        assert(!prompts.includes(d.id));
    }
    assert(!prompts.includes('Configured clinic reference'));
    const roster = JSON.parse((await executeTool((await user('Roster')), 'roster', 'list', 'get_doctors', '{}')));
    assert.deepEqual(roster.result.doctors, doctors);
});
test('tools bind slots and booking changes to the configured doctor and reject invented IDs', async () => {
    const u = (await user('Doctor'));
    let callId = 0;
    const call = async (name: string, input: object = {}) => JSON.parse((await executeTool(u, 'doctor-flow', String(++callId), name, JSON.stringify(input))));
    const date = clinicDates()[6];
    const query = { doctor_id: doctor.id, service_id: 'checkup', date };
    assert.equal((await call('find_available_slots', { ...query, doctor_id: 'imaginary-dentist' })).error, 'invalid_doctor');
    const available = (await call('find_available_slots', query));
    assert.equal(available.ok, true);
    assert.equal(available.result.doctor.id, doctor.id);
    assert.equal(available.result.service.id, 'checkup');
    const [first, second] = available.result.slots;
    const selection = { doctor_id: doctor.id, service_id: 'checkup', start: first.start };
    assert.equal((await call('prepare_booking', { ...selection, doctor_id: 'imaginary-dentist' })).error, 'invalid_doctor');
    assert.equal((await listBookings(u)).length, 0);
    const prepared = (await call('prepare_booking', selection)).result;
    assert.equal(prepared.doctor.id, doctor.id);
    const booked = (await call('confirm_booking_change', { proposal_id: prepared.id })).result;
    assert.equal(booked.doctor_id, doctor.id);
    assert.equal(booked.start, first.start);
    const move = (await call('prepare_reschedule', { booking_id: booked.id, start: second.start })).result;
    const moved = (await call('confirm_booking_change', { proposal_id: move.id })).result;
    assert.equal(moved.doctor.id, doctor.id);
    assert.equal(moved.start, second.start);
    assert.equal((await call('list_my_bookings')).result[0].doctor.id, doctor.id);
    const cancel = (await call('prepare_cancellation', { booking_id: booked.id })).result;
    const cancelled = (await call('confirm_booking_change', { proposal_id: cancel.id })).result;
    assert.equal(cancelled.doctor.id, doctor.id);
    assert.equal(cancelled.status, 'cancelled');
});
test('each doctor has an independent calendar and rejects another service', async () => {
    const date = clinicDates()[7];
    const start = (await listSlots('cleaning', date))[0].start;
    const ids = doctors.map(d => d.id);
    assert.equal(new Set(ids).size, 3);
    for (const doctor of doctors) {
        const u = (await user(doctor.name));
        const serviceId = doctor.service_ids[0];
        const proposal = (await prepareChange(u, { action: 'create', doctor_id: doctor.id, service_id: serviceId, start }));
        assert.equal(proposal.doctor_id, doctor.id);
        const booking = (await confirmChange(u, proposal.id));
        assert.equal(booking.doctor_id, doctor.id);
        assert(!(await listSlots(serviceId, date)).some(s => s.start === start));
        const wrongService = serviceId === 'cleaning' ? 'checkup' : 'cleaning';
        (await assert.rejects(async () => (await listSlots(wrongService, date, '', doctor.id)), /doctor_service_unavailable/));
        (await assert.rejects(async () => (await prepareChange(u, { action: 'create', doctor_id: doctor.id, service_id: wrongService, start })), /doctor_service_unavailable/));
        const next = (await listSlots(serviceId, date)).find(s => s.start > booking.end)!;
        const moved = (await confirmChange(u, (await prepareChange(u, { action: 'reschedule', booking_id: booking.id, start: next.start })).id));
        assert.equal(moved.doctor_id, doctor.id);
        assert((await listSlots(serviceId, date)).some(s => s.start === start));
        (await confirmChange(u, (await prepareChange(u, { action: 'cancel', booking_id: booking.id })).id));
    }
    // Three different patients can actually hold the same start time simultaneously.
    for (const d of doctors) {
        const u = (await user('Parallel'));
        (await confirmChange(u, (await prepareChange(u, { action: 'create', doctor_id: d.id, service_id: d.service_ids[0], start })).id));
    }
    assert.equal(((await query("SELECT COUNT(*) AS n FROM bookings WHERE start=$1 AND status='confirmed'", [start])).rows[0] as {
        n: number;
    }).n, 3);
});
