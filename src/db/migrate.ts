// src/db/migrate.ts — boot-time schema bootstrap. Idempotent: creates every
// table (IF NOT EXISTS) on each start, then seeds starter content exactly once
// (guarded by an empty training_categories check). Lets a fresh Neon database
// self-heal on deploy without any CLI step.

import type { Database } from './types';
import { SCHEMA_SQL } from './schema';
import { SEED_SQL } from './seed';

export async function runMigrations(db: Database): Promise<void> {
  const client = await db.connect();
  try {
    await client.query(SCHEMA_SQL);
    console.log('[migrate] schema ensured');

    const { rows } = await client.query<{ n: string }>('SELECT COUNT(*) AS n FROM training_categories');
    const categoryCount = parseInt(rows[0]?.n ?? '0', 10);
    if (categoryCount === 0) {
      await client.query('BEGIN');
      try {
        await client.query(SEED_SQL);
        await client.query('COMMIT');
        console.log('[migrate] starter content seeded');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    } else {
      console.log(`[migrate] seed skipped (${categoryCount} categories present)`);
    }
  } finally {
    client.release();
  }
}
