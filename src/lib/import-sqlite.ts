import Database from 'better-sqlite3';
import { doctorForService } from './clinic';
import { query, transaction } from './db';

const tables = ['users', 'codes', 'sessions', 'rate_limits', 'mail', 'bookings', 'proposals',
  'voice_sessions', 'tool_results', 'contact_requests', 'access_requests', 'access_links'] as const;
export async function importSqlite(path: string) {
  const source = new Database(path, { readonly: true, fileMustExist: true });
  try {
    return await transaction(async () => {
      if ((await query('SELECT id FROM users LIMIT 1')).rows.length) throw new Error('Import requires an empty destination');
      const counts: Record<string, number> = {};
      for (const table of tables) {
        if (!source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) continue;
        const rows = source.prepare(`SELECT * FROM "${table}"`).all() as Record<string, any>[];
        for (const row of rows) {
          if (table === 'bookings' && !row.doctor_id) row.doctor_id = doctorForService(row.service_id).id;
          if (table === 'proposals') {
            if (!row.result) row.expires = 0;
            else {
              const result = JSON.parse(row.result);
              result.doctor_id ||= doctorForService(result.service_id).id;
              row.result = JSON.stringify(result);
            }
          }
          // Local sessions cannot keep running across an offline database import.
          if (table === 'voice_sessions' && ['starting', 'active', 'closing'].includes(row.state)) row.state = 'incomplete';
          const columns = Object.keys(row);
          const quoted = columns.map(c => '"' + c.replaceAll('"', '""') + '"').join(',');
          await query(`INSERT INTO "${table}" (${quoted}) VALUES (${columns.map((_, i) => '$' + (i + 1)).join(',')})`, Object.values(row));
        }
        counts[table] = rows.length;
      }
      return counts;
    });
  } finally { source.close(); }
}
