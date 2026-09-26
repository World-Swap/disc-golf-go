// src/db/migrate.ts — boot-time schema bootstrap. Idempotent: creates every
// table (IF NOT EXISTS) on each start, then (re)seeds content whenever the
// stored content version is behind CONTENT_VERSION. Lets a fresh — or
// out-of-date — Neon database self-heal on deploy without any CLI step.

import type { PoolClient } from 'pg';
import type { Database } from './types';
import { SCHEMA_SQL } from './schema';
import { seedDatabase, CONTENT_VERSION } from './seed';
import { isPlaceholderCourseName } from './data/placeholder-names';

// One-time (idempotent) repair for completions orphaned by past delete+reinsert
// reseeds, which churned training_lessons ids. Re-links training_completions to
// the CURRENT lesson via the lesson title captured in xp_transactions when the
// lesson was completed, so lesson progress / vault / category mastery / rank
// counts recover. Safe to run every boot — once repaired there is nothing left
// to match (the NOT EXISTS filter is empty), so it becomes a cheap no-op.
const MAPPED_CTE = `
  WITH mapped AS (
    SELECT DISTINCT ON (tc.player_id, cur.id)
           tc.id AS completion_id, tc.player_id, cur.id AS new_id
    FROM training_completions tc
    JOIN LATERAL (
      SELECT xt.metadata->>'lesson_title' AS title
      FROM xp_transactions xt
      WHERE xt.player_id = tc.player_id
        AND xt.event_type = 'training_completion'
        AND xt.metadata->>'lesson_id' = tc.lesson_id::text
      ORDER BY xt.created_at DESC
      LIMIT 1
    ) t ON TRUE
    JOIN training_lessons cur ON cur.title = t.title
    WHERE NOT EXISTS (SELECT 1 FROM training_lessons l WHERE l.id = tc.lesson_id)
  )`;

async function relinkOrphanedCompletions(client: PoolClient): Promise<void> {
  // Drop orphaned rows that would collide with a completion the player already has.
  const del = await client.query(
    `${MAPPED_CTE}
     DELETE FROM training_completions tc USING mapped m
     WHERE tc.id = m.completion_id
       AND EXISTS (SELECT 1 FROM training_completions t2 WHERE t2.player_id = m.player_id AND t2.lesson_id = m.new_id)`
  );
  // Re-point the remaining orphaned rows at the current lesson id.
  const upd = await client.query(
    `${MAPPED_CTE}
     UPDATE training_completions tc SET lesson_id = m.new_id
     FROM mapped m WHERE tc.id = m.completion_id`
  );
  if ((del.rowCount ?? 0) + (upd.rowCount ?? 0) > 0) {
    console.log(`[migrate] training completions repaired: ${upd.rowCount ?? 0} re-linked, ${del.rowCount ?? 0} deduped`);
  }
}

// Removes the per-tee / per-basket rows an earlier OSM seed wrote to `courses`
// ("Tee 2 - Long", "Hole 10 - Gray", "Basket4", "Disc Golf Course", "Course 1"),
// which filled the course picker with hole designations instead of courses.
//
// The rule lives in one place (data/placeholder-names.ts), so the match is made
// here in JS over the name list rather than as a second copy of the patterns in
// SQL. Only the matching ids are deleted, which leaves every real course's id
// untouched — a full re-seed would renumber them and strip check-ins, reviews
// and bests of the course they point at. Safe on every boot: once pruned the id
// list comes back empty and this is a single cheap SELECT.
export async function pruneUnnamedCourses(client: PoolClient): Promise<void> {
  const { rows } = await client.query<{ id: number; name: string | null }>(
    'SELECT id, name FROM courses'
  );
  const ids = rows.filter((r) => isPlaceholderCourseName(r.name)).map((r) => r.id);
  if (!ids.length) return;

  // scorecards cascade on course delete; say so rather than dropping them silently.
  const cards = await client.query<{ n: string }>(
    'SELECT COUNT(*)::text AS n FROM scorecards WHERE course_id = ANY($1::int[])',
    [ids]
  );
  const del = await client.query('DELETE FROM courses WHERE id = ANY($1::int[])', [ids]);
  const lost = Number(cards.rows[0]?.n ?? 0);
  console.log(
    `[migrate] pruned ${del.rowCount ?? 0} placeholder courses (tee/basket/hole entries)` +
      (lost ? `; ${lost} scorecard(s) at them removed` : '')
  );
}

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

    // Self-heal any completions orphaned by earlier reseeds (non-fatal).
    try {
      await relinkOrphanedCompletions(client);
    } catch (err) {
      console.error('[migrate] completion re-link skipped:', (err as Error).message);
    }

    // Drop tee/basket rows an earlier course seed wrote (non-fatal).
    try {
      await pruneUnnamedCourses(client);
    } catch (err) {
      console.error('[migrate] course prune skipped:', (err as Error).message);
    }
  } finally {
    client.release();
  }
}
