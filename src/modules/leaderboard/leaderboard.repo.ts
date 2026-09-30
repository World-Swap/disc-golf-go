// src/modules/leaderboard/leaderboard.repo.ts — leaderboard queries.
// sortCol is only ever passed from a fixed whitelist in the service, never from
// raw user input, so interpolation is safe here. The period boundary is a bound
// parameter rather than interpolated text.

import type { Queryable } from '../../db/types';

export type SortCol = 'total_xp' | 'lessons_completed' | 'current_streak' | 'challenges_won';

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

// All-time board is computed live from durable tables, NOT the leaderboard_entries
// snapshot (which nothing populates, so it always read as zero).
//
// total_xp is TRAINING xp -- summed over the player's completed lessons -- and
// deliberately NOT players.xp. players.xp is the grand total across every source
// in the app (Throw Lab rounds, tournaments, story quests, daily challenges,
// referrals, check-ins), so using it here put a player's whole career under a
// column headed "Earned from completed lessons" and ranked the training board by
// how much someone had played the game. It read as a wild outlier next to the
// week and month columns, which were always training-only.
//
// This is the same expression the week/month path uses, so all four periods now
// measure one thing. Counts come straight from the completion / challenge rows,
// so nothing here depends on a content reseed.
const ALLTIME_FROM = `
  FROM players p
  LEFT JOIN (
    SELECT player_id, COUNT(*)::int AS lessons_completed, MAX(completed_at) AS last_lesson_at
    FROM training_completions GROUP BY player_id
  ) lc ON lc.player_id = p.id
  LEFT JOIN (
    SELECT tc.player_id, SUM(l.xp_reward)::int AS training_xp
    FROM training_completions tc JOIN training_lessons l ON l.id = tc.lesson_id
    GROUP BY tc.player_id
  ) tx ON tx.player_id = p.id
  LEFT JOIN (
    SELECT player_id, COUNT(*)::int AS challenges_won, MAX(completed_at) AS last_challenge_at
    FROM player_daily_challenges WHERE completed = TRUE GROUP BY player_id
  ) cc ON cc.player_id = p.id`;

const ALLTIME_STAT: Record<SortCol, string> = {
  total_xp: 'COALESCE(tx.training_xp, 0)',
  lessons_completed: 'COALESCE(lc.lessons_completed, 0)',
  current_streak: 'COALESCE(p.login_streak, 0)',
  challenges_won: 'COALESCE(cc.challenges_won, 0)',
};

const ALLTIME_SELECT = `
  SELECT p.id, COALESCE(p.display_name, p.username, 'Player') AS display_name,
         p.profile_photo_url,
         COALESCE(tx.training_xp, 0) AS total_xp,
         COALESCE(lc.lessons_completed, 0) AS lessons_completed,
         COALESCE(p.login_streak, 0) AS current_streak,
         COALESCE(cc.challenges_won, 0) AS challenges_won,
         GREATEST(lc.last_lesson_at, cc.last_challenge_at) AS last_active_at`;

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
        `${ALLTIME_SELECT}, ${ALLTIME_STAT[sortCol]} AS stat_value
         ${ALLTIME_FROM}
         WHERE lc.lessons_completed > 0 OR cc.challenges_won > 0
         ORDER BY stat_value DESC, p.id ASC LIMIT 50`
      );
      return r.rows;
    },

    async periodEntries(since: Date, sortCol: SortCol): Promise<EntryRow[]> {
      const r = await db.query<EntryRow>(
        `WITH tc AS (
           SELECT tc.player_id, SUM(l.xp_reward)::int AS training_xp, MAX(tc.completed_at) AS last_lesson_at, COUNT(tc.id)::int AS lessons_completed
           FROM training_completions tc JOIN training_lessons l ON l.id = tc.lesson_id
           WHERE tc.completed_at >= $1 GROUP BY tc.player_id
         ), dc AS (
           SELECT player_id, COUNT(*)::int AS challenges_won, MAX(completed_at) AS last_challenge_at
           FROM player_daily_challenges WHERE completed = TRUE AND completed_at >= $1 GROUP BY player_id
         )
         SELECT p.id, COALESCE(p.display_name, p.username, 'Player') AS display_name, p.profile_photo_url,
                COALESCE(tc.training_xp, 0) AS total_xp, COALESCE(tc.lessons_completed, 0) AS lessons_completed,
                COALESCE(p.login_streak, 0) AS current_streak, COALESCE(dc.challenges_won, 0) AS challenges_won,
                GREATEST(tc.last_lesson_at, dc.last_challenge_at) AS last_active_at,
                COALESCE(${PERIOD_STAT[sortCol]}, 0) AS stat_value
         FROM players p LEFT JOIN tc ON tc.player_id = p.id LEFT JOIN dc ON dc.player_id = p.id
         WHERE (COALESCE(tc.lessons_completed, 0) > 0 OR COALESCE(dc.challenges_won, 0) > 0)
         ORDER BY stat_value DESC, p.id ASC LIMIT 50`,
        [since]
      );
      return r.rows;
    },

    async alltimePlayerEntry(id: number, sortCol: SortCol): Promise<EntryRow | null> {
      const r = await db.query<EntryRow>(
        `${ALLTIME_SELECT}, ${ALLTIME_STAT[sortCol]} AS stat_value
         ${ALLTIME_FROM}
         WHERE p.id = $1`,
        [id]
      );
      return r.rows[0] ?? null;
    },

    async periodPlayerEntry(id: number, since: Date, sortCol: SortCol): Promise<EntryRow | null> {
      const r = await db.query<EntryRow>(
        `WITH tc AS (
           SELECT tc.player_id, SUM(l.xp_reward)::int AS training_xp, COUNT(tc.id)::int AS lessons_completed
           FROM training_completions tc JOIN training_lessons l ON l.id = tc.lesson_id
           WHERE tc.completed_at >= $1 AND tc.player_id = $2 GROUP BY tc.player_id
         ), dc AS (
           SELECT player_id, COUNT(*)::int AS challenges_won FROM player_daily_challenges
           WHERE completed = TRUE AND completed_at >= $1 AND player_id = $2 GROUP BY player_id
         )
         SELECT p.id, COALESCE(p.display_name, p.username, 'Player') AS display_name, p.profile_photo_url,
                COALESCE(tc.training_xp, 0) AS total_xp, COALESCE(tc.lessons_completed, 0) AS lessons_completed,
                COALESCE(p.login_streak, 0) AS current_streak, COALESCE(dc.challenges_won, 0) AS challenges_won,
                NULL::timestamptz AS last_active_at, COALESCE(${PERIOD_STAT[sortCol]}, 0) AS stat_value
         FROM players p LEFT JOIN tc ON tc.player_id = p.id LEFT JOIN dc ON dc.player_id = p.id WHERE p.id = $2`,
        [since, id]
      );
      return r.rows[0] ?? null;
    },

    async alltimeRank(sortCol: SortCol, statValue: number): Promise<number> {
      const r = await db.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM (
           SELECT ${ALLTIME_STAT[sortCol]} AS s ${ALLTIME_FROM}
         ) t WHERE t.s > $1`,
        [statValue]
      );
      return Number(r.rows[0]!.cnt) + 1;
    },

  };
}

export type LeaderboardRepo = ReturnType<typeof createLeaderboardRepo>;
