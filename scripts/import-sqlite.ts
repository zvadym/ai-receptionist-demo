import { resolve } from 'node:path';
import { importSqlite } from '../src/lib/import-sqlite';
import { closeDb } from '../src/lib/db';
async function main() {
  const path = process.argv[2] || resolve(process.env.APP_DATA_DIR || '.data', 'booking.sqlite');
  try { console.log('Imported row counts:', await importSqlite(path)); }
  finally { await closeDb(); }
}
main().catch(() => { console.error('Import failed; source preserved and transaction rolled back. Check the source path and ensure the destination is empty.'); process.exitCode = 1; });
