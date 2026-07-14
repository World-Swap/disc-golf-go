// src/modules/delete-account/delete-account.repo.ts — GDPR account deletion.

import type { PoolClient } from 'pg';
import { withTransaction } from '../../db/pool';
import type { Database } from '../../db/types';

// Player-scoped deletes in FK-safe order (children first, players last). Covers
// both training-app tables and legacy round/battle tables that may still hold
// the user's data in the live DB.
const DELETE_STATEMENTS = [
  'DELETE FROM round_tracking WHERE round_id IN (SELECT id FROM rounds WHERE player_id = $1)',
  'DELETE FROM round_analytics WHERE round_id IN (SELECT id FROM rounds WHERE player_id = $1)',
  'DELETE FROM rounds WHERE player_id = $1',
  'DELETE FROM checkins WHERE player_id = $1',
  'DELETE FROM xp_transactions WHERE player_id = $1',
  'DELETE FROM gold_transactions WHERE player_id = $1',
  'DELETE FROM xp_log WHERE player_id = $1',
  'DELETE FROM player_badges WHERE player_id = $1',
  'DELETE FROM player_challenges WHERE player_id = $1',
  'DELETE FROM player_challenge_slots WHERE player_id = $1',
  'DELETE FROM player_inventory WHERE player_id = $1',
  'DELETE FROM active_boosts WHERE player_id = $1',
  'DELETE FROM training_completions WHERE player_id = $1',
  'DELETE FROM training_streaks WHERE player_id = $1',
  'DELETE FROM training_milestones WHERE player_id = $1',
  'DELETE FROM player_daily_challenges WHERE player_id = $1',
  'DELETE FROM quest_progression WHERE player_id = $1',
  'DELETE FROM course_reviews WHERE player_id = $1',
  'DELETE FROM training_notifications WHERE player_id = $1',
  'DELETE FROM player_training_notification_settings WHERE player_id = $1',
  'DELETE FROM player_vault_training_unlocks WHERE player_id = $1',
  'DELETE FROM onboarding_events WHERE player_id = $1',
  'DELETE FROM battles WHERE challenger_id = $1 OR opponent_id = $1',
  'DELETE FROM players WHERE id = $1',
];

export function createDeleteAccountRepo(db: Database) {
  return {
    async playerContact(playerId: number): Promise<{ email: string | null; display_name: string } | null> {
      const r = await db.query<{ email: string | null; display_name: string }>('SELECT email, display_name FROM players WHERE id = $1', [playerId]);
      return r.rows[0] ?? null;
    },

    async deleteAllData(playerId: number) {
      await withTransaction(db, async (client: PoolClient) => {
        for (const sql of DELETE_STATEMENTS) {
          await client.query(sql, [playerId]);
        }
      });
    },

    async findIdByEmail(email: string): Promise<number | null> {
      const r = await db.query<{ id: number }>('SELECT id FROM players WHERE email = $1', [email]);
      return r.rows[0]?.id ?? null;
    },

    async upsertDeletionRequest(email: string) {
      await db
        .query('INSERT INTO deletion_requests (email, requested_at) VALUES ($1, NOW()) ON CONFLICT (email) DO UPDATE SET requested_at = NOW()', [email])
        .catch(() => {}); // tolerate missing table
    },
  };
}

export type DeleteAccountRepo = ReturnType<typeof createDeleteAccountRepo>;
