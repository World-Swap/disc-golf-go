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

export function createTournamentRepo(_db: Queryable) {
  return {
    async find(exec: Queryable, weekKey: string): Promise<TournamentRow | null> {
      const r = await exec.query<TournamentRow>(
        `SELECT id, week_key, course_id, course_name, holes, starts_at, ends_at
         FROM tournaments WHERE week_key = $1`,
        [weekKey]
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
      endsAt: Date
    ): Promise<TournamentRow> {
      await client.query(
        `INSERT INTO tournaments (week_key, course_id, course_name, holes, starts_at, ends_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (week_key) DO NOTHING`,
        [weekKey, course.id, course.name, holes, startsAt, endsAt]
      );
      const r = await client.query<TournamentRow>(
        `SELECT id, week_key, course_id, course_name, holes, starts_at, ends_at
         FROM tournaments WHERE week_key = $1`,
        [weekKey]
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
