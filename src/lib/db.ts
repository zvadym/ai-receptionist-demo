import { AsyncLocalStorage } from 'node:async_hooks';
import { resolve } from 'node:path';
import { Pool, types } from 'pg';
import { attachDatabasePool } from '@vercel/functions';
import type { PGlite } from '@electric-sql/pglite';
import { schema } from './schema';

// Epoch milliseconds and counts fit safely in a JS number.
types.setTypeParser(20, Number);
type Executor = { query: (sql: string, values?: any[]) => Promise<{ rows: any[] }> };
type Database = { pool?: Pool; local?: PGlite };
const state = globalThis as unknown as { lindenDatabase?: Promise<Database> };
const context = new AsyncLocalStorage<Executor>();
const transactionLock = 72619421;

async function database(): Promise<Database> {
  if (!state.lindenDatabase) {
    state.lindenDatabase = (async () => {
      if (process.env.DATABASE_URL) {
        const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5,
          idleTimeoutMillis: 5_000, connectionTimeoutMillis: 10_000, statement_timeout: 15_000 });
        pool.on('error', () => console.error('Database connection interrupted'));
        if (process.env.VERCEL) attachDatabasePool(pool);
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('SELECT pg_advisory_xact_lock($1)', [transactionLock]);
          await client.query(schema);
          await client.query('COMMIT');
        } catch (error) { await client.query('ROLLBACK'); client.release(); await pool.end(); throw error; }
        client.release();
        return { pool };
      }
      if (process.env.VERCEL) throw new Error('DATABASE_URL is required on Vercel');
      const { PGlite } = await import('@electric-sql/pglite');
      const local = new PGlite(resolve(/* turbopackIgnore: true */ process.env.APP_DATA_DIR || '.data', 'postgres'), { parsers: { 20: Number } });
      await local.exec(schema);
      return { local };
    })().catch(error => { state.lindenDatabase = undefined; throw error; });
  }
  return state.lindenDatabase;
}

export async function query<T extends Record<string, any> = any>(sql: string, values: any[] = []): Promise<{ rows: T[] }> {
  const executor = context.getStore();
  if (executor) return executor.query(sql, values);
  const db = await database();
  return db.pool ? db.pool.query<T>(sql, values) : db.local!.query<T>(sql, values);
}

export async function transaction<T>(work: () => Promise<T>): Promise<T> {
  // Nested booking operations participate in the caller's atomic tool transaction.
  if (context.getStore()) return work();
  const db = await database();
  if (db.local) return db.local.transaction(tx => context.run(tx, work));
  const client = await db.pool!.connect();
  try {
    await client.query('BEGIN');
    // Small demo workload: serialize mutation transactions across all instances.
    // Acquire before any reads so simultaneous confirmations cannot double-book.
    await client.query('SELECT pg_advisory_xact_lock($1)', [transactionLock]);
    const result = await context.run(client, work);
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function closeDb() {
  const pending = state.lindenDatabase;
  state.lindenDatabase = undefined;
  if (!pending) return;
  const db = await pending;
  if (db.pool) await db.pool.end();
  else await db.local!.close();
}
