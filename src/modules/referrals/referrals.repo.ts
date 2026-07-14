// src/modules/referrals/referrals.repo.ts — referral codes, activations, events.

import type { Queryable } from '../../db/types';

export function createReferralsRepo(db: Queryable) {
  return {
    async codes(playerId: number) {
      const r = await db.query<{ code: string; created_at: Date }>('SELECT code, created_at FROM referral_codes WHERE player_id = $1', [playerId]);
      return r.rows;
    },

    async activations(playerId: number) {
      const r = await db.query(
        `SELECT ra.code_used, ra.status, ra.reward_type, ra.reward_amount, ra.rewarded_at,
                ra.friend_id, ra.expires_at, ra.created_at, p.display_name AS friend_name
         FROM referral_activations ra LEFT JOIN players p ON p.id = ra.friend_id
         WHERE ra.referrer_id = $1 ORDER BY ra.created_at DESC LIMIT 50`,
        [playerId]
      );
      return r.rows as Array<{ code_used: string; status: string; reward_type: string | null; reward_amount: number | null; rewarded_at: Date | null; friend_id: number | null; friend_name: string | null; expires_at: Date; created_at: Date }>;
    },

    async playerNameGold(playerId: number) {
      const r = await db.query<{ display_name: string; gold: number }>('SELECT display_name, gold FROM players WHERE id = $1', [playerId]);
      return r.rows[0] ?? null;
    },

    async existingCode(playerId: number): Promise<string | null> {
      const r = await db.query<{ code: string }>('SELECT code FROM referral_codes WHERE player_id = $1', [playerId]);
      return r.rows[0]?.code ?? null;
    },

    async codeTaken(code: string): Promise<boolean> {
      const r = await db.query('SELECT id FROM referral_codes WHERE code = $1', [code]);
      return r.rows.length > 0;
    },

    async insertCode(playerId: number, code: string) {
      await db.query('INSERT INTO referral_codes (player_id, code) VALUES ($1, $2)', [playerId, code]);
    },

    async codeWithReferrer(code: string) {
      const r = await db.query<{ code: string; referrer_id: number; referrer_name: string }>(
        `SELECT rc.code, p.id AS referrer_id, p.display_name AS referrer_name FROM referral_codes rc JOIN players p ON p.id = rc.player_id WHERE rc.code = $1`,
        [code]
      );
      return r.rows[0] ?? null;
    },

    async codeOwner(code: string): Promise<number | null> {
      const r = await db.query<{ player_id: number }>('SELECT player_id FROM referral_codes WHERE code = $1', [code]);
      return r.rows[0]?.player_id ?? null;
    },

    async upsertActivation(referrerId: number, friendId: number, code: string, expiresAt: string) {
      await db.query(
        `INSERT INTO referral_activations (referrer_id, friend_id, code_used, expires_at, status)
         VALUES ($1, $2, $3, $4, 'activated')
         ON CONFLICT (referrer_id, code_used) DO UPDATE SET
           friend_id = $2,
           status = CASE WHEN referral_activations.status = 'pending' THEN 'activated' ELSE referral_activations.status END,
           expires_at = CASE WHEN referral_activations.status = 'pending' THEN $4 ELSE referral_activations.expires_at END`,
        [referrerId, friendId, code, expiresAt]
      );
    },

    async activatableFor(friendId: number) {
      const r = await db.query<{ id: number; referrer_id: number; code_used: string; expires_at: Date; status: string }>(
        `SELECT id, referrer_id, code_used, expires_at, status FROM referral_activations WHERE friend_id = $1 AND status = 'activated' AND expires_at > now()`,
        [friendId]
      );
      return r.rows;
    },

    async grantGold(playerId: number, amount: number) {
      await db.query('UPDATE players SET gold = gold + $1 WHERE id = $2', [amount, playerId]);
    },

    async markRewarded(activationId: number, amount: number) {
      await db.query(
        `UPDATE referral_activations SET status = 'rewarded', reward_type = 'gold', reward_amount = $1, rewarded_at = now() WHERE id = $2`,
        [amount, activationId]
      );
    },

    async xpLog(playerId: number, source: string, amount: number, context: object) {
      await db.query('INSERT INTO xp_log (player_id, source, amount, context) VALUES ($1, $2, $3, $4)', [playerId, source, amount, JSON.stringify(context)]);
    },

    trackEvent(eventType: string, referralCode: string, referrerId: number | null, userId: number | null, metadata: object = {}) {
      void db
        .query('INSERT INTO referral_events (event_type, referral_code, referrer_id, user_id, metadata, created_at) VALUES ($1, $2, $3, $4, $5, now())', [eventType, referralCode, referrerId, userId, JSON.stringify(metadata)])
        .catch((err) => console.error('[referrals] trackEvent failed:', (err as Error).message));
    },
  };
}

export type ReferralsRepo = ReturnType<typeof createReferralsRepo>;
