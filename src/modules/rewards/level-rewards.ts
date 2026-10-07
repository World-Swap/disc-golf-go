// src/modules/rewards/level-rewards.ts — gold for reaching a level.
//
// This lives beside applyXp rather than in any feature, because the level
// changes in exactly one place and a reward wired to a feature is a reward that
// only fires when that feature runs. That was the bug before: GOLD_EVENTS has
// carried level_up: 50 all along, but the only caller was the CHECK-IN path, so
// levelling up by finishing a lesson -- the thing the app is for -- paid
// nothing at all.
//
// Exactly-once is enforced by the database, not by arithmetic. Each level gets
// a row in player_level_rewards under UNIQUE (player_id, level), inserted with
// ON CONFLICT DO NOTHING RETURNING, and gold is granted ONLY when that insert
// actually produced a row. So a retry, two concurrent requests, or a level
// recomputed after an XP correction all settle to one payment per level.
//
// It is also self-healing: it pays every unpaid level at or below the current
// one, not just the level just crossed. A player who levelled while the feature
// was disabled, or whose grant was interrupted half way, settles correctly on
// their next XP award instead of silently missing gold forever.

import { applyGold } from '../progression/grants';
import { LEVEL_UP_GOLD, LEVEL_MILESTONE_BONUS, REWARDS_ENABLED } from './rewards.catalog';

interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export function goldForLevel(level: number): number {
  return LEVEL_UP_GOLD + (LEVEL_MILESTONE_BONUS[level] ?? 0);
}

/**
 * Pay for every level up to `level` that has not been paid for yet.
 * Returns the gold granted on this call (0 is the normal case).
 */
export async function grantLevelRewards(
  q: Queryable,
  playerId: number,
  level: number
): Promise<{ gold: number; levels: number[] }> {
  if (!REWARDS_ENABLED || level < 2) return { gold: 0, levels: [] };

  // One query to find what is owed, rather than a round trip per level. At
  // level 15 the naive loop would be 14 queries on EVERY xp award, and a
  // tournament finish is already 43 database round trips.
  const owed = await q.query(
    `SELECT g.n::int AS level
       FROM generate_series(2, $2) AS g(n)
       LEFT JOIN player_level_rewards r ON r.player_id = $1 AND r.level = g.n
      WHERE r.id IS NULL
      ORDER BY g.n`,
    [playerId, level]
  );
  if (owed.rows.length === 0) return { gold: 0, levels: [] };

  let gold = 0;
  const levels: number[] = [];
  for (const row of owed.rows) {
    const n = Number(row.level);
    const amount = goldForLevel(n);
    // The insert is the lock. Gold moves only if this row is actually new.
    const claimed = await q.query(
      `INSERT INTO player_level_rewards (player_id, level, gold_awarded)
       VALUES ($1, $2, $3)
       ON CONFLICT (player_id, level) DO NOTHING
       RETURNING id`,
      [playerId, n, amount]
    );
    if (claimed.rows.length === 0) continue; // someone else paid it first
    await applyGold(q, playerId, amount, 'level_up', { level: n });
    gold += amount;
    levels.push(n);
  }
  return { gold, levels };
}
