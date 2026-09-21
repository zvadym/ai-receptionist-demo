import { test, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DateTime } from 'luxon';
import { query, closeDb } from '../src/lib/db';
import { clinicDates, listSlots, prepareChange, confirmChange, listBookings, dismissProposal, exportBooking } from '../src/lib/booking';
import { googleCalendarApi, googleBusy, googleEventId, type GoogleEvent } from '../src/lib/google-calendar';
import { reconcileCalendarOperations } from '../src/lib/calendar-sync';
import { executeTool } from '../src/lib/tools';
import { AppError } from '../src/lib/errors';
import { doctors } from '../src/lib/clinic';

const folder = mkdtempSync(join(tmpdir(), 'linden-google-'));
process.env.APP_DATA_DIR = folder;
delete process.env.DATABASE_URL;
process.env.GOOGLE_SERVICE_ACCOUNT_JSON = '{}';
process.env.GOOGLE_CALENDAR_ANNA_WEBER = 'anna';
process.env.GOOGLE_CALENDAR_MAX_HOFFMANN = 'max';
process.env.GOOGLE_CALENDAR_LARA_FISCHER = 'lara';
const events = new Map<string, GoogleEvent>();
let writes = 0, failAfterWrite = false, failRead = false, sequence = 0;
let pages: { items: GoogleEvent[]; nextPageToken?: string }[] = [];
const calls: { method: string; path: string; data: any; params: any; etag: any }[] = [];
mock.method(googleCalendarApi, 'request', async (method: string, path: string, data?: any, params?: any, etag?: string) => {
  calls.push({ method,path,data,params,etag });
  if (failRead && method === 'GET') throw new AppError('calendar_unavailable', 502);
  const parts = path.split('/'), calendar = decodeURIComponent(parts[1]), id = parts[3];
  const key = `${calendar}/${id || data?.id}`;
  const existing = events.get(key);
  if (method === 'GET') {
    if (!id) {
      if (pages.length) return pages.shift();
      return { items: [...events.entries()].filter(([k,e]) => k.startsWith(`${calendar}/`) && e.start?.dateTime! < params.timeMax && e.end?.dateTime! > params.timeMin).map(([,e]) => structuredClone(e)) };
    }
    if (!existing) throw new AppError('calendar_event_missing', 409);
    return structuredClone(existing);
  }
  if (method === 'POST' && existing) throw new AppError('calendar_conflict',409);
  if ((method === 'PATCH' || method === 'DELETE') && etag !== existing?.etag) throw new AppError('calendar_conflict',409);
  writes++;
  if (method === 'DELETE') { events.delete(key); return {}; }
  const event = { ...existing, ...data, id: id || data.id, etag: `"v${++sequence}"`, htmlLink: 'https://calendar.google.com/event/test' };
  events.set(key, event);
  if (failAfterWrite) { failAfterWrite = false; throw new AppError('calendar_unavailable',502); }
  return structuredClone(event);
});
beforeEach(async () => {
  events.clear(); writes=0; failRead=false; failAfterWrite=false; pages=[]; calls.length=0;
  await query('DELETE FROM tool_results'); await query('DELETE FROM calendar_operations');
  await query('DELETE FROM proposals'); await query('DELETE FROM bookings'); await query('DELETE FROM users');
});
after(async () => { await closeDb(); rmSync(folder,{recursive:true,force:true}); });
const user = async () => { const id=randomUUID(); await query('INSERT INTO users VALUES($1,$2,$3)',[id,`${id}@example.test`,'Calendar Test']); return id; };
const selection = async (doctor = doctors[0]) => ({ doctor_id: doctor.id, service_id: doctor.service_ids[0], start: (await listSlots(doctor.service_ids[0],clinicDates()[1],'',doctor.id))[0].start });

test('each doctor writes a private event with patient data; moves and cancels the same event without invites', async () => {
  for (const doctor of doctors) {
    const u=await user(), input=await selection(doctor);
    const proposal=await prepareChange(u,{action:'create',...input,summary:'Patient reports tooth discomfort.',patient_phone:'+43 1234567'});
    assert.equal(writes,0);
    const b=await confirmChange(u,proposal.id);
    assert.ok(b.google_event_id);
    assert.match(b.google_event_id!,/^[0-9a-v]+$/);
    const remote=events.get(`${b.google_calendar_id}/${b.google_event_id}`)!;
    assert.match(remote.description!,/Patient reports tooth discomfort/);
    assert.match(remote.description!,/Email: .*@example.test/);
    assert.match(remote.description!,/Phone: \+43 1234567/);
    const insert=calls.findLast(c=>c.method==='POST')!;
    assert.equal(insert.data.visibility,'private'); assert.equal(insert.data.attendees,undefined); assert.equal(insert.params.sendUpdates,'none');
    assert.deepEqual(await confirmChange(u,proposal.id),b);
    const next=(await listSlots(input.service_id,clinicDates()[2],'',doctor.id))[0];
    const moved=await confirmChange(u,(await prepareChange(u,{action:'reschedule',booking_id:b.id,start:next.start})).id);
    assert.equal(moved.google_event_id,b.google_event_id);
    assert.equal(events.get(`${b.google_calendar_id}/${b.google_event_id}`)?.start?.dateTime,next.start);
    const cancelled=await confirmChange(u,(await prepareChange(u,{action:'cancel',booking_id:b.id})).id);
    assert.equal(cancelled.status,'cancelled'); assert.equal(events.size,0);
    writes=0;
  }
});
test('lost insert response survives a restart, reserves its slot and confirms once through tool retry', async () => {
  const u=await user(), input=await selection();
  const p=await prepareChange(u,{action:'create',...input});
  failAfterWrite=true;
  const result=JSON.parse(await executeTool(u,'session','first','confirm_booking_change',JSON.stringify({proposal_id:p.id})));
  assert.equal(result.error,'calendar_sync_pending');
  assert.equal((await listBookings(u)).length,0); assert.equal(events.size,1);
  await assert.rejects(()=>dismissProposal(u,p.id),/calendar_sync_pending/);
  assert(!(await listSlots('checkup',clinicDates()[1])).some(s=>s.start===input.start));
  await closeDb();
  const retry=JSON.parse(await executeTool(u,'session','retry','confirm_booking_change',JSON.stringify({proposal_id:p.id})));
  assert.equal(retry.ok,true); assert.equal(writes,1); assert.equal((await listBookings(u)).length,1);
});
test('concurrent confirmations cannot double book; provider conflicts after preview do not create a local booking', async () => {
  const a=await user(),b=await user(),input=await selection();
  const p=await prepareChange(a,{action:'create',...input}),q=await prepareChange(b,{action:'create',...input});
  const results=await Promise.allSettled([confirmChange(a,p.id),confirmChange(b,q.id)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1); assert.equal(events.size,1);
  const next=(await listSlots('checkup',clinicDates()[2]))[0];
  const proposal=await prepareChange(a,{action:'create',doctor_id:'anna-weber',service_id:'checkup',start:next.start});
  events.set('anna/external',{id:'external',start:{dateTime:next.start},end:{dateTime:next.end}});
  await assert.rejects(()=>confirmChange(a,proposal.id),/slot_unavailable/);
  assert.equal((await query('SELECT count(*) AS n FROM bookings')).rows[0].n,1);
});
test('rescheduling excludes only the owned event and etags prevent overwriting external edits', async () => {
  const u=await user(),input=await selection(doctors[1]);
  const b=await confirmChange(u,(await prepareChange(u,{action:'create',...input})).id);
  const overlapping=DateTime.fromISO(b.start).plus({minutes:30}).toUTC().toISO()!;
  const move=await prepareChange(u,{action:'reschedule',booking_id:b.id,start:overlapping});
  const remote=events.get(`${b.google_calendar_id}/${b.google_event_id}`)!;
  remote.etag='"external-edit"'; remote.summary='Changed manually';
  await assert.rejects(()=>confirmChange(u,move.id),/calendar_conflict/);
  assert.equal((await listBookings(u))[0].start,b.start);
  assert.equal(remote.summary,'Changed manually');
  events.set('max/external',{id:'external',start:{dateTime:overlapping},end:{dateTime:b.end}});
  assert(!(await listSlots('cleaning',clinicDates()[1],b.id,'max-hoffmann')).some(s=>s.start===overlapping));
});
test('paginated recurring instances and all-day events block time; transparent/cancelled events do not', async () => {
  pages=[{items:[{id:'all-day',start:{date:'2030-04-01'},end:{date:'2030-04-02'}}],nextPageToken:'page2'},
    {items:[{id:'recurrence_20300401',start:{dateTime:'2030-04-01T09:00:00+02:00'},end:{dateTime:'2030-04-01T10:00:00+02:00'}},
      {id:'free',transparency:'transparent'},{id:'gone',status:'cancelled'}]}];
  const busy=await googleBusy('anna','2030-03-31T22:00:00Z','2030-04-01T22:00:00Z');
  assert.equal(busy.length,2); assert.equal(busy[0].start,'2030-03-31T22:00:00.000Z');
  assert.equal(calls[1].params.pageToken,'page2'); assert.equal(calls[0].params.singleEvents,true);
  failRead=true; await assert.rejects(()=>listSlots('checkup',clinicDates()[1]),/calendar_unavailable/);
});
test('maintenance recovers pending writes; existing local future bookings export without duplicate events', async () => {
  const u=await user(),input=await selection(),p=await prepareChange(u,{action:'create',...input});
  failAfterWrite=true; await assert.rejects(()=>confirmChange(u,p.id),/calendar_sync_pending/);
  await query('UPDATE calendar_operations SET updated=0');
  assert.deepEqual(await reconcileCalendarOperations(),{checked:1,completed:1});
  const date=clinicDates()[3],slot=(await listSlots('checkup',date))[0],id=randomUUID();
  await query('INSERT INTO bookings(id,user_id,doctor_id,service_id,start,"end",status,created) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,u,'anna-weber','checkup',slot.start,slot.end,'confirmed',Date.now()]);
  const b=await exportBooking(id); assert.equal(b.google_event_id,googleEventId(id)); assert.equal(b.patient_name,'Calendar Test');
  const count=writes; await exportBooking(id); assert.equal(writes,count);
  await assert.rejects(()=>prepareChange('another-user',{action:'cancel',booking_id:id}));
});
