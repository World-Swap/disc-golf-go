// src/modules/game/game.repo.ts — Throw Lab rounds, challenge completions and
// the game leaderboard. Challenge progress is always an aggregate over
// game_rounds, never a stored counter.

import type { PoolClient } from 'pg';
import type { Queryable } from '../../db/types';
import type { Period } from './game.catalog';

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
    async leaderboard(since: Date | null, limit: number) {
      const r = await db.query(
        `SELECT p.id, p.player_uuid, p.username, p.display_name, p.level,
                COALESCE(SUM(g.xp_awarded), 0)::int AS game_xp,
                COUNT(*)::int AS rounds,
                MIN(g.vs_par)::int AS best_vs_par,
                COALESCE(SUM(g.birdies), 0)::int AS birdies
         FROM game_rounds g JOIN players p ON p.id = g.player_id
         WHERE ($1::timestamptz IS NULL OR g.created_at >= $1)
         GROUP BY p.id
         ORDER BY game_xp DESC, best_vs_par ASC, rounds DESC
         LIMIT $2`,
        [since, limit]
      );
      return r.rows;
    },
  };
}

export type GameRepo = ReturnType<typeof createGameRepo>;
