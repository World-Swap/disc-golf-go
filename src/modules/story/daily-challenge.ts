// src/modules/story/daily-challenge.ts — per-player daily challenge assignment
// + progress. Assigns one random active pool challenge per UTC day.

import type { Database } from '../../db/types';
import { applyXp, applyGold } from '../progression/grants';

export interface DailyChallengeRow {
  id: number;
  challenge_date: string;
  title: string;
  description: string | null;
  challenge_type: string;
  target_value: number;
  progress: number;
  xp_reward: number;
  gold_reward: number;
  training_slug: string | null;
  completed: boolean;
  completed_at: Date | null;
}

const today = () => new Date().toISOString().split('T')[0]!;

export async function getOrCreateDailyChallenge(db: Database, playerId: number): Promise<DailyChallengeRow | null> {
  const day = today();
  const existing = await db.query<DailyChallengeRow>('SELECT * FROM player_daily_challenges WHERE player_id = $1 AND challenge_date = $2', [playerId, day]);
  if (existing.rows[0]) return existing.rows[0];

  const pool = await db.query<{ id: number; title: string; description: string | null; challenge_type: string; target_value: number; xp_reward: number; gold_reward: number; training_slug: string | null }>(
    'SELECT * FROM daily_challenge_pool WHERE is_active = TRUE ORDER BY RANDOM() LIMIT 1'
  );
  const c = pool.rows[0];
  if (!c) return null;

  await db.query(
    `INSERT INTO player_daily_challenges
       (player_id, challenge_date, pool_id, title, description, challenge_type, target_value, xp_reward, gold_reward, training_slug)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [playerId, day, c.id, c.title, c.description, c.challenge_type, c.target_value, c.xp_reward, c.gold_reward, c.training_slug]
  );

  const assigned = await db.query<DailyChallengeRow>('SELECT * FROM player_daily_challenges WHERE player_id = $1 AND challenge_date = $2', [playerId, day]);
  return assigned.rows[0] ?? null;
}

export async function advanceDailyChallenge(db: Database, playerId: number, challengeDate: string | null, delta = 1): Promise<{ completed: boolean; row: DailyChallengeRow | null }> {
  const day = challengeDate || today();
  const res = await db.query<DailyChallengeRow>(
    `UPDATE player_daily_challenges
       SET progress = progress + $1,
           completed = CASE WHEN progress + $1 >= target_value THEN TRUE ELSE completed END,
           completed_at = CASE WHEN progress + $1 >= target_value THEN NOW() ELSE completed_at END
     WHERE player_id = $2 AND challenge_date = $3 AND completed = FALSE
     RETURNING *`,
    [delta, playerId, day]
  );
  const updated = res.rows[0];
  if (!updated) return { completed: false, row: null };

  const justCompleted = updated.progress >= updated.target_value;
  if (justCompleted) {
    if (updated.xp_reward > 0) {
      await applyXp(db, playerId, updated.xp_reward, 'daily_challenge_complete', { title: updated.title }, 'daily_challenge');
    }
    if (updated.gold_reward > 0) {
      await applyGold(db, playerId, updated.gold_reward, 'daily_challenge', { title: updated.title });
    }
  }
  return { completed: justCompleted, row: updated };
}
