import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { doctorForService } from './clinic';

const globalDb = globalThis as unknown as { bookingDb?: Database.Database; bookingSchema?: number };
export function db() {
  if (globalDb.bookingDb && globalDb.bookingSchema === 1) return globalDb.bookingDb;
  if (process.env.VERCEL) throw new Error('Local SQLite build: migrate to Postgres before deploying.');
  const folder = resolve(/* turbopackIgnore: true */ process.env.APP_DATA_DIR || '.data');
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const database = globalDb.bookingDb || new Database(resolve(folder, 'booking.sqlite'));
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS codes (email TEXT PRIMARY KEY, hash TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS rate_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS mail (id TEXT PRIMARY KEY, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), service_id TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, status TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS bookings_time ON bookings(status, start, end);
    CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), payload TEXT NOT NULL, expires INTEGER NOT NULL, result TEXT);
    CREATE TABLE IF NOT EXISTS voice_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), provider_id TEXT, state TEXT NOT NULL, created INTEGER NOT NULL, usage TEXT);
    CREATE TABLE IF NOT EXISTS tool_results (session_id TEXT NOT NULL, call_id TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(session_id, call_id));
  `);
  migrateDoctorCalendars(database);
  globalDb.bookingDb = database;
  globalDb.bookingSchema = 1;
  return database;
}

export function migrateDoctorCalendars(database: Database.Database) {
  database.transaction(() => {
    const columns = database.pragma('table_info(bookings)') as { name: string }[];
    if (columns.some(column => column.name === 'doctor_id')) return;
    database.exec("ALTER TABLE bookings ADD COLUMN doctor_id TEXT NOT NULL DEFAULT ''");
    const bookings = database.prepare('SELECT id,service_id FROM bookings').all() as { id: string; service_id: string }[];
    for (const booking of bookings) database.prepare('UPDATE bookings SET doctor_id=? WHERE id=?').run(doctorForService(booking.service_id).id, booking.id);
    // Old previews referred to the shared calendar and must be reviewed again.
    database.prepare('UPDATE proposals SET expires=0 WHERE result IS NULL').run();
    const completed = database.prepare('SELECT id,result FROM proposals WHERE result IS NOT NULL').all() as { id: string; result: string }[];
    for (const row of completed) {
      const result = JSON.parse(row.result);
      result.doctor_id = doctorForService(result.service_id).id;
      database.prepare('UPDATE proposals SET result=? WHERE id=?').run(JSON.stringify(result), row.id);
    }
    database.exec('CREATE INDEX bookings_doctor_time ON bookings(doctor_id,status,start,end)');
  }).immediate();
}
