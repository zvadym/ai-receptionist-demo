import { query, closeDb } from '../src/lib/db';
import { exportBooking } from '../src/lib/booking';
import { AppError } from '../src/lib/errors';
async function main() {
  const rows = (await query("SELECT id FROM bookings WHERE status='confirmed' AND google_event_id IS NULL AND start>$1 ORDER BY start", [new Date().toISOString()])).rows;
  let synced = 0;
  for (const row of rows) {
    try { await exportBooking(row.id); synced++; console.log(row.id, 'synced'); }
    catch (error) { console.log(row.id, error instanceof AppError ? error.code : 'sync_failed'); }
  }
  console.log(JSON.stringify({ eligible: rows.length, synced, unresolved: rows.length-synced }));
  if (synced !== rows.length) process.exitCode = 1;
}
main().catch(() => { console.error('Backfill failed'); process.exitCode = 1; }).finally(closeDb);
