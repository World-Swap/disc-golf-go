// src/db/migrate.ts — boot-time schema bootstrap. Idempotent: creates every
// table (IF NOT EXISTS) on each start, then (re)seeds content whenever the
// stored content version is behind CONTENT_VERSION. Lets a fresh — or
// out-of-date — Neon database self-heal on deploy without any CLI step.

import type { Database } from './types';
import { SCHEMA_SQL } from './schema';
import { seedDatabase, CONTENT_VERSION } from './seed';

export async function runMigrations(db: Database): Promise<void> {
  const client = await db.connect();
  try {
    await client.query(SCHEMA_SQL);
    console.log('[migrate] schema ensured');

    const { rows } = await client.query<{ content_version: number }>(
      'SELECT content_version FROM seed_meta WHERE id = 1'
    );
    const current = rows[0]?.content_version ?? 0;

    if (current < CONTENT_VERSION) {
      await client.query('BEGIN');
      try {
        await seedDatabase(client);
        await client.query(
          `INSERT INTO seed_meta (id, content_version, updated_at) VALUES (1, $1, NOW())
           ON CONFLICT (id) DO UPDATE SET content_version = EXCLUDED.content_version, updated_at = NOW()`,
          [CONTENT_VERSION]
        );
        await client.query('COMMIT');
        console.log(`[migrate] content seeded (v${current} -> v${CONTENT_VERSION})`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    } else {
      console.log(`[migrate] content up to date (v${current})`);
    }
  } finally {
    client.release();
  }
}
