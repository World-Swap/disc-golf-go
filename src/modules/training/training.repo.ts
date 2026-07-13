// src/modules/training/training.repo.ts — data access for the training library
// + completion/streak/milestone system. Completion writes use the `source`
// column + xp_log (training's own XP path, distinct from the progression grants).

import type { PoolClient } from 'pg';
import type { Queryable, Database } from '../../db/types';

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'all_levels';

export interface LessonForCompletion {
  id: number;
  category_id: number;
  xp_reward: number;
  title: string;
  category_slug: string;
}

export function createTrainingRepo(db: Database) {
  return {
    // ── categories / lessons (read) ──
    async categories(level: SkillLevel | null) {
      const sql = level
        ? `SELECT c.id, c.name, c.slug, c.description, c.icon, c.skill_level, COUNT(l.id) AS lesson_count, c.sort_order
           FROM training_categories c
           LEFT JOIN training_lessons l ON l.category_id = c.id AND l.is_active = true AND l.skill_level = $1
           WHERE c.is_active = true GROUP BY c.id HAVING COUNT(l.id) > 0 ORDER BY c.sort_order ASC`
        : `SELECT c.id, c.name, c.slug, c.description, c.icon, c.skill_level, COUNT(l.id) AS lesson_count, c.sort_order
           FROM training_categories c
           LEFT JOIN training_lessons l ON l.category_id = c.id AND l.is_active = true
           WHERE c.is_active = true GROUP BY c.id ORDER BY c.sort_order ASC`;
      const r = await db.query(sql, level ? [level] : []);
      return r.rows as Array<Record<string, unknown> & { id: number; lesson_count: string }>;
    },

    async categoryCompletionCounts(playerId: number): Promise<Map<number, number>> {
      const r = await db.query<{ category_id: number; completed_count: string }>(
        `SELECT tl.category_id, COUNT(*) AS completed_count
         FROM training_completions tc JOIN training_lessons tl ON tl.id = tc.lesson_id
         WHERE tc.player_id = $1 AND tl.is_active = true GROUP BY tl.category_id`,
        [playerId]
      );
      return new Map(r.rows.map((row) => [row.category_id, parseInt(row.completed_count, 10)]));
    },

    async categoryBySlug(slug: string) {
      const r = await db.query<{ id: number; name: string; slug: string; description: string | null; icon: string | null; skill_level: string }>(
        'SELECT id, name, slug, description, icon, skill_level FROM training_categories WHERE slug = $1 AND is_active = true',
        [slug]
      );
      return r.rows[0] ?? null;
    },

    async lessonsInCategory(categoryId: number, level: SkillLevel | null) {
      const sql = level
        ? `SELECT l.id, l.title, l.slug, l.description, l.difficulty, l.xp_reward, l.sort_order, l.content_type, l.skill_level
           FROM training_lessons l WHERE l.category_id = $1 AND l.is_active = true AND l.skill_level = $2 ORDER BY l.sort_order ASC`
        : `SELECT l.id, l.title, l.slug, l.description, l.difficulty, l.xp_reward, l.sort_order, l.content_type, l.skill_level
           FROM training_lessons l WHERE l.category_id = $1 AND l.is_active = true ORDER BY l.sort_order ASC`;
      const r = await db.query<{ id: number }>(sql, level ? [categoryId, level] : [categoryId]);
      return r.rows;
    },

    async completedLessonIdsAmong(playerId: number, lessonIds: number[]): Promise<Set<number>> {
      if (lessonIds.length === 0) return new Set();
      const r = await db.query<{ lesson_id: number }>('SELECT lesson_id FROM training_completions WHERE player_id = $1 AND lesson_id = ANY($2)', [playerId, lessonIds]);
      return new Set(r.rows.map((row) => row.lesson_id));
    },

    async lessonDetail(id: number) {
      const r = await db.query(
        `SELECT l.*, c.name AS category_name, c.slug AS category_slug, c.skill_level AS category_skill_level
         FROM training_lessons l JOIN training_categories c ON c.id = l.category_id
         WHERE l.id = $1 AND l.is_active = true`,
        [id]
      );
      return r.rows[0] ?? null;
    },

    async isCompleted(playerId: number, lessonId: number): Promise<boolean> {
      const r = await db.query('SELECT 1 FROM training_completions WHERE player_id = $1 AND lesson_id = $2', [playerId, lessonId]);
      return r.rows.length > 0;
    },

    async nextLesson(categoryId: number, sortOrder: number) {
      const r = await db.query(
        `SELECT id, title, slug, difficulty, xp_reward FROM training_lessons
         WHERE category_id = $1 AND sort_order > $2 AND is_active = true ORDER BY sort_order ASC LIMIT 1`,
        [categoryId, sortOrder]
      );
      return r.rows[0] ?? null;
    },

    async lessonResources(lessonId: number) {
      const r = await db.query(
        `SELECT id, lesson_id, title, url, author, credentials, resource_type, notes, display_order
         FROM lesson_resources WHERE lesson_id = $1 ORDER BY display_order ASC, created_at ASC`,
        [lessonId]
      );
      return r.rows;
    },

    // ── progress ──
    async progressByCategory(playerId: number) {
      const r = await db.query(
        `SELECT c.id AS category_id, c.name, c.slug, c.icon,
                COUNT(l.id) AS total_lessons, COUNT(tc.id) AS completed_lessons,
                COALESCE(SUM(l.xp_reward) FILTER (WHERE tc.id IS NOT NULL), 0) AS xp_earned,
                ROUND(COUNT(tc.id)::numeric / NULLIF(COUNT(l.id), 0) * 100, 0) AS pct_complete
         FROM training_categories c
         LEFT JOIN training_lessons l ON l.category_id = c.id AND l.is_active = true
         LEFT JOIN training_completions tc ON tc.lesson_id = l.id AND tc.player_id = $1
         WHERE c.is_active = true GROUP BY c.id ORDER BY c.sort_order ASC`,
        [playerId]
      );
      return r.rows as Array<Record<string, string>>;
    },

    async progressTotals(playerId: number) {
      const r = await db.query<{ total_lessons: string; completed_lessons: string; total_xp_earned: string }>(
        `SELECT COUNT(l.id) AS total_lessons, COUNT(tc.id) AS completed_lessons,
                COALESCE(SUM(l.xp_reward) FILTER (WHERE tc.id IS NOT NULL), 0) AS total_xp_earned
         FROM training_lessons l LEFT JOIN training_completions tc ON tc.lesson_id = l.id AND tc.player_id = $1
         WHERE l.is_active = true`,
        [playerId]
      );
      return r.rows[0]!;
    },

    // ── streak (read + seed) ──
    async streakRow(playerId: number) {
      const r = await db.query('SELECT * FROM training_streaks WHERE player_id = $1', [playerId]);
      return r.rows[0] ?? null;
    },

    async completionDatesDesc(playerId: number) {
      const r = await db.query<{ d: Date }>('SELECT DISTINCT DATE(tc.completed_at) AS d FROM training_completions tc WHERE tc.player_id = $1 ORDER BY d DESC', [playerId]);
      return r.rows;
    },

    async seedStreak(playerId: number, streakDays: number, longest: number, lastDate: Date) {
      await db.query(
        `INSERT INTO training_streaks (player_id, streak_days, longest_streak, last_date, updated_at)
         VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (player_id) DO NOTHING`,
        [playerId, streakDays, longest, lastDate]
      );
    },

    // ── milestones (read) ──
    async totalCompleted(exec: Queryable, playerId: number): Promise<number> {
      const r = await exec.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM training_completions tc JOIN training_lessons tl ON tl.id = tc.lesson_id WHERE tc.player_id = $1 AND tl.is_active = true`,
        [playerId]
      );
      return parseInt(r.rows[0]!.cnt, 10);
    },

    async earnedMilestones(playerId: number) {
      const r = await db.query<{ milestone_key: string; reward_gold: number; earned_at: Date }>(
        'SELECT milestone_key, reward_gold, earned_at FROM training_milestones WHERE player_id = $1 ORDER BY earned_at ASC',
        [playerId]
      );
      return r.rows;
    },

    async categoryCompletionRows(exec: Queryable, playerId: number) {
      const r = await exec.query<{ id: number; name: string; slug: string; icon: string | null; total_lessons: string; completed: string }>(
        `SELECT c.id, c.name, c.slug, c.icon, COUNT(l.id) AS total_lessons, COUNT(tc.id) AS completed
         FROM training_categories c
         LEFT JOIN training_lessons l ON l.category_id = c.id AND l.is_active = true
         LEFT JOIN training_completions tc ON tc.lesson_id = l.id AND tc.player_id = $1
         WHERE c.is_active = true GROUP BY c.id`,
        [playerId]
      );
      return r.rows;
    },

    // ── completion transaction primitives (client) ──
    async loadLessonForCompletion(client: PoolClient, lessonId: number): Promise<LessonForCompletion | null> {
      const r = await client.query<LessonForCompletion>(
        `SELECT l.id, l.category_id, l.xp_reward, l.title, c.slug AS category_slug
         FROM training_lessons l JOIN training_categories c ON c.id = l.category_id
         WHERE l.id = $1 AND l.is_active = true`,
        [lessonId]
      );
      return r.rows[0] ?? null;
    },

    async completionExists(client: PoolClient, playerId: number, lessonId: number): Promise<boolean> {
      const r = await client.query('SELECT id FROM training_completions WHERE player_id = $1 AND lesson_id = $2', [playerId, lessonId]);
      return r.rows.length > 0;
    },

    async insertCompletion(client: PoolClient, playerId: number, lessonId: number) {
      await client.query('INSERT INTO training_completions (player_id, lesson_id) VALUES ($1, $2)', [playerId, lessonId]);
    },

    async lockStreakRow(client: PoolClient, playerId: number) {
      const r = await client.query<{ streak_days: number; last_date: Date | null }>('SELECT streak_days, last_date FROM training_streaks WHERE player_id = $1 FOR UPDATE', [playerId]);
      return r.rows[0] ?? null;
    },

    async upsertStreak(client: PoolClient, playerId: number, streakDays: number, today: string) {
      await client.query(
        `INSERT INTO training_streaks (player_id, streak_days, last_date, updated_at) VALUES ($1, $2, $3, NOW())
         ON CONFLICT (player_id) DO UPDATE SET streak_days = EXCLUDED.streak_days, last_date = EXCLUDED.last_date, updated_at = NOW()`,
        [playerId, streakDays, today]
      );
      await client.query('UPDATE players SET training_streak_days = $1, training_streak_last_date = $2 WHERE id = $3', [streakDays, today, playerId]);
    },

    async addXp(client: PoolClient, playerId: number, amount: number, eventType: string, metadata: object, source: string) {
      await client.query('UPDATE players SET xp = xp + $1 WHERE id = $2', [amount, playerId]);
      await client.query('INSERT INTO xp_transactions (player_id, event_type, xp_amount, metadata, source) VALUES ($1, $2, $3, $4, $5)', [playerId, eventType, amount, JSON.stringify(metadata), source]);
    },

    async addXpTransactionOnly(client: PoolClient, playerId: number, eventType: string, amount: number, metadata: object, source: string) {
      await client.query('INSERT INTO xp_transactions (player_id, event_type, xp_amount, metadata, source) VALUES ($1, $2, $3, $4, $5)', [playerId, eventType, amount, JSON.stringify(metadata), source]);
    },

    async addXpLog(client: PoolClient, playerId: number, source: string, amount: number, context: object) {
      await client.query('INSERT INTO xp_log (player_id, source, amount, context) VALUES ($1, $2, $3, $4)', [playerId, source, amount, JSON.stringify(context)]);
    },

    async categoryLessonCount(client: PoolClient, categoryId: number): Promise<number> {
      const r = await client.query<{ cnt: string }>('SELECT COUNT(*) AS cnt FROM training_lessons WHERE category_id = $1 AND is_active = true', [categoryId]);
      return parseInt(r.rows[0]!.cnt, 10);
    },

    async categoryCompletedCount(client: PoolClient, playerId: number, categoryId: number): Promise<number> {
      const r = await client.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM training_completions tc JOIN training_lessons l ON l.id = tc.lesson_id WHERE tc.player_id = $1 AND l.category_id = $2`,
        [playerId, categoryId]
      );
      return parseInt(r.rows[0]!.cnt, 10);
    },

    async insertMilestone(client: PoolClient, playerId: number, key: string, gold: number) {
      const r = await client.query<{ milestone_key: string; reward_gold: number; earned_at: Date }>(
        `INSERT INTO training_milestones (player_id, milestone_key, reward_gold) VALUES ($1, $2, $3)
         ON CONFLICT (player_id, milestone_key) DO NOTHING RETURNING milestone_key, reward_gold, earned_at`,
        [playerId, key, gold]
      );
      return r.rows[0] ?? null;
    },

    async addGold(client: PoolClient, playerId: number, amount: number) {
      await client.query('UPDATE players SET gold = gold + $1 WHERE id = $2', [amount, playerId]);
    },

    async playerXp(client: PoolClient, playerId: number): Promise<number> {
      const r = await client.query<{ xp: number }>('SELECT xp FROM players WHERE id = $1', [playerId]);
      return r.rows[0]?.xp ?? 0;
    },

    // ── share ──
    async lessonTitle(lessonId: number): Promise<string | null> {
      const r = await db.query<{ title: string }>('SELECT title FROM training_lessons WHERE id = $1 AND is_active = true', [lessonId]);
      return r.rows[0]?.title ?? null;
    },

    async shareAlreadyAwarded(playerId: number, lessonId: number): Promise<boolean> {
      const r = await db.query(
        "SELECT id FROM xp_transactions WHERE player_id = $1 AND event_type = 'training_share' AND source = 'training_share' AND metadata::jsonb->>'lesson_id' = $2",
        [playerId, String(lessonId)]
      );
      return r.rows.length > 0;
    },

    async awardShare(playerId: number, lessonId: number, title: string, xpBonus: number) {
      await db.query('UPDATE players SET xp = xp + $1 WHERE id = $2', [xpBonus, playerId]);
      await db.query('INSERT INTO xp_transactions (player_id, event_type, xp_amount, metadata, source) VALUES ($1, $2, $3, $4, $5)', [playerId, 'training_share', xpBonus, JSON.stringify({ lesson_id: lessonId, lesson_title: title }), 'training_share']);
      await db.query('INSERT INTO xp_log (player_id, source, amount, context) VALUES ($1, $2, $3, $4)', [playerId, 'training_share', xpBonus, JSON.stringify({ lesson_id: lessonId, lesson_title: title })]);
    },
  };
}

export type TrainingRepo = ReturnType<typeof createTrainingRepo>;
