// src/modules/tournament/tournament.repo.ts — the weekly tournament, its
// entries, and the board.
//
// Two invariants live here rather than in the service, because only the
// database can hold them under concurrency:
//   * exactly one tournament per ISO week, created on first use;
//   * at most MAX_ENTRIES attempts per player per tournament, taken by a
//     UNIQUE (tournament_id, player_id, attempt) row rather than a counter.

import type { PoolClient } from 'pg';
import type { Queryable } from '../../db/types';

export interface TournamentRow {
  id: number;
  kind: string;
  week_key: string;
  course_id: number | null;
  course_name: string;
  holes: number;
  starts_at: string;
  ends_at: string;
}

export interface EntryRow {
  id: number;
  tournament_id: number;
  player_id: number;
  attempt: number;
  status: 'in_progress' | 'completed' | 'abandoned';
  par: number | null;
  strokes: number | null;
  vs_par: number | null;
  game_round_id: number | null;
  started_at: string;
  completed_at: string | null;
}

export interface BoardRow {
  player_id: number;
  display_name: string | null;
  username: string | null;
  level: number | null;
  vs_par: number;
  strokes: number;
  completed_at: string;
}

/** Metrics the tournament record board can be ranked by. SQL lives here. */
export const TOURNAMENT_METRICS = {
  wins:       { expr: 'y.wins',       dir: 'DESC', having: 'y.wins > 0',       label: 'Wins', unit: '' },
  podiums:    { expr: 'y.podiums',    dir: 'DESC', having: 'y.podiums > 0',    label: 'Podiums', unit: '' },
  played:     { expr: 'y.played',     dir: 'DESC', having: 'y.played > 0',     label: 'Weeks played', unit: '' },
  best_score: { expr: 'y.best_score', dir: 'ASC',  having: 'y.best_score IS NOT NULL', label: 'Best score', unit: 'vs par' },
} as const;

export type TournamentMetric = keyof typeof TOURNAMENT_METRICS;

export interface CareerRecord {
  played: number;
  wins: number;
  podiums: number;
  best_finish: number | null;
  best_score: number | null;
  avg_finish: number | null;
  entries_used: number;
}

export function createTournamentRepo(_db: Queryable) {
  return {
    async find(exec: Queryable, weekKey: string, kind = 'weekly'): Promise<TournamentRow | null> {
      const r = await exec.query<TournamentRow>(
        `SELECT id, kind, week_key, course_id, course_name, holes, starts_at, ends_at
         FROM tournaments WHERE kind = $2 AND week_key = $1`,
        [weekKey, kind]
      );
      return r.rows[0] ?? null;
    },

    /**
     * A course to play this week. Full-size layouts only: an 18-hole
     * tournament on a 9-hole course is the same nine holes twice, which is a
     * poorer test and reads as a bug. Falls back to any course with enough
     * holes to build a round from, so a thin database still gets a tournament.
     */
    async randomCourse(exec: Queryable): Promise<{ id: number; name: string } | null> {
      for (const min of [18, 9, 1]) {
        const r = await exec.query<{ id: number; name: string }>(
          `SELECT id, name FROM courses
           WHERE is_active IS NOT FALSE AND COALESCE(holes, 0) >= $1
           ORDER BY random() LIMIT 1`,
          [min]
        );
        if (r.rows[0]) return r.rows[0];
      }
      return null;
    },

    /**
     * The course this week was drawn on, looked up by the name we kept. The
     * denormalised course_name is what makes a lost course_id recoverable:
     * a course that came back under a new id is found here and the week
     * carries on unchanged.
     */
    async findCourseByName(exec: Queryable, name: string): Promise<{ id: number; name: string } | null> {
      const r = await exec.query<{ id: number; name: string }>(
        `SELECT id, name FROM courses
         WHERE name = $1 AND is_active IS NOT FALSE
         ORDER BY COALESCE(holes, 0) DESC, id LIMIT 1`,
        [name]
      );
      return r.rows[0] ?? null;
    },

    /** Point a tournament at a course, and return the row as it now stands. */
    async setCourse(
      exec: Queryable,
      tournamentId: number,
      course: { id: number; name: string }
    ): Promise<TournamentRow | null> {
      const r = await exec.query<TournamentRow>(
        `UPDATE tournaments SET course_id = $2, course_name = $3
          WHERE id = $1 AND course_id IS NULL
      RETURNING id, kind, week_key, course_id, course_name, holes, starts_at, ends_at`,
        [tournamentId, course.id, course.name]
      );
      return r.rows[0] ?? null;
    },

    /**
     * Insert this week's tournament, or return the one another request just
     * made. ON CONFLICT DO NOTHING plus a re-read is what makes two players
     * opening the page at the same moment land on the same course.
     */
    async create(
      client: PoolClient,
      weekKey: string,
      course: { id: number; name: string },
      holes: number,
      startsAt: Date,
      endsAt: Date,
      kind = 'weekly'
    ): Promise<TournamentRow> {
      await client.query(
        `INSERT INTO tournaments (kind, week_key, course_id, course_name, holes, starts_at, ends_at)
         VALUES ($7,$1,$2,$3,$4,$5,$6)
         ON CONFLICT (kind, week_key) DO NOTHING`,
        [weekKey, course.id, course.name, holes, startsAt, endsAt, kind]
      );
      const r = await client.query<TournamentRow>(
        `SELECT id, kind, week_key, course_id, course_name, holes, starts_at, ends_at
         FROM tournaments WHERE kind = $2 AND week_key = $1`,
        [weekKey, kind]
      );
      return r.rows[0]!;
    },

    async entries(exec: Queryable, tournamentId: number, playerId: number): Promise<EntryRow[]> {
      const r = await exec.query<EntryRow>(
        `SELECT * FROM tournament_entries
         WHERE tournament_id = $1 AND player_id = $2
         ORDER BY attempt`,
        [tournamentId, playerId]
      );
      return r.rows;
    },

    async entryById(exec: Queryable, entryId: number, playerId: number): Promise<EntryRow | null> {
      const r = await exec.query<EntryRow>(
        `SELECT * FROM tournament_entries WHERE id = $1 AND player_id = $2`,
        [entryId, playerId]
      );
      return r.rows[0] ?? null;
    },

    /**
     * Take the next attempt. The UNIQUE constraint is the lock: two taps on
     * Play cannot both take attempt 2, the loser gets no row back and the
     * service reports the entries as spent.
     */
    async takeEntry(client: PoolClient, tournamentId: number, playerId: number, attempt: number): Promise<EntryRow | null> {
      const r = await client.query<EntryRow>(
        `INSERT INTO tournament_entries (tournament_id, player_id, attempt)
         VALUES ($1,$2,$3)
         ON CONFLICT (tournament_id, player_id, attempt) DO NOTHING
         RETURNING *`,
        [tournamentId, playerId, attempt]
      );
      return r.rows[0] ?? null;
    },

    /** Close any attempt the player walked away from. It stays spent. */
    async abandonOpen(client: PoolClient, tournamentId: number, playerId: number, exceptId?: number): Promise<number> {
      const r = await client.query(
        `UPDATE tournament_entries SET status = 'abandoned', completed_at = NOW()
         WHERE tournament_id = $1 AND player_id = $2 AND status = 'in_progress'
           AND ($3::int IS NULL OR id <> $3)`,
        [tournamentId, playerId, exceptId ?? null]
      );
      return r.rowCount ?? 0;
    },

    async completeEntry(
      client: PoolClient,
      entryId: number,
      score: { par: number; strokes: number; vsPar: number; gameRoundId: number | null }
    ): Promise<EntryRow> {
      const r = await client.query<EntryRow>(
        `UPDATE tournament_entries
         SET status = 'completed', par = $2, strokes = $3, vs_par = $4,
             game_round_id = $5, completed_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [entryId, score.par, score.strokes, score.vsPar, score.gameRoundId]
      );
      return r.rows[0]!;
    },

    /**
     * The board: each player's best completed attempt, lowest score first. A
     * tie goes to whoever posted it first, which is the usual sporting rule
     * and keeps the order stable as later rounds come in.
     */
    async board(exec: Queryable, tournamentId: number, limit: number): Promise<BoardRow[]> {
      const r = await exec.query<BoardRow>(
        `SELECT DISTINCT ON (e.player_id)
                e.player_id, p.display_name, p.username, p.level,
                e.vs_par, e.strokes, e.completed_at
         FROM tournament_entries e
         JOIN players p ON p.id = e.player_id
         WHERE e.tournament_id = $1 AND e.status = 'completed' AND e.vs_par IS NOT NULL
         ORDER BY e.player_id, e.vs_par ASC, e.completed_at ASC`,
        [tournamentId]
      );
      // DISTINCT ON has to order by player_id first, so the field is ranked here.
      return r.rows
        .sort((a, b) => a.vs_par - b.vs_par || Date.parse(a.completed_at) - Date.parse(b.completed_at))
        .slice(0, limit);
    },

    /**
     * Where a player stands in the whole field, not just the slice shown.
     * Counting from the board array would have called anyone outside the
     * displayed rows unranked. Same ordering as board(): score, then who
     * posted it first.
     */
    async place(exec: Queryable, tournamentId: number, playerId: number): Promise<number | null> {
      const r = await exec.query<{ place: string | null }>(
        `WITH best AS (
           SELECT DISTINCT ON (player_id) player_id, vs_par, completed_at
           FROM tournament_entries
           WHERE tournament_id = $1 AND status = 'completed' AND vs_par IS NOT NULL
           ORDER BY player_id, vs_par ASC, completed_at ASC
         ), me AS (SELECT vs_par, completed_at FROM best WHERE player_id = $2)
         SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM me) THEN NULL ELSE (
           SELECT COUNT(*) + 1 FROM best b, me
           WHERE b.vs_par < me.vs_par
              OR (b.vs_par = me.vs_par AND b.completed_at < me.completed_at)
         ) END::text AS place`,
        [tournamentId, playerId]
      );
      const v = r.rows[0]?.place;
      return v == null ? null : parseInt(v, 10);
    },

    /**
     * A player's tournament record: played, wins, podiums, best finish.
     *
     * Only **finished** weeks count. A first place in a week still running is
     * not a win yet — anyone can still post — so the current week is reported
     * separately as a standing rather than folded into the record.
     *
     * The rank is computed here rather than stored: RANK() over each week's
     * field, ordered the same way the live board is (score, then who posted
     * it first), so a player's place in the record matches what they saw.
     */
    async career(exec: Queryable, playerId: number, kind = 'weekly'): Promise<CareerRecord> {
      const r = await exec.query<Record<string, string | null>>(
        `WITH best AS (
           SELECT DISTINCT ON (e.tournament_id, e.player_id)
                  e.tournament_id, e.player_id, e.vs_par, e.strokes, e.completed_at
           FROM tournament_entries e
           JOIN tournaments t ON t.id = e.tournament_id
           WHERE e.status = 'completed' AND e.vs_par IS NOT NULL AND t.ends_at <= NOW()
             AND t.kind = $2
           ORDER BY e.tournament_id, e.player_id, e.vs_par ASC, e.completed_at ASC
         ), ranked AS (
           SELECT *, RANK() OVER (PARTITION BY tournament_id
                                  ORDER BY vs_par ASC, completed_at ASC) AS place
           FROM best
         )
         SELECT COUNT(*)                                  AS played,
                COUNT(*) FILTER (WHERE place = 1)         AS wins,
                COUNT(*) FILTER (WHERE place <= 3)        AS podiums,
                MIN(place)                                AS best_finish,
                MIN(vs_par)                               AS best_score,
                ROUND(AVG(place), 1)::text                AS avg_finish
         FROM ranked WHERE player_id = $1`,
        [playerId, kind]
      );
      const row = r.rows[0] ?? {};
      const n = (k: string) => parseInt(row[k] ?? '0', 10) || 0;
      const nullable = (k: string) => (row[k] == null ? null : parseInt(row[k]!, 10));

      const entries = await exec.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n
           FROM tournament_entries e
           JOIN tournaments t ON t.id = e.tournament_id
          WHERE e.player_id = $1 AND t.kind = $2`,
        [playerId, kind]
      );
      return {
        played: n('played'), wins: n('wins'), podiums: n('podiums'),
        best_finish: nullable('best_finish'), best_score: nullable('best_score'),
        avg_finish: row['avg_finish'] == null ? null : Number(row['avg_finish']),
        entries_used: parseInt(entries.rows[0]?.n ?? '0', 10),
      };
    },

    /** The player's finished weeks, newest first, with where they placed. */
    async history(exec: Queryable, playerId: number, limit: number, kind = 'weekly') {
      const r = await exec.query(
        `WITH best AS (
           SELECT DISTINCT ON (e.tournament_id, e.player_id)
                  e.tournament_id, e.player_id, e.vs_par, e.strokes, e.completed_at
           FROM tournament_entries e
           WHERE e.status = 'completed' AND e.vs_par IS NOT NULL
           ORDER BY e.tournament_id, e.player_id, e.vs_par ASC, e.completed_at ASC
         ), ranked AS (
           SELECT *, RANK() OVER (PARTITION BY tournament_id
                                  ORDER BY vs_par ASC, completed_at ASC) AS place,
                     COUNT(*) OVER (PARTITION BY tournament_id) AS players
           FROM best
         )
         SELECT t.week_key, t.course_name, t.holes, t.ends_at,
                r.vs_par::int, r.strokes::int, r.place::int, r.players::int,
                (t.ends_at > NOW()) AS in_progress
         FROM ranked r
         JOIN tournaments t ON t.id = r.tournament_id
         WHERE r.player_id = $1 AND t.kind = $3
         ORDER BY t.starts_at DESC
         LIMIT $2`,
        [playerId, limit, kind]
      );
      return r.rows;
    },

    /**
     * A board over every player's tournament record — most wins, most
     * podiums, most weeks played. Finished weeks only, for the same reason
     * the personal record uses them: an open week has no result yet.
     *
     * `metric` selects an entry in TOURNAMENT_METRICS; nothing from the
     * request is ever concatenated into the query.
     */
    async careerBoard(exec: Queryable, metric: TournamentMetric, limit: number, kind = 'weekly') {
      const m = TOURNAMENT_METRICS[metric] ?? TOURNAMENT_METRICS.wins;
      const r = await exec.query(
        `WITH best AS (
           SELECT DISTINCT ON (e.tournament_id, e.player_id)
                  e.tournament_id, e.player_id, e.vs_par, e.completed_at
           FROM tournament_entries e
           JOIN tournaments t ON t.id = e.tournament_id
           WHERE e.status = 'completed' AND e.vs_par IS NOT NULL AND t.ends_at <= NOW()
             AND t.kind = $2
           ORDER BY e.tournament_id, e.player_id, e.vs_par ASC, e.completed_at ASC
         ), ranked AS (
           SELECT *, RANK() OVER (PARTITION BY tournament_id
                                  ORDER BY vs_par ASC, completed_at ASC) AS place
           FROM best
         ), tally AS (
           SELECT player_id,
                  COUNT(*)::int                             AS played,
                  COUNT(*) FILTER (WHERE place = 1)::int    AS wins,
                  COUNT(*) FILTER (WHERE place <= 3)::int   AS podiums,
                  MIN(vs_par)::int                          AS best_score,
                  MIN(place)::int                           AS best_finish
           FROM ranked GROUP BY player_id
         )
         SELECT p.id, p.username, p.display_name, p.level,
                y.played, y.wins, y.podiums, y.best_score, y.best_finish,
                (${m.expr})::int AS value
         FROM tally y JOIN players p ON p.id = y.player_id
         WHERE ${m.having}
         ORDER BY (${m.expr}) ${m.dir}, y.wins DESC, y.played DESC, p.id ASC
         LIMIT $1`,
        [limit, kind]
      );
      return r.rows;
    },

    async playerCount(exec: Queryable, tournamentId: number): Promise<number> {
      const r = await exec.query<{ n: string }>(
        `SELECT COUNT(DISTINCT player_id)::text AS n FROM tournament_entries
         WHERE tournament_id = $1 AND status = 'completed'`,
        [tournamentId]
      );
      return parseInt(r.rows[0]?.n ?? '0', 10);
    },
  };
}

export type TournamentRepo = ReturnType<typeof createTournamentRepo>;
