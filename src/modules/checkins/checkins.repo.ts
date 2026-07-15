// src/modules/checkins/checkins.repo.ts — data access for check-ins. The POST
// flow runs in a transaction, so most methods take a PoolClient; the read-only
// endpoints use the pool.

import type { PoolClient } from 'pg';
import type { Queryable, Database } from '../../db/types';
import type { BadgeStats } from '../progression';

export interface PlayerRow {
  id: number;
  display_name: string;
  xp: number;
  level: number | null;
  battle_wins: number | null;
  total_rounds: number | null;
}

export interface CourseRow {
  id: number;
  name: string;
  city: string | null;
  state: string | null;
  lat: number;
  lng: number;
}

const startOfUtcDayIso = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
};

export { startOfUtcDayIso };

async function count(client: Queryable, sql: string, params: unknown[]): Promise<number> {
  const r = await client.query<{ cnt: string }>(sql, params);
  return parseInt(r.rows[0]?.cnt ?? '0', 10);
}

export function createCheckinsRepo(db: Database) {
  return {
    async loadPlayer(client: PoolClient, id: number): Promise<PlayerRow | null> {
      const r = await client.query<PlayerRow>(
        'SELECT id, display_name, xp, level, battle_wins, total_rounds FROM players WHERE id = $1',
        [id]
      );
      return r.rows[0] ?? null;
    },

    async loadCourse(client: PoolClient, id: number): Promise<CourseRow | null> {
      const r = await client.query<CourseRow>('SELECT id, name, city, state, lat, lng FROM courses WHERE id = $1', [id]);
      return r.rows[0] ?? null;
    },

    sameCourseTodayCount(client: PoolClient, playerId: number, courseId: number, sinceIso: string) {
      return count(client, 'SELECT COUNT(*) AS cnt FROM checkins WHERE player_id = $1 AND course_id = $2 AND checked_in_at >= $3', [playerId, courseId, sinceIso]);
    },

    prevVisitCount(client: PoolClient, playerId: number, courseId: number) {
      return count(client, 'SELECT COUNT(*) AS cnt FROM checkins WHERE player_id = $1 AND course_id = $2', [playerId, courseId]);
    },

    courseCheckinCount(client: PoolClient, courseId: number) {
      return count(client, 'SELECT COUNT(*) AS cnt FROM checkins WHERE course_id = $1', [courseId]);
    },

    dailyCheckinCount(client: PoolClient, playerId: number, sinceIso: string) {
      return count(client, 'SELECT COUNT(*) AS cnt FROM checkins WHERE player_id = $1 AND checked_in_at >= $2', [playerId, sinceIso]);
    },

    async insertCheckin(
      client: PoolClient,
      input: { playerId: number; courseId: number; isRoundComplete: boolean; holesLogged: number | null; weatherCondition: string | null; eventFlags: object }
    ): Promise<number> {
      const r = await client.query<{ id: number }>(
        `INSERT INTO checkins (player_id, course_id, xp_earned, is_round_complete, holes_logged, weather_condition, event_flags)
         VALUES ($1, $2, 0, $3, $4, $5, $6) RETURNING id`,
        [input.playerId, input.courseId, input.isRoundComplete, input.holesLogged, input.weatherCondition, JSON.stringify(input.eventFlags)]
      );
      return r.rows[0]!.id;
    },

    async updateCheckinXp(client: PoolClient, checkinId: number, xp: number) {
      await client.query('UPDATE checkins SET xp_earned = $1 WHERE id = $2', [xp, checkinId]);
    },

    async incrementTotalRounds(client: PoolClient, playerId: number) {
      await client.query('UPDATE players SET total_rounds = total_rounds + 1 WHERE id = $1', [playerId]);
    },

    async postXpStats(client: PoolClient, playerId: number) {
      const r = await client.query<{ total_checkins: string; unique_courses: string }>(
        'SELECT COUNT(*) AS total_checkins, COUNT(DISTINCT course_id) AS unique_courses FROM checkins WHERE player_id = $1',
        [playerId]
      );
      return { totalCheckins: parseInt(r.rows[0]!.total_checkins, 10), uniqueCourses: parseInt(r.rows[0]!.unique_courses, 10) };
    },

    async playerTotalRounds(client: PoolClient, playerId: number): Promise<number> {
      const r = await client.query<{ total_rounds: string }>('SELECT total_rounds FROM players WHERE id = $1', [playerId]);
      return parseInt(r.rows[0]?.total_rounds ?? '0', 10);
    },

    completedStatesCount(client: PoolClient, playerId: number) {
      return count(
        client,
        `SELECT COUNT(*) AS cnt FROM (
           SELECT c.state
           FROM checkins ci JOIN courses c ON c.id = ci.course_id
           WHERE ci.player_id = $1 AND c.state IS NOT NULL AND c.state != ''
           GROUP BY c.state
           HAVING COUNT(DISTINCT ci.course_id) = (SELECT COUNT(*) FROM courses cc WHERE cc.state = c.state AND cc.is_active IS NOT FALSE)
         ) t`,
        [playerId]
      );
    },

    /** Aggregate every stat the badge engine needs for this player. */
    async badgeStats(client: PoolClient, playerId: number, completedStates: number): Promise<BadgeStats> {
      const bsr = (
        await client.query<Record<string, string>>(
          `SELECT
             COUNT(DISTINCT ci.course_id) AS unique_courses,
             COUNT(*) AS total_checkins,
             (SELECT COALESCE(MAX(sub.cnt), 0) FROM (SELECT course_id, COUNT(*) cnt FROM checkins WHERE player_id = $1 GROUP BY course_id) sub) AS max_same_course_visits,
             COUNT(DISTINCT c.state) AS unique_states,
             SUM(CASE WHEN EXTRACT(DOW FROM ci.checked_in_at) IN (0,6) THEN 1 ELSE 0 END) AS weekend_rounds,
             SUM(CASE WHEN EXTRACT(HOUR FROM ci.checked_in_at) >= 20 THEN 1 ELSE 0 END) AS night_checkins,
             SUM(CASE WHEN EXTRACT(HOUR FROM ci.checked_in_at) >= 5 AND EXTRACT(HOUR FROM ci.checked_in_at) < 9 THEN 1 ELSE 0 END) AS morning_checkins,
             SUM(CASE WHEN ci.weather_condition IN ('rain','snow','cold','heat') THEN 1 ELSE 0 END) AS weather_checkins
           FROM checkins ci JOIN courses c ON c.id = ci.course_id WHERE ci.player_id = $1`,
          [playerId]
        )
      ).rows[0]!;

      const trailblazerCourses = await count(
        client,
        `SELECT COUNT(*) AS cnt FROM (
           SELECT ci.course_id FROM checkins ci
           WHERE ci.player_id = $1 AND ci.checked_in_at = (SELECT MIN(ci2.checked_in_at) FROM checkins ci2 WHERE ci2.course_id = ci.course_id)
           GROUP BY ci.course_id
         ) t`,
        [playerId]
      );

      const pf = (
        await client.query<{ battle_wins: string; best_streak: string; total_rounds: string }>(
          'SELECT battle_wins, best_streak, total_rounds FROM players WHERE id = $1',
          [playerId]
        )
      ).rows[0]!;

      const challengesCompleted = await count(client, 'SELECT COUNT(*) AS cnt FROM player_challenges WHERE player_id = $1 AND completed = TRUE', [playerId]);
      const uniqueOpponents = await count(
        client,
        `SELECT COUNT(DISTINCT CASE WHEN challenger_id = $1 THEN opponent_id ELSE challenger_id END) AS cnt FROM battles WHERE (challenger_id = $1 OR opponent_id = $1)`,
        [playerId]
      );
      const completedCities = await count(
        client,
        `SELECT COUNT(*) AS cnt FROM (
           SELECT c.city, c.state FROM checkins ci JOIN courses c ON c.id = ci.course_id WHERE ci.player_id = $1
           GROUP BY c.city, c.state
           HAVING COUNT(DISTINCT ci.course_id) = (SELECT COUNT(*) FROM courses cc WHERE cc.city = c.city AND cc.state = c.state)
             AND (SELECT COUNT(*) FROM courses cc WHERE cc.city = c.city AND cc.state = c.state) >= 2
         ) t`,
        [playerId]
      );
      const seasonsPlayed = await count(
        client,
        `SELECT COUNT(DISTINCT CASE
           WHEN EXTRACT(MONTH FROM ci.checked_in_at) IN (3,4,5) THEN 'spring'
           WHEN EXTRACT(MONTH FROM ci.checked_in_at) IN (6,7,8) THEN 'summer'
           WHEN EXTRACT(MONTH FROM ci.checked_in_at) IN (9,10,11) THEN 'fall'
           ELSE 'winter' END) AS cnt
         FROM checkins ci WHERE ci.player_id = $1`,
        [playerId]
      );

      return {
        uniqueCourses: parseInt(bsr.unique_courses!, 10),
        totalRounds: parseInt(pf.total_rounds, 10),
        challengesCompleted,
        battleWins: parseInt(pf.battle_wins, 10),
        bestStreak: parseInt(pf.best_streak, 10),
        uniqueOpponents,
        uniqueStates: parseInt(bsr.unique_states!, 10),
        maxSameCourseVisits: parseInt(bsr.max_same_course_visits!, 10),
        weekendRounds: parseInt(bsr.weekend_rounds!, 10),
        nightCheckins: parseInt(bsr.night_checkins!, 10),
        morningCheckins: parseInt(bsr.morning_checkins!, 10),
        weatherCheckins: parseInt(bsr.weather_checkins!, 10),
        trailblazerCourses,
        seasonsPlayed,
        completedCities,
        completedStates,
      };
    },

    async earnedBadgeKeys(client: PoolClient, playerId: number): Promise<Set<string>> {
      const r = await client.query<{ category: string; tier: string }>('SELECT category, tier FROM player_badges WHERE player_id = $1', [playerId]);
      return new Set(r.rows.map((row) => `${row.category}:${row.tier}`));
    },

    async insertBadge(client: PoolClient, playerId: number, category: string, tier: string) {
      await client.query('INSERT INTO player_badges (player_id, category, tier) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [playerId, category, tier]);
    },

    async finalPlayer(client: PoolClient, playerId: number) {
      const r = await client.query<{ xp: number; level: number; gold: number }>('SELECT xp, level, gold FROM players WHERE id = $1', [playerId]);
      return r.rows[0]!;
    },

    async playerGold(client: PoolClient, playerId: number): Promise<number> {
      const r = await client.query<{ gold: number }>('SELECT gold FROM players WHERE id = $1', [playerId]);
      return r.rows[0]!.gold;
    },

    // ── read-only endpoints (pool) ──
    async statusToday(playerId: number, courseId: number, sinceIso: string) {
      const r = await db.query<{ id: number; checked_in_at: Date }>(
        `SELECT id, checked_in_at FROM checkins
         WHERE player_id = $1 AND course_id = $2 AND checked_in_at >= $3
         ORDER BY checked_in_at DESC LIMIT 1`,
        [playerId, courseId, sinceIso]
      );
      return r.rows[0] ?? null;
    },

    async playersAtCourse(courseId: number, sinceIso: string, excludePlayerId: number) {
      const r = await db.query(
        `SELECT DISTINCT ON (p.id) p.id, p.display_name, p.profile_photo_url AS avatar_url, p.xp, p.level, ci.checked_in_at
         FROM checkins ci JOIN players p ON p.id = ci.player_id
         WHERE ci.course_id = $1 AND ci.checked_in_at >= $2 AND ci.player_id != $3
         ORDER BY p.id, ci.checked_in_at DESC`,
        [courseId, sinceIso, excludePlayerId]
      );
      return r.rows;
    },

    async history(playerId: number, limit: number, offset: number) {
      const r = await db.query(
        `SELECT ci.id, ci.checked_in_at, ci.xp_earned, ci.is_round_complete, ci.weather_condition, ci.holes_logged,
                c.name AS course_name, c.city, c.state
         FROM checkins ci JOIN courses c ON c.id = ci.course_id
         WHERE ci.player_id = $1 ORDER BY ci.checked_in_at DESC LIMIT $2 OFFSET $3`,
        [playerId, limit + 1, offset]
      );
      return r.rows;
    },

    // ── course-checkin challenge sync (fire-and-forget, pool) ──
    async courseCheckinChallenges(courseId: number) {
      const r = await db.query<{ id: number; target_value: number }>(
        `SELECT id, target_value FROM challenges WHERE challenge_type = 'course_checkin' AND cadence = 'permanent' AND course_id = $1`,
        [courseId]
      );
      return r.rows;
    },

    async courseCheckinCountForPlayer(playerId: number, courseId: number): Promise<number> {
      return count(db, 'SELECT COUNT(*) AS cnt FROM checkins WHERE player_id = $1 AND course_id = $2', [playerId, courseId]);
    },

    async upsertPlayerChallenge(playerId: number, challengeId: number, progress: number, completed: boolean) {
      await db.query(
        `INSERT INTO player_challenges (player_id, challenge_id, progress, completed, completed_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (player_id, challenge_id) DO UPDATE
           SET progress = EXCLUDED.progress,
               completed = CASE WHEN EXCLUDED.completed THEN TRUE ELSE player_challenges.completed END,
               completed_at = CASE WHEN EXCLUDED.completed AND player_challenges.completed_at IS NULL THEN NOW() ELSE player_challenges.completed_at END`,
        [playerId, challengeId, progress, completed, completed ? new Date() : null]
      );
    },
  };
}

export type CheckinsRepo = ReturnType<typeof createCheckinsRepo>;
