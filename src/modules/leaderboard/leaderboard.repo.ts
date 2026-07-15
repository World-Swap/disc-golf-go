// src/modules/leaderboard/leaderboard.repo.ts — leaderboard queries.
// sortCol and interval are only ever passed from fixed whitelists in the
// service, never from raw user input, so interpolation is safe here.

import type { Queryable } from '../../db/types';

export type SortCol = 'total_xp' | 'lessons_completed' | 'current_streak' | 'challenges_won';
export type Interval = '7 days' | '30 days';

export interface Top5Row {
  id: number;
  display_name: string | null;
  username: string | null;
  xp: number;
  level: number | null;
}

export interface EntryRow {
  id: number;
  display_name: string | null;
  profile_photo_url: string | null;
  total_xp: number;
  lessons_completed: number;
  current_streak: number;
  challenges_won: number;
  last_active_at: Date | null;
  stat_value: number;
}

const PERIOD_STAT: Record<SortCol, string> = {
  total_xp: 'tc.training_xp',
  lessons_completed: 'tc.lessons_completed',
  current_streak: 'p.login_streak',
  challenges_won: 'dc.challenges_won',
};

export function createLeaderboardRepo(db: Queryable) {
  return {
    async top5(): Promise<Top5Row[]> {
      const r = await db.query<Top5Row>(
        'SELECT id, display_name, username, xp, level FROM players ORDER BY xp DESC, id ASC LIMIT 5'
      );
      return r.rows;
    },

    async playerById(id: number): Promise<Top5Row | null> {
      const r = await db.query<Top5Row>('SELECT id, display_name, username, xp, level FROM players WHERE id = $1', [id]);
      return r.rows[0] ?? null;
    },

    async rankByXp(xp: number): Promise<number> {
      const r = await db.query<{ cnt: string }>('SELECT COUNT(*) AS cnt FROM players WHERE xp > $1', [xp]);
      return Number(r.rows[0]!.cnt) + 1;
    },

    async alltimeEntries(sortCol: SortCol): Promise<EntryRow[]> {
      const r = await db.query<EntryRow>(
        `SELECT user_id AS id, display_name, avatar_url AS profile_photo_url,
                total_xp, lessons_completed, current_streak, challenges_won, last_active_at,
                ${sortCol} AS stat_value
         FROM leaderboard_entries ORDER BY ${sortCol} DESC, user_id ASC LIMIT 50`
      );
      return r.rows;
    },

    async periodEntries(interval: Interval, sortCol: SortCol): Promise<EntryRow[]> {
      const r = await db.query<EntryRow>(
        `WITH tc AS (
           SELECT tc.player_id, SUM(l.xp_reward)::int AS training_xp, MAX(tc.completed_at) AS last_lesson_at, COUNT(tc.id)::int AS lessons_completed
           FROM training_completions tc JOIN training_lessons l ON l.id = tc.lesson_id
           WHERE tc.completed_at >= NOW() - INTERVAL '${interval}' GROUP BY tc.player_id
         ), dc AS (
           SELECT player_id, COUNT(*)::int AS challenges_won, MAX(completed_at) AS last_challenge_at
           FROM player_daily_challenges WHERE completed = TRUE AND completed_at >= NOW() - INTERVAL '${interval}' GROUP BY player_id
         )
         SELECT p.id, COALESCE(p.display_name, p.username, 'Player') AS display_name, p.profile_photo_url,
                COALESCE(tc.training_xp, 0) AS total_xp, COALESCE(tc.lessons_completed, 0) AS lessons_completed,
                COALESCE(p.login_streak, 0) AS current_streak, COALESCE(dc.challenges_won, 0) AS challenges_won,
                GREATEST(tc.last_lesson_at, dc.last_challenge_at) AS last_active_at,
                COALESCE(${PERIOD_STAT[sortCol]}, 0) AS stat_value
         FROM players p LEFT JOIN tc ON tc.player_id = p.id LEFT JOIN dc ON dc.player_id = p.id
         WHERE (COALESCE(tc.lessons_completed, 0) > 0 OR COALESCE(dc.challenges_won, 0) > 0)
         ORDER BY stat_value DESC, p.id ASC LIMIT 50`
      );
      return r.rows;
    },

    async alltimePlayerEntry(id: number, sortCol: SortCol): Promise<EntryRow | null> {
      const r = await db.query<EntryRow>(
        `SELECT user_id AS id, display_name, avatar_url AS profile_photo_url,
                total_xp, lessons_completed, current_streak, challenges_won, last_active_at, ${sortCol} AS stat_value
         FROM leaderboard_entries WHERE user_id = $1`,
        [id]
      );
      return r.rows[0] ?? null;
    },

    async periodPlayerEntry(id: number, interval: Interval, sortCol: SortCol): Promise<EntryRow | null> {
      const r = await db.query<EntryRow>(
        `WITH tc AS (
           SELECT tc.player_id, SUM(l.xp_reward)::int AS training_xp, COUNT(tc.id)::int AS lessons_completed
           FROM training_completions tc JOIN training_lessons l ON l.id = tc.lesson_id
           WHERE tc.completed_at >= NOW() - INTERVAL '${interval}' AND tc.player_id = $1 GROUP BY tc.player_id
         ), dc AS (
           SELECT player_id, COUNT(*)::int AS challenges_won FROM player_daily_challenges
           WHERE completed = TRUE AND completed_at >= NOW() - INTERVAL '${interval}' AND player_id = $1 GROUP BY player_id
         )
         SELECT p.id, COALESCE(p.display_name, p.username, 'Player') AS display_name, p.profile_photo_url,
                COALESCE(tc.training_xp, 0) AS total_xp, COALESCE(tc.lessons_completed, 0) AS lessons_completed,
                COALESCE(p.login_streak, 0) AS current_streak, COALESCE(dc.challenges_won, 0) AS challenges_won,
                NULL::timestamptz AS last_active_at, COALESCE(${PERIOD_STAT[sortCol]}, 0) AS stat_value
         FROM players p LEFT JOIN tc ON tc.player_id = p.id LEFT JOIN dc ON dc.player_id = p.id WHERE p.id = $1`,
        [id]
      );
      return r.rows[0] ?? null;
    },

    async alltimeRank(sortCol: SortCol, statValue: number): Promise<number> {
      const r = await db.query<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM leaderboard_entries WHERE ${sortCol} > $1`, [statValue]);
      return Number(r.rows[0]!.cnt) + 1;
    },

    async crewsTraining() {
      const r = await db.query(
        `SELECT cr.id, cr.name, cr.logo_url, cr.boss_id,
                COUNT(DISTINCT cm.player_id)::int AS member_count,
                COALESCE(SUM(l.xp_reward)::int, 0) AS training_xp,
                COUNT(DISTINCT tc.id)::int AS lessons_completed
         FROM crews cr
         LEFT JOIN crew_members cm ON cm.crew_id = cr.id
         LEFT JOIN training_completions tc ON tc.player_id = cm.player_id
         LEFT JOIN training_lessons l ON l.id = tc.lesson_id
         WHERE cr.disbanded_at IS NULL
         GROUP BY cr.id ORDER BY training_xp DESC, member_count DESC, cr.name ASC LIMIT 20`
      );
      return r.rows as Array<{ id: number; name: string; logo_url: string | null; member_count: number; training_xp: number; lessons_completed: number }>;
    },

    async myCrewId(playerId: number): Promise<number | null> {
      const r = await db.query<{ crew_id: number }>('SELECT crew_id FROM crew_members WHERE player_id = $1 LIMIT 1', [playerId]);
      return r.rows[0]?.crew_id ?? null;
    },
  };
}

export type LeaderboardRepo = ReturnType<typeof createLeaderboardRepo>;
