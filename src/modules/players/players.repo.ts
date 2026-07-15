// src/modules/players/players.repo.ts — data access for the players feature.
// All SQL against players + related progression/training tables lives here.

import type { PoolClient } from 'pg';
import type { Queryable, Database } from '../../db/types';

export interface PlayerFullRow {
  id: number;
  player_uuid: string;
  display_name: string;
  username: string | null;
  email: string | null;
  profile_photo_url: string | null;
  xp: number;
  level: number | null;
  login_streak: number | null;
  best_streak: number | null;
  battle_wins: number | null;
  battle_losses: number | null;
  win_streak: number | null;
  total_rounds: number | null;
  total_birdies: number | null;
  total_aces: number | null;
  gold: number | null;
  last_login_date: Date | null;
  created_at: Date;
}

// Player-scoped tables wiped by reset-progress (also audited before/after).
export const RESETTABLE_TABLES = [
  'xp_transactions',
  'gold_transactions',
  'player_badges',
  'player_challenges',
  'player_inventory',
  'active_boosts',
  'training_streaks',
  'training_completions',
  'player_daily_challenges',
  'quest_progression',
  'player_vault_training_unlocks',
  'player_achievements',
] as const;

export function createPlayersRepo(db: Database) {
  return {
    async findFullById(id: number): Promise<PlayerFullRow | null> {
      const r = await db.query<PlayerFullRow>(
        `SELECT id, player_uuid, display_name, username, email, profile_photo_url,
                xp, level, login_streak, best_streak, battle_wins, battle_losses, win_streak,
                total_rounds, total_birdies, total_aces, gold, last_login_date, created_at
         FROM players WHERE id = $1`,
        [id]
      );
      return r.rows[0] ?? null;
    },

    async checkinStats(id: number): Promise<{ total_checkins: number; unique_courses: number }> {
      const r = await db.query<{ total_checkins: string; unique_courses: string }>(
        `SELECT COUNT(*) AS total_checkins, COUNT(DISTINCT course_id) AS unique_courses
         FROM checkins WHERE player_id = $1`,
        [id]
      );
      return {
        total_checkins: parseInt(r.rows[0]?.total_checkins ?? '0', 10),
        unique_courses: parseInt(r.rows[0]?.unique_courses ?? '0', 10),
      };
    },

    async badgeCount(id: number): Promise<number> {
      const r = await db.query<{ cnt: string }>('SELECT COUNT(*) AS cnt FROM player_badges WHERE player_id = $1', [id]);
      return parseInt(r.rows[0]?.cnt ?? '0', 10);
    },

    async recentCheckins(id: number, limit = 5) {
      const r = await db.query(
        `SELECT ci.id, ci.checked_in_at, ci.xp_earned, ci.weather_condition, ci.is_round_complete,
                c.name AS course_name, c.city, c.state
         FROM checkins ci JOIN courses c ON c.id = ci.course_id
         WHERE ci.player_id = $1 ORDER BY ci.checked_in_at DESC LIMIT $2`,
        [id, limit]
      );
      return r.rows;
    },

    async trainingSummary(id: number) {
      const [completed, total, streak, mastered] = await Promise.all([
        db.query<{ n: string }>('SELECT COUNT(DISTINCT lesson_id) AS n FROM training_completions WHERE player_id = $1', [id]),
        db.query<{ n: string }>('SELECT COUNT(*) AS n FROM training_lessons WHERE is_active IS NOT FALSE'),
        db.query<{ streak_days: number }>('SELECT streak_days FROM training_streaks WHERE player_id = $1', [id]),
        db.query<{ n: string }>(
          `SELECT COUNT(*) AS n FROM (
             SELECT l.category_id
             FROM training_lessons l
             JOIN training_categories tc2 ON tc2.id = l.category_id
             JOIN training_completions tc3 ON tc3.lesson_id = l.id AND tc3.player_id = $1
             WHERE l.is_active IS NOT FALSE AND tc2.is_active IS NOT FALSE
             GROUP BY l.category_id
             HAVING COUNT(DISTINCT l.id) = COUNT(DISTINCT tc3.lesson_id) AND COUNT(DISTINCT tc3.lesson_id) > 0
           ) sub`,
          [id]
        ),
      ]);
      return {
        lessons_completed: parseInt(completed.rows[0]?.n ?? '0', 10),
        total_lessons: parseInt(total.rows[0]?.n ?? '0', 10),
        training_streak_days: Number(streak.rows[0]?.streak_days ?? 0),
        categories_mastered: parseInt(mastered.rows[0]?.n ?? '0', 10),
      };
    },

    // ── login-streak helpers (transaction-bound) ──
    async updateLoginStreak(client: PoolClient, id: number, today: string, streak: number, best: number) {
      await client.query('UPDATE players SET last_login_date = $1, login_streak = $2, best_streak = $3 WHERE id = $4', [
        today,
        streak,
        best,
        id,
      ]);
    },

    async earnedBadgeKeys(client: PoolClient, id: number): Promise<Set<string>> {
      const r = await client.query<{ category: string; tier: string }>('SELECT category, tier FROM player_badges WHERE player_id = $1', [id]);
      return new Set(r.rows.map((row) => `${row.category}:${row.tier}`));
    },

    async insertBadge(client: PoolClient, id: number, category: string, tier: string) {
      await client.query('INSERT INTO player_badges (player_id, category, tier) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [
        id,
        category,
        tier,
      ]);
    },

    // ── badges listing ──
    async listEarnedBadges(id: number) {
      const r = await db.query<{ category: string; tier: string; earned_at: Date }>(
        'SELECT category, tier, earned_at FROM player_badges WHERE player_id = $1',
        [id]
      );
      return r.rows;
    },

    // ── progress (exploration) ──
    async progressByState(id: number) {
      const r = await db.query<{ state: string; country: string; total: string; visited: string }>(
        `SELECT c.state, COALESCE(c.country, 'US') AS country,
                COUNT(DISTINCT c.id) AS total,
                COUNT(DISTINCT ci.course_id) AS visited
         FROM courses c
         LEFT JOIN checkins ci ON ci.course_id = c.id AND ci.player_id = $1
         WHERE c.is_active IS NOT FALSE AND c.state IS NOT NULL AND c.state != ''
         GROUP BY c.state, COALESCE(c.country, 'US')
         ORDER BY COUNT(DISTINCT ci.course_id) DESC, COUNT(DISTINCT c.id) ASC`,
        [id]
      );
      return r.rows;
    },

    async explorationBadges(id: number) {
      const r = await db.query<{ category: string; tier: string; earned_at: Date }>(
        `SELECT category, tier, earned_at FROM player_badges
         WHERE player_id = $1 AND category IN ('explorer', 'traveler', 'state_champion', 'course_conqueror')
         ORDER BY earned_at ASC`,
        [id]
      );
      return r.rows;
    },

    // ── xp history ──
    async xpTransactions(id: number, limit: number) {
      const r = await db.query(
        `SELECT id, event_type, xp_amount, metadata, created_at, COALESCE(source, 'unknown') AS source
         FROM xp_transactions WHERE player_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [id, limit]
      );
      return r.rows;
    },

    async xpBreakdown(id: number) {
      const r = await db.query<{ source: string; count: string; total_xp: string }>(
        `SELECT COALESCE(source, 'other') AS source, COUNT(*) AS count, SUM(xp_amount) AS total_xp
         FROM xp_transactions WHERE player_id = $1
         GROUP BY COALESCE(source, 'other') ORDER BY total_xp DESC`,
        [id]
      );
      return r.rows.map((x) => ({ source: x.source, count: parseInt(x.count, 10), total_xp: parseInt(x.total_xp, 10) }));
    },

    async trainingStreakRow(id: number) {
      const r = await db.query('SELECT streak_days, last_date FROM training_streaks WHERE player_id = $1', [id]);
      return r.rows[0] ?? null;
    },

    async trainingXpStats(id: number) {
      const r = await db.query<{ lessons_completed: string; categories_started: string; total_lesson_xp: string }>(
        `SELECT COUNT(DISTINCT tc.lesson_id) AS lessons_completed,
                COUNT(DISTINCT l.category_id) AS categories_started,
                SUM(l.xp_reward) AS total_lesson_xp
         FROM training_completions tc JOIN training_lessons l ON l.id = tc.lesson_id
         WHERE tc.player_id = $1`,
        [id]
      );
      const row = r.rows[0];
      return {
        lessons_completed: parseInt(row?.lessons_completed ?? '0', 10),
        categories_started: parseInt(row?.categories_started ?? '0', 10),
        total_lesson_xp: parseInt(row?.total_lesson_xp ?? '0', 10),
      };
    },

    async xpMilestones(id: number) {
      const r = await db.query<{ event_type: string; created_at: Date }>(
        `SELECT DISTINCT ON (event_type) event_type, created_at
         FROM xp_transactions
         WHERE player_id = $1 AND (event_type LIKE 'milestone_%' OR event_type LIKE 'training_category%')
         ORDER BY event_type, created_at ASC`,
        [id]
      );
      return r.rows.map((x) => ({ event: x.event_type, date: x.created_at }));
    },

    async weeklyXp(id: number, weekStartIso: string): Promise<number> {
      const r = await db.query<{ weekly_xp: string }>(
        `SELECT COALESCE(SUM(xp_amount), 0) AS weekly_xp FROM xp_transactions WHERE player_id = $1 AND created_at >= $2`,
        [id, weekStartIso]
      );
      return parseInt(r.rows[0]?.weekly_xp ?? '0', 10);
    },

    async playerXp(id: number): Promise<number> {
      const r = await db.query<{ xp: number }>('SELECT xp FROM players WHERE id = $1', [id]);
      return r.rows[0]?.xp ?? 0;
    },

    // ── profile update ──
    async usernameTaken(id: number, username: string): Promise<boolean> {
      const r = await db.query('SELECT id FROM players WHERE username = $1 AND id != $2', [username, id]);
      return r.rows.length > 0;
    },

    async updateProfile(id: number, sets: string[], values: unknown[]) {
      const r = await db.query<PlayerFullRow>(
        `UPDATE players SET ${sets.join(', ')} WHERE id = $${values.length + 1}
         RETURNING id, display_name, username, email, profile_photo_url, xp, level`,
        [...values, id]
      );
      return r.rows[0]!;
    },

    // ── reset progress ──
    async countTable(client: Queryable, table: string, id: number): Promise<number> {
      const r = await client.query<{ count: string }>(`SELECT COUNT(*) FROM ${table} WHERE player_id = $1`, [id]);
      return parseInt(r.rows[0]!.count, 10);
    },

    async deleteFromTable(client: PoolClient, table: string, id: number) {
      await client.query(`DELETE FROM ${table} WHERE player_id = $1`, [id]);
    },

    async resetPlayerStats(client: PoolClient, id: number) {
      await client.query(
        `UPDATE players SET
           xp = 0, gold = 0, level = 1, login_streak = 0, best_streak = 0,
           battle_wins = 0, battle_losses = 0, win_streak = 0, total_rounds = 0,
           total_birdies = 0, total_aces = 0, training_streak_days = 0,
           training_streak_last_date = NULL, last_login_date = NULL
         WHERE id = $1`,
        [id]
      );
    },
  };
}

export type PlayersRepo = ReturnType<typeof createPlayersRepo>;
