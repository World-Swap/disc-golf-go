// src/db/pool.ts — the single pg connection pool + a typed query helper.
// Every repository imports `query` from here; nothing else constructs a Pool.

import { Pool, type QueryResultRow } from 'pg';
import { config } from '../config';

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

// A terminated connection (e.g. Neon idle-in-transaction timeout) emits an
// 'error' on the pool; swallow it here so it never crashes the process.
pool.on('error', (err) => {
  console.error('[pool] unexpected client error:', err.message);
});

/** Run a parameterized query and get back typed rows. */
export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params as unknown[]);
}

/**
 * Run `fn` inside a transaction on a dedicated client of the given database.
 * Commits on success, rolls back on any throw, always releases the client.
 * Takes the db explicitly so services stay testable with a fake database.
 */
export async function withTransaction<T>(
  db: import('./types').Database,
  fn: (client: import('pg').PoolClient) => Promise<T>
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
