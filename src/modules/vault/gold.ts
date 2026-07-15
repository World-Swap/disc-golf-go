// src/modules/vault/gold.ts — vault-side gold/boost/inventory utilities shared
// by challenges, battles, and rounds. This is the legacy `awardGold` path
// (single boost_gold percentage), distinct from progression.grantGold (which
// sums boosts). Both are preserved intentionally.

import type { Queryable } from '../../db/types';

// Vault gold award rates (base, pre-boost). Difficulty-keyed for challenges;
// distinct from progression's cadence-keyed GOLD_EVENTS.
export const GOLD_EVENTS: Record<string, number> = {
  checkin_new_course: 50,
  checkin_return: 10,
  round_complete: 30,
  challenge_easy: 25,
  challenge_medium: 60,
  challenge_hard: 125,
  challenge_legendary: 300,
  battle_victory: 50,
};

export interface BoostRow {
  id: number;
  boost_type: string;
  effect_value: number;
  expires_at: Date;
  name: string | null;
  icon: string | null;
}

export interface GoldAward {
  baseAmount: number;
  finalAmount: number;
  boostPercent: number;
  newBalance: number;
}

/** Active (non-expired) boosts for a player. Returns [] on failure. */
export async function getActiveBoosts(db: Queryable, playerId: number): Promise<BoostRow[]> {
  try {
    const r = await db.query<BoostRow>(
      `SELECT ab.id, ab.boost_type, ab.effect_value, ab.expires_at, vi.name, vi.icon
       FROM active_boosts ab JOIN vault_items vi ON vi.id = ab.item_id
       WHERE ab.player_id = $1 AND ab.expires_at > NOW()
       ORDER BY ab.boost_type, ab.expires_at DESC`,
      [playerId]
    );
    return r.rows;
  } catch (err) {
    console.error('[vault] getActiveBoosts failed:', (err as Error).message);
    return [];
  }
}

export function applyGoldBoost(baseAmount: number, boosts: BoostRow[] | null) {
  const boost = (boosts ?? []).find((b) => b.boost_type === 'boost_gold');
  if (!boost) return { baseAmount, boostedAmount: baseAmount, boostPercent: 0 };
  return { baseAmount, boostedAmount: Math.round(baseAmount * (1 + boost.effect_value / 100)), boostPercent: boost.effect_value };
}

/** Award gold applying the active gold boost. Writes a gold_transactions row. */
export async function awardGold(
  db: Queryable,
  playerId: number,
  reason: string,
  baseAmount: number,
  activeBoosts: BoostRow[] | null = null,
  metadata: Record<string, unknown> = {}
): Promise<GoldAward> {
  const boosts = activeBoosts ?? (await getActiveBoosts(db, playerId));
  const { boostedAmount, boostPercent } = applyGoldBoost(baseAmount, boosts);

  await db.query(
    'INSERT INTO gold_transactions (player_id, amount, event_type, metadata) VALUES ($1, $2, $3, $4)',
    [playerId, boostedAmount, reason, JSON.stringify({ ...metadata, base_amount: baseAmount, boost_percent: boostPercent })]
  );
  const r = await db.query<{ gold: number }>('UPDATE players SET gold = gold + $1 WHERE id = $2 RETURNING gold', [boostedAmount, playerId]);
  return { baseAmount, finalAmount: boostedAmount, boostPercent, newBalance: r.rows[0]!.gold };
}

/** Upsert an item into a player's inventory (quantity +1 on conflict). */
export async function addToInventory(db: Queryable, playerId: number, itemId: number, acquiredVia = 'drop') {
  try {
    await db.query(
      `INSERT INTO player_inventory (player_id, item_id, quantity, acquired_via) VALUES ($1, $2, 1, $3)
       ON CONFLICT (player_id, item_id) DO UPDATE SET quantity = player_inventory.quantity + 1`,
      [playerId, itemId, acquiredVia]
    );
  } catch (err) {
    console.error('[vault] addToInventory failed:', (err as Error).message);
  }
}
