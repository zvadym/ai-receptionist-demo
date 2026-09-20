import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const globalDb = globalThis as unknown as { bookingDb?: Database.Database };
export function db() {
  if (globalDb.bookingDb) return globalDb.bookingDb;
  if (process.env.VERCEL) throw new Error('Local SQLite build: migrate to Postgres before deploying.');
  const folder = resolve(/* turbopackIgnore: true */ process.env.APP_DATA_DIR || '.data');
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const database = new Database(resolve(folder, 'booking.sqlite'));
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
  globalDb.bookingDb = database;
  return database;
}
