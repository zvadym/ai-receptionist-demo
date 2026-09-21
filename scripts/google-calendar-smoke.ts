// Explicit integration test: creates, moves and deletes a synthetic event in every configured doctor calendar.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { doctors } from '../src/lib/clinic';
import { query, closeDb } from '../src/lib/db';
import { listSlots, clinicDates, prepareChange, confirmChange, listBookings } from '../src/lib/booking';
import { readGoogleEvent } from '../src/lib/google-calendar';
import { reconcileCalendarOperations } from '../src/lib/calendar-sync';
process.env.APP_DATA_DIR = mkdtempSync(resolve('.data/google-sync-smoke-'));
delete process.env.DATABASE_URL;
const userId=randomUUID();
async function main() {
  await query('INSERT INTO users VALUES($1,$2,$3)',[userId,`${userId}@example.invalid`,'Calendar Integration Test']);
  for (const doctor of doctors) {
    const service=doctor.service_ids[0];
    const slot=(await listSlots(service,clinicDates()[3],'',doctor.id))[0];
    assert.ok(slot,'A free test slot is required');
    const preview=await prepareChange(userId,{action:'create',doctor_id:doctor.id,service_id:service,start:slot.start,summary:'Synthetic integration check; no real patient.',patient_phone:'+43 000000000'});
    const b=await confirmChange(userId,preview.id);
    const event=await readGoogleEvent(b.google_calendar_id!,b.google_event_id!);
    assert.match(event!.description!,/Synthetic integration check/);
    assert.match(event!.description!,/Calendar Integration Test/);
    assert.match(event!.description!,/Email:/);
    assert.equal(Date.parse(event!.start!.dateTime!),Date.parse(b.start));
    assert.equal((await confirmChange(userId,preview.id)).google_event_id,b.google_event_id);
    const target=(await listSlots(service,clinicDates()[4],'',doctor.id))[0];
    const moved=await confirmChange(userId,(await prepareChange(userId,{action:'reschedule',booking_id:b.id,start:target.start})).id);
    assert.equal(moved.google_event_id,b.google_event_id);
    assert.equal(Date.parse((await readGoogleEvent(b.google_calendar_id!,b.google_event_id!))!.start!.dateTime!),Date.parse(target.start));
    await confirmChange(userId,(await prepareChange(userId,{action:'cancel',booking_id:b.id})).id);
    const deleted=await readGoogleEvent(b.google_calendar_id!,b.google_event_id!);
    assert(!deleted || deleted.status==='cancelled');
    console.log(doctor.id,'create/read/move/read/delete verified');
  }
}
main().catch(e=>{ console.error('Google integration check failed:',e.message);process.exitCode=1; }).finally(async()=>{
  try {
    await query("UPDATE calendar_operations SET updated=0 WHERE state='pending'");
    await reconcileCalendarOperations();
    for(const b of await listBookings(userId)) if(b.status==='confirmed') {
      await confirmChange(userId,(await prepareChange(userId,{action:'cancel',booking_id:b.id})).id);
    }
  } catch { console.error('Synthetic event cleanup needs inspection in',process.env.APP_DATA_DIR);process.exitCode=1; }
  await closeDb();
});
