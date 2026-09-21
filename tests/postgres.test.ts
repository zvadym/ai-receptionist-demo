import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { query, closeDb } from '../src/lib/db';
import { importSqlite } from '../src/lib/import-sqlite';
import { issueAccess, markAccessSent, redeemAccess } from '../src/lib/access-links';
import { clinicDates, listSlots, prepareChange, confirmChange, listBookings } from '../src/lib/booking';
import { reserveVoice } from '../src/lib/live';
import { reconcileVoiceSessions } from '../src/lib/live-cleanup';
const folder = mkdtempSync(join(tmpdir(), 'linden-postgres-'));
process.env.APP_DATA_DIR = folder;
delete process.env.DATABASE_URL;
after(async () => { await closeDb(); rmSync(folder, { recursive: true, force: true }); });
const user = async () => {
  const u = { id: randomUUID(), name: 'Concurrency Test', email: `${randomUUID()}@example.test` };
  await query('INSERT INTO users(id,name,email) VALUES ($1,$2,$3)', [u.id, u.name, u.email]);
  return u;
};
test('SQLite import preserves records and completed confirmations, expires pending previews', async () => {
  const path = join(folder, 'legacy.sqlite');
  const source = new Database(path);
  source.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,name TEXT);
    CREATE TABLE bookings(id TEXT PRIMARY KEY,user_id TEXT,service_id TEXT,start TEXT,end TEXT,status TEXT,created INTEGER);
    CREATE TABLE proposals(id TEXT PRIMARY KEY,user_id TEXT,payload TEXT,expires INTEGER,result TEXT);`);
  const booking = { id: 'old-booking', user_id: 'old-user', service_id: 'checkup', start: '2030-01-01T09:00:00Z', end: '2030-01-01T09:30:00Z', status: 'confirmed', created: Date.now() };
  source.prepare('INSERT INTO users VALUES (?,?,?)').run('old-user', 'old@example.test', 'Old User');
  source.prepare('INSERT INTO bookings VALUES (@id,@user_id,@service_id,@start,@end,@status,@created)').run(booking);
  source.prepare('INSERT INTO proposals VALUES (?,?,?,?,?)').run('done', 'old-user', '{}', 123, JSON.stringify(booking));
  source.prepare('INSERT INTO proposals VALUES (?,?,?,?,NULL)').run('pending', 'old-user', '{}', Date.now() + 10000);
  source.close();
  await importSqlite(path);
  const imported = (await listBookings('old-user'))[0];
  assert.equal(imported.doctor_id, 'anna-weber');
  assert.equal(imported.created, booking.created);
  assert.equal((await query("SELECT expires FROM proposals WHERE id='pending'")).rows[0].expires, 0);
  assert.equal((await confirmChange('old-user', 'done')).doctor_id, 'anna-weber');
  await assert.rejects(importSqlite(path), /empty destination/);
});
test('simultaneous confirmations have exactly one winner', async () => {
  const [a, b] = await Promise.all([user(), user()]);
  const slot = (await listSlots('checkup', clinicDates()[1]))[0];
  const input = { action: 'create' as const, doctor_id: 'anna-weber', service_id: 'checkup', start: slot.start };
  const [x, y] = await Promise.all([prepareChange(a.id, input), prepareChange(b.id, input)]);
  const result = await Promise.allSettled([confirmChange(a.id, x.id), confirmChange(b.id, y.id)]);
  assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(result.filter(r => r.status === 'rejected').length, 1);
  assert.equal((await listBookings(a.id)).length + (await listBookings(b.id)).length, 1);
});
test('simultaneous token redemption and voice reservation are single-use', async () => {
  const issued = await issueAccess({ name: 'Race', email: 'race@example.test', clinic: '', language: 'en' });
  await markAccessSent(issued.request.id, 'test-mail');
  const redemption = await Promise.allSettled([redeemAccess(issued.token), redeemAccess(issued.token)]);
  assert.equal(redemption.filter(r => r.status === 'fulfilled').length, 1);
  const u = await user();
  const reservation = await Promise.allSettled([reserveVoice(u), reserveVoice(u)]);
  assert.equal(reservation.filter(r => r.status === 'fulfilled').length, 1);
});
test('reconciliation closes stale sessions, preserves unconfirmed failures and skips fresh sessions', async () => {
  const u = await user();
  for (const [id, provider, age] of [['stale', 'p-stale', 400000], ['unknown', 'p-unknown', 400000], ['fresh', 'p-fresh', 1000]] as const) {
    await query("INSERT INTO voice_sessions(id,user_id,provider_id,state,created) VALUES ($1,$2,$3,'active',$4)", [id, u.id, provider, Date.now() - age]);
  }
  await query("INSERT INTO voice_sessions(id,user_id,provider_id,state,created,expires_at) VALUES ('expired',$1,'p-expired','incomplete',$2,$3)", [u.id, Date.now() - 400000, Date.now() - 1]);
  const called: string[] = [];
  const result = await reconcileVoiceSessions(async provider => {
    called.push(provider);
    if (provider === 'p-unknown') throw new Error('Unavailable');
    return { seconds: 300 };
  });
  assert.deepEqual(called.sort(), ['p-stale', 'p-unknown']);
  assert.equal(result.expired, 1);
  assert.equal(result.closed, 1); assert.equal(result.unconfirmed, 1);
  assert.equal((await query("SELECT state FROM voice_sessions WHERE id='stale'")).rows[0].state, 'closed');
  assert.equal((await query("SELECT state FROM voice_sessions WHERE id='unknown'")).rows[0].state, 'incomplete');
});
