// src/modules/game/game.repo.ts — Throw Lab rounds, challenge completions and
// the game leaderboard. Challenge progress is always an aggregate over
// game_rounds, never a stored counter.

import type { PoolClient } from 'pg';
import type { Queryable } from '../../db/types';
import type { Period } from './game.catalog';
import { GAME_SEASON, seasonFloor } from './game.season';

export interface RoundInput {
  mode: 'quick' | 'course';
  courseId: number | null;
  holes: number;
  par: number;
  strokes: number;
  vsPar: number;
  birdies: number;
  eagles: number;
  aces: number;
}

export interface PeriodMetrics {
  rounds: number;
  holes: number;
  birdies: number;
  aces: number;
  under_par: number;
  courses: number;
  best_round: number | null;   // lowest vs_par in the window
}

/**
 * The metrics the Throw Lab board can be ranked by. The SQL lives here, keyed
 * by a name, so the value that arrives over HTTP only ever selects an entry —
 * it is never concatenated into a query.
 */
// Board metrics only. `birdies` is still a CHALLENGE metric in game.catalog.ts
// and best_18 is still in the /stats career record — neither is affected by
// what the leaderboard offers to rank by.
export const GAME_METRICS = {
  xp:          { expr: 'COALESCE(SUM(g.xp_awarded), 0)',                    dir: 'DESC', having: 'COALESCE(SUM(g.xp_awarded), 0) > 0',   label: 'XP', unit: 'XP' },
  best_round:  { expr: 'MIN(g.vs_par)',                                     dir: 'ASC',  having: 'MIN(g.vs_par) IS NOT NULL',            label: 'Best round', unit: 'vs par' },
  aces:        { expr: 'COALESCE(SUM(g.aces), 0)',                          dir: 'DESC', having: 'COALESCE(SUM(g.aces), 0) > 0',         label: 'Aces', unit: '' },
  full_rounds: { expr: "COUNT(*) FILTER (WHERE g.holes = 18)",              dir: 'DESC', having: "COUNT(*) FILTER (WHERE g.holes = 18) > 0", label: '18-hole rounds', unit: '' },
  courses:     { expr: 'COUNT(DISTINCT g.course_id) FILTER (WHERE g.course_id IS NOT NULL)', dir: 'DESC', having: 'COUNT(DISTINCT g.course_id) FILTER (WHERE g.course_id IS NOT NULL) > 0', label: 'Courses played', unit: '' },
  rounds:      { expr: 'COUNT(*)',                                          dir: 'DESC', having: 'COUNT(*) > 0',                          label: 'Rounds', unit: '' },
  under_par:   { expr: 'COUNT(*) FILTER (WHERE g.vs_par < 0)',              dir: 'DESC', having: 'COUNT(*) FILTER (WHERE g.vs_par < 0) > 0', label: 'Rounds under par', unit: '' },
} as const;

export type GameMetric = keyof typeof GAME_METRICS;

export interface CareerStats {
  rounds: number; full_rounds: number; course_rounds: number;
  holes: number; strokes: number; par: number;
  birdies: number; eagles: number; aces: number; xp: number;
  under_par: number; courses: number;
  best_round: number | null; best_full_round: number | null;
  days_played: number; first_round_at: string | null;
}

const ZERO: PeriodMetrics = { rounds: 0, holes: 0, birdies: 0, aces: 0, under_par: 0, courses: 0, best_round: null };

export function createGameRepo(db: Queryable) {
  return {
    async insertRound(client: PoolClient, playerId: number, r: RoundInput, xpAwarded: number) {
      const res = await client.query<{ id: number; created_at: string }>(
        `INSERT INTO game_rounds
           (player_id, mode, course_id, holes, par, strokes, vs_par, birdies, eagles, aces, xp_awarded)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id, created_at`,
        [playerId, r.mode, r.courseId, r.holes, r.par, r.strokes, r.vsPar, r.birdies, r.eagles, r.aces, xpAwarded]
      );
      return res.rows[0]!;
    },

    // How many rounds today have already paid XP — the farming cap.
    async xpRoundsToday(client: PoolClient, playerId: number): Promise<number> {
      const r = await client.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM game_rounds
         WHERE player_id = $1 AND xp_awarded > 0 AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')`,
        [playerId]
      );
      return parseInt(r.rows[0]?.cnt ?? '0', 10);
    },

    /** Every challenge metric for one window, in a single pass over the table. */
    async metrics(exec: Queryable, playerId: number, since: Date | null): Promise<PeriodMetrics> {
      const r = await exec.query<Record<string, string | null>>(
        `SELECT COUNT(*) AS rounds,
                COALESCE(SUM(holes), 0) AS holes,
                COALESCE(SUM(birdies), 0) AS birdies,
                COALESCE(SUM(aces), 0) AS aces,
                COUNT(*) FILTER (WHERE vs_par < 0) AS under_par,
                COUNT(DISTINCT course_id) AS courses,
                MIN(vs_par) AS best_round
         FROM game_rounds
         WHERE player_id = $1 AND ($2::timestamptz IS NULL OR created_at >= $2)`,
        [playerId, since]
      );
      const row = r.rows[0];
      if (!row) return { ...ZERO };
      return {
        rounds: parseInt(row.rounds ?? '0', 10),
        holes: parseInt(row.holes ?? '0', 10),
        birdies: parseInt(row.birdies ?? '0', 10),
        aces: parseInt(row.aces ?? '0', 10),
        under_par: parseInt(row.under_par ?? '0', 10),
        courses: parseInt(row.courses ?? '0', 10),
        best_round: row.best_round == null ? null : parseInt(row.best_round, 10),
      };
    },

    /** Challenge keys already completed in the given windows. */
    async completedKeys(exec: Queryable, playerId: number, periodKeys: string[]): Promise<Set<string>> {
      if (!periodKeys.length) return new Set();
      const r = await exec.query<{ challenge_key: string; period_key: string }>(
        `SELECT challenge_key, period_key FROM player_game_challenges
         WHERE player_id = $1 AND period_key = ANY($2::text[])`,
        [playerId, periodKeys]
      );
      return new Set(r.rows.map((x: { challenge_key: string; period_key: string }) => `${x.challenge_key}:${x.period_key}`));
    },

    /**
     * Claim a challenge for a window. The unique index does the work: if the
     * row already exists nothing is inserted and null comes back, so a reward
     * is paid exactly once even if two rounds land at the same moment.
     */
    async claim(
      client: PoolClient, playerId: number, key: string, period: Period, periodKey: string, xp: number, gold: number
    ): Promise<boolean> {
      const r = await client.query(
        `INSERT INTO player_game_challenges (player_id, challenge_key, period, period_key, xp_awarded, gold_awarded)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (player_id, challenge_key, period_key) DO NOTHING
         RETURNING id`,
        [playerId, key, period, periodKey, xp, gold]
      );
      return (r.rowCount ?? 0) > 0;
    },

    /**
     * A player's whole Throw Lab record in one pass. Everything here is an
     * aggregate over game_rounds — nothing is kept as a running counter, so it
     * cannot drift from the rounds that produced it.
     */
    async career(playerId: number): Promise<CareerStats> {
      const r = await db.query<Record<string, string | null>>(
        `SELECT COUNT(*)                                          AS rounds,
                COUNT(*) FILTER (WHERE holes = 18)                AS full_rounds,
                COUNT(*) FILTER (WHERE mode = 'course')           AS course_rounds,
                COALESCE(SUM(holes), 0)                           AS holes,
                COALESCE(SUM(strokes), 0)                         AS strokes,
                COALESCE(SUM(par), 0)                             AS par,
                COALESCE(SUM(birdies), 0)                         AS birdies,
                COALESCE(SUM(eagles), 0)                          AS eagles,
                COALESCE(SUM(aces), 0)                            AS aces,
                COALESCE(SUM(xp_awarded), 0)                      AS xp,
                COUNT(*) FILTER (WHERE vs_par < 0)                AS under_par,
                COUNT(DISTINCT course_id)
                  FILTER (WHERE course_id IS NOT NULL)            AS courses,
                MIN(vs_par)                                       AS best_round,
                MIN(vs_par) FILTER (WHERE holes = 18)             AS best_full_round,
                COUNT(DISTINCT date_trunc('day', created_at))     AS days_played,
                MIN(created_at)                                   AS first_round_at
         FROM game_rounds WHERE player_id = $1 AND created_at >= $2`,
        [playerId, GAME_SEASON.startsAt]
      );
      const row = r.rows[0] ?? {};
      const n = (k: string) => parseInt(row[k] ?? '0', 10) || 0;
      const nullable = (k: string) => (row[k] == null ? null : parseInt(row[k]!, 10));
      return {
        rounds: n('rounds'), full_rounds: n('full_rounds'), course_rounds: n('course_rounds'),
        holes: n('holes'), strokes: n('strokes'), par: n('par'),
        birdies: n('birdies'), eagles: n('eagles'), aces: n('aces'), xp: n('xp'),
        under_par: n('under_par'), courses: n('courses'),
        best_round: nullable('best_round'), best_full_round: nullable('best_full_round'),
        days_played: n('days_played'), first_round_at: row['first_round_at'] ?? null,
      };
    },

    /** The best round itself, so the number on the page can say where it happened. */
    async bestRound(playerId: number) {
      const r = await db.query(
        `SELECT g.vs_par, g.strokes, g.par, g.holes, g.created_at, c.name AS course_name
         FROM game_rounds g
         LEFT JOIN courses c ON c.id = g.course_id
         WHERE g.player_id = $1 AND g.created_at >= $2
         ORDER BY g.vs_par ASC, g.holes DESC, g.created_at ASC
         LIMIT 1`,
        [playerId, GAME_SEASON.startsAt]
      );
      return r.rows[0] ?? null;
    },

    /** Courses the player has actually played in the game, most played first. */
    async topCourses(playerId: number, limit: number) {
      const r = await db.query(
        `SELECT c.id, c.name, c.state, COUNT(*)::int AS rounds, MIN(g.vs_par)::int AS best
         FROM game_rounds g
         JOIN courses c ON c.id = g.course_id
         WHERE g.player_id = $1 AND g.course_id IS NOT NULL AND g.created_at >= $3
         GROUP BY c.id, c.name, c.state
         ORDER BY rounds DESC, best ASC
         LIMIT $2`,
        [playerId, limit, GAME_SEASON.startsAt]
      );
      return r.rows;
    },

    async completedCount(playerId: number): Promise<number> {
      const r = await db.query<{ cnt: string }>(
        'SELECT COUNT(*) AS cnt FROM player_game_challenges WHERE player_id = $1',
        [playerId]
      );
      return parseInt(r.rows[0]?.cnt ?? '0', 10);
    },

    async recentRounds(playerId: number, limit: number) {
      const r = await db.query(
        `SELECT g.id, g.mode, g.course_id, c.name AS course_name, g.holes, g.par, g.strokes,
                g.vs_par, g.birdies, g.aces, g.xp_awarded, g.created_at
         FROM game_rounds g LEFT JOIN courses c ON c.id = g.course_id
         WHERE g.player_id = $1 ORDER BY g.created_at DESC LIMIT $2`,
        [playerId, limit]
      );
      return r.rows;
    },

    /**
     * Game ranking for a window. Ranked by XP earned in the game, because it
     * is the one number that rewards both playing well and playing at all —
     * and it is comparable across 3-hole and 18-hole rounds, which raw score
     * is not. Best round rides along as the headline stat.
     */
    /**
     * The Throw Lab board, ranked by one of several metrics.
     *
     * `metric` is a key into GAME_METRICS and never reaches SQL as a string —
     * the SQL fragments below are all written here, so a value off the wire
     * cannot become part of the query.
     *
     * Each board also filters out the players who have nothing to show on it:
     * a board of "most aces" is not useful padded with thirty zeroes, and one
     * of "best 18" should not list players who have never played eighteen.
     */
    async leaderboard(since: Date | null, limit: number, metric: GameMetric = 'xp') {
      const m = GAME_METRICS[metric] ?? GAME_METRICS.xp;
      // Floored here rather than at the caller, so no board can be written
      // that quietly ranks a pre-season round against a post-season one.
      since = seasonFloor(since);
      const r = await db.query(
        `SELECT p.id, p.player_uuid, p.username, p.display_name, p.level,
                COALESCE(SUM(g.xp_awarded), 0)::int                       AS game_xp,
                COUNT(*)::int                                             AS rounds,
                COUNT(*) FILTER (WHERE g.holes = 18)::int                 AS full_rounds,
                MIN(g.vs_par)::int                                        AS best_vs_par,
                MIN(g.vs_par) FILTER (WHERE g.holes = 18)::int            AS best_18,
                COALESCE(SUM(g.birdies), 0)::int                          AS birdies,
                COALESCE(SUM(g.aces), 0)::int                             AS aces,
                COUNT(*) FILTER (WHERE g.vs_par < 0)::int                 AS under_par,
                COUNT(DISTINCT g.course_id)
                  FILTER (WHERE g.course_id IS NOT NULL)::int             AS courses,
                (${m.expr})::int                                          AS value
         FROM game_rounds g JOIN players p ON p.id = g.player_id
         WHERE ($1::timestamptz IS NULL OR g.created_at >= $1)
         GROUP BY p.id
         HAVING ${m.having}
         ORDER BY (${m.expr}) ${m.dir}, COUNT(*) DESC, p.id ASC
         LIMIT $2`,
        [since, limit]
      );
      return r.rows;
    },
  };
}

export type GameRepo = ReturnType<typeof createGameRepo>;
