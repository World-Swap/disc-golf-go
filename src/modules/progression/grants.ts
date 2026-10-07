// src/modules/progression/grants.ts — award XP and gold inside a transaction,
// applying active boosts. Ported from the legacy engine. Each grant records an
// audit row (xp_transactions / gold_transactions) and updates the player.

import type { PoolClient } from 'pg';
import { XP_EVENTS, GOLD_EVENTS, type XpEvent, type GoldEvent } from './events';
import { getLevelFromXp } from './level';

/** Anything that can run a query — a pool, a client, or the Database wrapper. */
interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

/**
 * The ONE place players.xp is incremented.
 *
 * xp and the cached level move in a single statement, so level can never drift
 * from xp -- not between two awaits, not outside a transaction, not if the
 * process dies mid-grant. That drift was real: level used to be written only by
 * grantXp, while training, story quests and daily challenges each ran their own
 * `UPDATE players SET xp = xp + $1`, so the whole training loop left the cached
 * level behind.
 *
 * The level formula is the closed form of level.ts's TOTAL_XP_FOR_LEVEL(n) =
 * 125n(n-1), solved for the largest n whose threshold xp clears:
 *   n = floor((125 + sqrt(15625 + 500 * xp)) / 250)
 * It is duplicated here in SQL on purpose -- atomicity is worth more than a
 * single expression of the curve -- and `grants.test.ts` asserts the SQL and
 * getLevelFromXp agree across the whole range, so the two cannot drift apart.
 */
export async function applyXp(
  q: Queryable,
  playerId: number,
  amount: number,
  eventType: string,
  metadata: Record<string, unknown> = {},
  source: string = 'other'
): Promise<{ newXp: number; newLevel: number }> {
  // The ledger row is written HERE, not by the caller, so XP cannot move without
  // one. There used to be two ledgers -- grants and training wrote
  // xp_transactions, story quests and daily challenges wrote xp_log, and
  // training wrote BOTH for the same award, so a naive union double-counted it.
  // xp_transactions is now the single ledger; xp_log is left in place for the
  // history already in it and is no longer written.
  await q.query(
    'INSERT INTO xp_transactions (player_id, event_type, xp_amount, metadata, source) VALUES ($1, $2, $3, $4, $5)',
    [playerId, eventType, amount, JSON.stringify(metadata), source]
  );
  const r = await q.query(
    `UPDATE players
        SET xp = xp + $1,
            level = FLOOR((125 + SQRT(15625 + 500 * GREATEST(xp + $1, 0))) / 250)
      WHERE id = $2
      RETURNING xp, level`,
    [amount, playerId]
  );
  const row = r.rows[0];
  if (!row) return { newXp: 0, newLevel: 1 };
  return { newXp: Number(row.xp), newLevel: Number(row.level) };
}

interface BoostRow {
  boost_type: string;
  effect_value: number;
}

const GOLD_BOOST_CAP_PCT = 200;

/** Which subsystem an XP event came from. Drives the redeemable-XP filter. */
export function sourceFor(eventType: string): string {
  if (eventType.startsWith('game_')) return 'game';
  if (eventType.startsWith('login_streak_')) return 'login_streak';
  if (eventType.startsWith('milestone_')) return 'milestone';
  if (eventType.startsWith('battle_')) return 'battle';
  if (eventType.startsWith('challenge_')) return 'challenge';
  return 'checkin';
}

export interface XpGrant {
  amount: number;
  baseAmount: number;
  boostPercent: number;
  boostLabel: string | null;
  newXp: number;
  newLevel: number;
}

export interface GoldGrant {
  base: number;
  multiplier: number;
  amount: number;
  newGold: number | null;
}

/**
 * Grant XP for a named event, applying any active XP boost. Updates the
 * player's xp + cached level and writes an xp_transactions audit row.
 */
export async function grantXp(
  client: PoolClient,
  playerId: number,
  eventType: XpEvent,
  metadata: Record<string, unknown> = {},
  activeBoosts: BoostRow[] | null = null
): Promise<XpGrant> {
  const baseAmount: number = XP_EVENTS[eventType];
  if (baseAmount == null) throw new Error(`Unknown XP event: ${eventType}`);

  let finalAmount: number = baseAmount;
  let boostPercent = 0;
  let boostLabel: string | null = null;

  try {
    let boosts = activeBoosts;
    if (!boosts) {
      // SAVEPOINT so a failed boost lookup can't abort the outer transaction.
      await client.query('SAVEPOINT boost_check');
      try {
        const r = await client.query<BoostRow>(
          `SELECT boost_type, effect_value FROM active_boosts
           WHERE player_id = $1 AND boost_type = 'boost_xp' AND expires_at > NOW()
           ORDER BY expires_at DESC LIMIT 1`,
          [playerId]
        );
        boosts = r.rows;
        await client.query('RELEASE SAVEPOINT boost_check');
      } catch {
        await client.query('ROLLBACK TO SAVEPOINT boost_check');
        boosts = [];
      }
    }
    const xpBoost = boosts.find((b) => b.boost_type === 'boost_xp');
    if (xpBoost) {
      boostPercent = xpBoost.effect_value;
      finalAmount = Math.round(baseAmount * (1 + boostPercent / 100));
      boostLabel = `🔥 +${boostPercent}% XP boost`;
    }
  } catch {
    finalAmount = baseAmount; // non-fatal — boost failure must not block the grant
  }

  // `source` is how redeemable XP is told from farmable XP; grantXp was the only
  // writer leaving it NULL, so every check-in and Throw Lab row was untagged.
  const { newXp, newLevel } = await applyXp(
    client,
    playerId,
    finalAmount,
    eventType,
    { ...metadata, base_xp: baseAmount, boost_percent: boostPercent },
    sourceFor(eventType)
  );

  return { amount: finalAmount, baseAmount, boostPercent, boostLabel, newXp, newLevel };
}

/**
 * The ONE place players.gold is incremented, and the only one that guarantees a
 * gold_transactions row.
 *
 * Gold had the same disease as level did: nine writers, and six of them --
 * referrals, four training paths, story quests and daily challenges -- ran a
 * bare `UPDATE players SET gold = gold + $1` with no ledger row at all, so a
 * balance could not be explained from its own audit trail. That is tolerable
 * for a vanity counter and not for a currency that buys coupons.
 *
 * Spending is deliberately NOT routed through here: both spend paths already
 * take `SELECT gold ... FOR UPDATE` and re-check the balance inside the same
 * transaction, which is what makes a double-spend impossible, and that belongs
 * next to the purchase it guards.
 */
export async function applyGold(
  q: Queryable,
  playerId: number,
  amount: number,
  eventType: string,
  metadata: Record<string, unknown> = {}
): Promise<{ newGold: number }> {
  if (amount <= 0) {
    // Nothing to credit, but the caller still asked for the balance -- returning
    // 0 here would report an empty wallet rather than an unchanged one.
    const cur = await q.query('SELECT gold FROM players WHERE id = $1', [playerId]);
    return { newGold: Number(cur.rows[0]?.gold ?? 0) };
  }
  await q.query(
    'INSERT INTO gold_transactions (player_id, amount, event_type, metadata) VALUES ($1, $2, $3, $4)',
    [playerId, amount, eventType, JSON.stringify(metadata)]
  );
  const r = await q.query('UPDATE players SET gold = gold + $1 WHERE id = $2 RETURNING gold', [amount, playerId]);
  return { newGold: Number(r.rows[0]?.gold ?? 0) };
}

/** Total active gold-boost multiplier for a player (1.0 = none, capped at +200%). */
export async function getActiveGoldBoostMultiplier(client: PoolClient, playerId: number): Promise<number> {
  try {
    await client.query('SAVEPOINT gold_boost_check');
    const result = await client.query<{ effect_value: number }>(
      `SELECT ab.effect_value FROM active_boosts ab
       WHERE ab.player_id = $1 AND ab.boost_type = 'boost_gold' AND ab.expires_at > NOW()`,
      [playerId]
    );
    await client.query('RELEASE SAVEPOINT gold_boost_check');
    if (result.rows.length === 0) return 1.0;
    const totalPct = result.rows.reduce((sum, r) => sum + Number(r.effect_value), 0);
    return 1 + Math.min(totalPct, GOLD_BOOST_CAP_PCT) / 100;
  } catch {
    try {
      await client.query('ROLLBACK TO SAVEPOINT gold_boost_check');
    } catch {
      /* ignore */
    }
    return 1.0;
  }
}

/**
 * Grant gold for a named event (or an explicit override amount), applying the
 * active gold multiplier. Writes a gold_transactions audit row. Zero/negative
 * amounts are a no-op.
 */
export async function grantGold(
  client: PoolClient,
  playerId: number,
  eventType: GoldEvent,
  metadata: Record<string, unknown> = {},
  overrideAmount: number | null = null
): Promise<GoldGrant> {
  const base = overrideAmount !== null ? overrideAmount : GOLD_EVENTS[eventType] ?? 0;
  if (base <= 0) return { base: 0, multiplier: 1, amount: 0, newGold: null };

  const multiplier = await getActiveGoldBoostMultiplier(client, playerId);
  const amount = Math.round(base * multiplier);

  const { newGold } = await applyGold(client, playerId, amount, eventType, metadata);

  return { base, multiplier, amount, newGold };
}
