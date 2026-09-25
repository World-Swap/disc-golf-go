// src/modules/scorecards/scorecards.repo.ts — player-kept scorecards for real
// rounds at real courses. One row per round, one row per hole played.

import type { Queryable } from '../../db/types';

export interface ScorecardRow {
  id: number;
  course_id: number;
  course_name?: string;
  holes: number;
  par: number;
  strokes: number;
  completed: boolean;
  started_at: string;
  completed_at: string | null;
  holes_played?: number;
  par_played?: number;
}

export interface HoleRow {
  hole_number: number;
  par: number;
  strokes: number | null;
}

// Par and hole counts are always taken over the holes with a score on them:
// a round abandoned at hole 7 must not be judged against 18 holes of par.
const PLAYED_HOLES =
  '(SELECT COUNT(*) FROM scorecard_holes h WHERE h.scorecard_id = s.id AND h.strokes IS NOT NULL)';
const PLAYED_PAR =
  '(SELECT COALESCE(SUM(h.par), 0) FROM scorecard_holes h WHERE h.scorecard_id = s.id AND h.strokes IS NOT NULL)';

export function createScorecardsRepo(db: Queryable) {
  return {
    async courseExists(courseId: number): Promise<boolean> {
      const r = await db.query('SELECT id FROM courses WHERE id = $1', [courseId]);
      return r.rows.length > 0;
    },

    async create(playerId: number, courseId: number, holes: number, par: number) {
      const r = await db.query<ScorecardRow>(
        `INSERT INTO scorecards (player_id, course_id, holes, par)
         VALUES ($1, $2, $3, $4)
         RETURNING id, course_id, holes, par, strokes, completed, started_at, completed_at`,
        [playerId, courseId, holes, par]
      );
      return r.rows[0]!;
    },

    async addHoles(scorecardId: number, holes: Array<{ hole_number: number; par: number }>) {
      // One statement rather than a loop: unnest the two arrays into rows.
      await db.query(
        `INSERT INTO scorecard_holes (scorecard_id, hole_number, par)
         SELECT $1, * FROM unnest($2::int[], $3::int[])
         ON CONFLICT (scorecard_id, hole_number) DO NOTHING`,
        [scorecardId, holes.map((h) => h.hole_number), holes.map((h) => h.par)]
      );
    },

    async owned(playerId: number, scorecardId: number): Promise<ScorecardRow | null> {
      const r = await db.query<ScorecardRow>(
        `SELECT s.id, s.course_id, c.name AS course_name, s.holes, s.par, s.strokes,
                s.completed, s.started_at, s.completed_at
         FROM scorecards s LEFT JOIN courses c ON c.id = s.course_id
         WHERE s.id = $1 AND s.player_id = $2`,
        [scorecardId, playerId]
      );
      return r.rows[0] ?? null;
    },

    async holes(scorecardId: number): Promise<HoleRow[]> {
      const r = await db.query<HoleRow>(
        'SELECT hole_number, par, strokes FROM scorecard_holes WHERE scorecard_id = $1 ORDER BY hole_number',
        [scorecardId]
      );
      return r.rows;
    },

    async setHole(scorecardId: number, holeNumber: number, strokes: number | null) {
      await db.query(
        `UPDATE scorecard_holes SET strokes = $3 WHERE scorecard_id = $1 AND hole_number = $2`,
        [scorecardId, holeNumber, strokes]
      );
      // Keep the round total in step with its holes, so reads never sum.
      const r = await db.query<{ strokes: string }>(
        `UPDATE scorecards SET strokes = COALESCE(
           (SELECT SUM(strokes) FROM scorecard_holes WHERE scorecard_id = $1 AND strokes IS NOT NULL), 0)
         WHERE id = $1 RETURNING strokes`,
        [scorecardId]
      );
      return parseInt(r.rows[0]?.strokes ?? '0', 10);
    },

    async finish(scorecardId: number) {
      const r = await db.query<ScorecardRow>(
        `UPDATE scorecards SET completed = TRUE, completed_at = NOW()
         WHERE id = $1 RETURNING id, course_id, holes, par, strokes, completed, started_at, completed_at`,
        [scorecardId]
      );
      return r.rows[0]!;
    },

    async remove(playerId: number, scorecardId: number): Promise<number> {
      const r = await db.query('DELETE FROM scorecards WHERE id = $1 AND player_id = $2 RETURNING id', [
        scorecardId,
        playerId,
      ]);
      return r.rowCount ?? 0;
    },

    async listForPlayer(playerId: number, limit: number) {
      const r = await db.query<ScorecardRow>(
        `SELECT s.id, s.course_id, c.name AS course_name, s.holes, s.par, s.strokes,
                s.completed, s.started_at, s.completed_at,
                ${PLAYED_HOLES} AS holes_played,
                ${PLAYED_PAR} AS par_played
         FROM scorecards s LEFT JOIN courses c ON c.id = s.course_id
         WHERE s.player_id = $1 ORDER BY s.started_at DESC LIMIT $2`,
        [playerId, limit]
      );
      return r.rows;
    },

    // Best (lowest) completed round per course, for "your best here". Ranked
    // against the par of the holes played, so a strong 9 doesn't beat a full
    // 18 just by being shorter.
    async bestForCourse(playerId: number, courseId: number) {
      const r = await db.query<{ strokes: number; par: number; par_played: number; holes_played: number; completed_at: string }>(
        `SELECT s.strokes, s.par, s.completed_at,
                ${PLAYED_HOLES} AS holes_played,
                ${PLAYED_PAR} AS par_played
         FROM scorecards s
         WHERE s.player_id = $1 AND s.course_id = $2 AND s.completed = TRUE AND s.strokes > 0
         ORDER BY (s.strokes - ${PLAYED_PAR}) ASC, s.completed_at ASC LIMIT 1`,
        [playerId, courseId]
      );
      return r.rows[0] ?? null;
    },
  };
}

export type ScorecardsRepo = ReturnType<typeof createScorecardsRepo>;
