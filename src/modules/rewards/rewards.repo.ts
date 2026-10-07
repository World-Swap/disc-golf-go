// src/modules/rewards/rewards.repo.ts — data access for coupons.

import type { PoolClient } from 'pg';
import type { Database, Queryable } from '../../db/types';

export interface CouponRow {
  id: number;
  code: string;
  player_id: number;
  type_key: string;
  kind: string;
  title: string;
  terms: string;
  face_value_usd: number;
  gold_spent: number;
  lessons_at_issue: number | null;
  status: string;
  issued_at: Date;
  expires_at: Date;
  redeemed_at: Date | null;
}

/** A coupon with the account it belongs to, for the admin console. */
export interface AdminCouponRow extends CouponRow {
  username: string | null;
  email: string | null;
}

export function createRewardsRepo(db: Database) {
  return {
    /** FOR UPDATE: the lock that makes a concurrent double-redeem impossible. */
    /**
     * Serialise redemptions for one player.
     *
     * This used to be lockGold, which locked the row AND returned the balance --
     * the balance half is gone now that coupons are earned from lessons, but the
     * LOCK is still needed: without it two concurrent taps both read the same
     * entitlement and both pass.
     */
    async lockPlayer(client: PoolClient, playerId: number): Promise<boolean> {
      const r = await client.query('SELECT id FROM players WHERE id = $1 FOR UPDATE', [playerId]);
      return r.rows.length > 0;
    },

    /** Lessons this player has completed. The basis of coupon entitlement. */
    async lessonsCompleted(client: PoolClient, playerId: number): Promise<number> {
      const r = await client.query<{ n: string }>(
        'SELECT COUNT(*)::text AS n FROM training_completions WHERE player_id = $1',
        [playerId]
      );
      return Number(r.rows[0]?.n ?? 0);
    },

    /**
     * Coupons ever issued to this player, voided ones excluded.
     *
     * Counted over ALL TIME, not a window: the entitlement is
     * floor(lessons / LESSONS_PER_COUPON) minus this, so the same lessons can
     * never pay a second coupon however long ago the first was taken.
     */
    async countIssuedEver(client: PoolClient, playerId: number): Promise<number> {
      const r = await client.query<{ n: string }>(
        "SELECT COUNT(*)::text AS n FROM coupons WHERE player_id = $1 AND status <> 'void'",
        [playerId]
      );
      return Number(r.rows[0]?.n ?? 0);
    },

    async lockGold(client: PoolClient, playerId: number): Promise<number | null> {
      const r = await client.query<{ gold: number }>('SELECT gold FROM players WHERE id = $1 FOR UPDATE', [playerId]);
      return r.rows[0] ? Number(r.rows[0].gold) : null;
    },

    async spendGold(client: PoolClient, playerId: number, amount: number, typeKey: string) {
      await client.query('UPDATE players SET gold = gold - $1 WHERE id = $2', [amount, playerId]);
      await client.query(
        `INSERT INTO gold_transactions (player_id, amount, event_type, metadata) VALUES ($1, $2, 'coupon_redeem', $3)`,
        [playerId, -amount, JSON.stringify({ type_key: typeKey })]
      );
    },

    /** How many coupons this player has taken in the trailing window. */
    async countRecent(client: PoolClient, playerId: number, sinceDays: number): Promise<number> {
      const r = await client.query<{ n: string }>(
        `SELECT COUNT(*) AS n FROM coupons
          WHERE player_id = $1 AND status <> 'void' AND issued_at > NOW() - ($2 || ' days')::interval`,
        [playerId, String(sinceDays)]
      );
      return parseInt(r.rows[0]?.n ?? '0', 10);
    },

    async insertCoupon(client: PoolClient, c: Omit<CouponRow, 'id' | 'issued_at' | 'redeemed_at' | 'status'>) {
      const r = await client.query<CouponRow>(
        `INSERT INTO coupons (code, player_id, type_key, kind, title, terms, face_value_usd,
                              gold_spent, lessons_at_issue, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [c.code, c.player_id, c.type_key, c.kind, c.title, c.terms, c.face_value_usd,
         c.gold_spent, c.lessons_at_issue, c.expires_at]
      );
      return r.rows[0]!;
    },

    async markEmailed(id: number) {
      await db.query('UPDATE coupons SET emailed_at = NOW() WHERE id = $1', [id]);
    },

    async listForPlayer(playerId: number): Promise<CouponRow[]> {
      const r = await db.query<CouponRow>(
        'SELECT * FROM coupons WHERE player_id = $1 ORDER BY issued_at DESC',
        [playerId]
      );
      return r.rows;
    },

    // `client` is optional on both of these so a multi-coupon redemption can run
    // inside ONE transaction and roll back as a unit. Default to the pool for
    // the single-coupon callers, which need no transaction.
    async findByCode(code: string, client?: PoolClient): Promise<CouponRow | null> {
      const q: Queryable = client ?? db;
      const r = await q.query<CouponRow>('SELECT * FROM coupons WHERE code = $1', [code]);
      return r.rows[0] ?? null;
    },

    /**
     * Mark redeemed, but ONLY from 'issued' and only before it expires -- the
     * WHERE is the guard, so two people scanning the same code at a desk cannot
     * both succeed. Returns null when it was already used or has lapsed.
     */
    async markRedeemed(code: string, note: string, client?: PoolClient): Promise<CouponRow | null> {
      const q: Queryable = client ?? db;
      const r = await q.query<CouponRow>(
        `UPDATE coupons
            SET status = 'redeemed', redeemed_at = NOW(), redeemed_note = $2
          WHERE code = $1 AND status = 'issued' AND expires_at > NOW()
          RETURNING *`,
        [code, note]
      );
      return r.rows[0] ?? null;
    },

    /**
     * Every coupon ever issued, newest first, with the player it belongs to.
     *
     * Deliberately unpaginated, and the admin overview buckets these in JS
     * rather than counting them in SQL. The reason is that "available" means
     * status = 'issued' AND NOT YET EXPIRED, and that rule already exists in
     * one place (couponStatus). A SQL summary would be a SECOND copy of it, free
     * to disagree with the codes printed on the same page -- which is the exact
     * failure this repo keeps recording. The table is small by construction:
     * issuance is capped at one per account per 30 days, so 141 players cannot
     * produce more than a few thousand rows in years. If it ever does, move the
     * summary into SQL and pin the two definitions together with a test, the way
     * level-sql.test.ts does.
     *
     * LEFT JOIN because coupons.player_id carries no foreign key: a deleted
     * account leaves its coupons behind, and a code that is still presentable at
     * a counter must still be findable here.
     */
    async adminAllCoupons(): Promise<AdminCouponRow[]> {
      const r = await db.query<AdminCouponRow>(
        `SELECT c.*, p.username, p.email
           FROM coupons c
           LEFT JOIN players p ON p.id = c.player_id
          ORDER BY c.issued_at DESC`
      );
      return r.rows;
    },

    /**
     * Lessons completed per player, for everyone who has completed any.
     * Computed from training_completions, not a stored counter, so it cannot
     * drift from the entitlement redeem() enforces.
     */
    async adminLessonCounts(): Promise<Array<{ player_id: number; username: string | null; email: string | null; lessons: number }>> {
      const r = await db.query<{ player_id: number; username: string | null; email: string | null; lessons: string }>(
        `SELECT tc.player_id, p.username, p.email, COUNT(*) AS lessons
           FROM training_completions tc
           LEFT JOIN players p ON p.id = tc.player_id
          GROUP BY tc.player_id, p.username, p.email`
      );
      return r.rows.map((x) => ({
        player_id: x.player_id,
        username: x.username,
        email: x.email,
        lessons: Number(x.lessons),
      }));
    },

    async playerEmail(playerId: number): Promise<{ email: string | null; username: string | null } | null> {
      const r = await db.query<{ email: string | null; username: string | null }>(
        'SELECT email, username FROM players WHERE id = $1',
        [playerId]
      );
      return r.rows[0] ?? null;
    },
  };
}

export type RewardsRepo = ReturnType<typeof createRewardsRepo>;
