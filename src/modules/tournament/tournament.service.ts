// src/modules/tournament/tournament.service.ts — the weekly tournament.
//
// One course, drawn at random, the same for everyone that week. Eighteen holes
// every time. Two attempts each, and an attempt is spent when it STARTS — walk
// away from a bad round and it is gone. That rule is the whole design: if
// entries were only spent on submission, a player would restart until the
// score suited them and the board would mean nothing.
//
// Scoring is not reimplemented here. A tournament round is a Throw Lab round,
// so it goes through the game service's submit(), which owns the hole-by-hole
// validation, the XP cap and the challenge settlement. This module records
// which attempt it was and where it places.

import { badRequest, notFound, conflict } from '../../http/errors';
import { withTransaction } from '../../db/pool';
import type { Database } from '../../db/types';
import { periodKey, periodStart } from '../game/game.catalog';
import type { TournamentRepo, TournamentRow, EntryRow } from './tournament.repo';

export const MAX_ENTRIES = 2;
export const TOURNAMENT_HOLES = 18;

export interface HoleResult { par: number; strokes: number }

/** The game service's submit(), narrowed to what the tournament needs. */
export interface RoundSubmitter {
  (playerId: number, input: { mode: 'course'; courseId: number | null; holes: HoleResult[] }): Promise<{
    round: { id: number; par: number; strokes: number; vsPar: number };
    xp_earned: number;
    challenges_completed: unknown[];
    new_badges: unknown[];
  }>;
}

export interface TournamentDeps {
  db: Database;
  repo: TournamentRepo;
  submitRound: RoundSubmitter;
}

export function createTournamentService(deps: TournamentDeps) {
  const { db, repo, submitRound } = deps;

  /** The week's tournament, created on first use so no scheduled job is needed. */
  async function current(now = new Date()): Promise<TournamentRow> {
    const weekKey = periodKey('weekly', now);
    const existing = await repo.find(db, weekKey);
    if (existing) return existing;

    return withTransaction(db, async (client) => {
      // Another request may have created it between the read and here.
      const again = await repo.find(client, weekKey);
      if (again) return again;

      const course = await repo.randomCourse(client);
      if (!course) throw badRequest('No course is available to hold a tournament on');

      const start = periodStart('weekly', now)!;
      const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
      return repo.create(client, weekKey, course, TOURNAMENT_HOLES, start, end);
    });
  }

  function entriesUsed(entries: EntryRow[]): number {
    // Every row counts, whatever its status: starting is what spends an entry.
    return entries.length;
  }

  function bestOf(entries: EntryRow[]): EntryRow | null {
    const done = entries.filter((e) => e.status === 'completed' && e.vs_par != null);
    if (!done.length) return null;
    return done.reduce((a, b) => (b.vs_par! < a.vs_par! ? b : a));
  }

  function shapeEntry(e: EntryRow) {
    return {
      id: e.id, attempt: e.attempt, status: e.status,
      par: e.par, strokes: e.strokes, vs_par: e.vs_par,
      started_at: e.started_at, completed_at: e.completed_at,
    };
  }

  return {
    current,

    /** Everything the tournament screen needs in one call. */
    async overview(playerId: number | null, now = new Date()) {
      const t = await current(now);
      const [board, players] = await Promise.all([
        repo.board(db, t.id, 25),
        repo.playerCount(db, t.id),
      ]);

      let mine: { entries: ReturnType<typeof shapeEntry>[]; used: number; remaining: number; best: ReturnType<typeof shapeEntry> | null; place: number | null; open_entry_id: number | null } | null = null;
      if (playerId != null) {
        const entries = await repo.entries(db, t.id, playerId);
        const used = entriesUsed(entries);
        const best = bestOf(entries);
        mine = {
          entries: entries.map(shapeEntry),
          used,
          remaining: Math.max(0, MAX_ENTRIES - used),
          best: best ? shapeEntry(best) : null,
          // From the whole field, not the 25 rows on screen.
          place: await repo.place(db, t.id, playerId),
          open_entry_id: entries.find((e) => e.status === 'in_progress')?.id ?? null,
        };
      }

      return {
        week_key: t.week_key,
        holes: t.holes,
        course: { id: t.course_id, name: t.course_name },
        starts_at: t.starts_at,
        ends_at: t.ends_at,
        max_entries: MAX_ENTRIES,
        players,
        leaderboard: board.map((r, i) => ({
          rank: i + 1,
          player_id: r.player_id,
          name: r.display_name || r.username || 'Player',
          level: r.level,
          vs_par: r.vs_par,
          strokes: r.strokes,
        })),
        me: mine,
      };
    },

    /**
     * Take an attempt and open it. This is the point of no return: the row
     * exists from here on, so closing the app mid-round still uses it up.
     */
    async startEntry(playerId: number, now = new Date()) {
      const t = await current(now);

      return withTransaction(db, async (client) => {
        const entries = await repo.entries(client, t.id, playerId);
        const used = entriesUsed(entries);
        if (used >= MAX_ENTRIES) {
          throw conflict(`You have used both entries for ${t.week_key}. The tournament resets Monday.`);
        }

        // Starting a new attempt closes one left open. It was already spent by
        // being started; this only stops it sitting "in progress" forever.
        await repo.abandonOpen(client, t.id, playerId);

        const attempt = used + 1;
        const entry = await repo.takeEntry(client, t.id, playerId, attempt);
        if (!entry) {
          // Someone else took this attempt number — two taps on Play.
          throw conflict('That entry was already started. Reload to see where you are.');
        }

        return {
          entry: shapeEntry(entry),
          entries_remaining: Math.max(0, MAX_ENTRIES - (used + 1)),
          tournament: {
            week_key: t.week_key,
            holes: t.holes,
            course: { id: t.course_id, name: t.course_name },
            ends_at: t.ends_at,
          },
        };
      });
    },

    /** Post a score against an open attempt. */
    async finishEntry(playerId: number, entryId: number, holes: HoleResult[], now = new Date()) {
      const t = await current(now);
      const entry = await repo.entryById(db, entryId, playerId);
      if (!entry) throw notFound('Entry not found');
      if (entry.tournament_id !== t.id) throw badRequest('That entry belongs to a past tournament');
      if (entry.status !== 'in_progress') {
        throw conflict(entry.status === 'completed' ? 'That entry already has a score' : 'That entry was abandoned');
      }
      if (!Array.isArray(holes) || holes.length !== t.holes) {
        throw badRequest(`A tournament round is ${t.holes} holes`);
      }

      // The game service validates and scores it, pays XP and settles
      // challenges — a tournament round is a Throw Lab round like any other.
      const played = await submitRound(playerId, { mode: 'course', courseId: t.course_id, holes });

      const saved = await withTransaction(db, (client) =>
        repo.completeEntry(client, entry.id, {
          par: played.round.par,
          strokes: played.round.strokes,
          vsPar: played.round.vsPar,
          gameRoundId: played.round.id,
        })
      );

      const entries = await repo.entries(db, t.id, playerId);
      const best = bestOf(entries);

      return {
        entry: shapeEntry(saved),
        best: best ? shapeEntry(best) : null,
        entries_remaining: Math.max(0, MAX_ENTRIES - entriesUsed(entries)),
        place: await repo.place(db, t.id, playerId),
        players: await repo.playerCount(db, t.id),
        xp_earned: played.xp_earned,
        challenges_completed: played.challenges_completed,
        new_badges: played.new_badges,
      };
    },

    /**
     * Give up an open attempt. The entry stays spent — this only records that
     * the player left, so the screen can say so instead of showing a round
     * that is still "in progress" days later.
     */
    async abandonEntry(playerId: number, entryId: number, now = new Date()) {
      const t = await current(now);
      const entry = await repo.entryById(db, entryId, playerId);
      if (!entry) throw notFound('Entry not found');
      if (entry.status !== 'in_progress') {
        const all = await repo.entries(db, t.id, playerId);
        return { entry: shapeEntry(entry), entries_remaining: Math.max(0, MAX_ENTRIES - entriesUsed(all)) };
      }

      await withTransaction(db, (client) => repo.abandonOpen(client, t.id, playerId));
      const entries = await repo.entries(db, t.id, playerId);
      const updated = entries.find((e) => e.id === entry.id)!;
      return {
        entry: shapeEntry(updated),
        entries_remaining: Math.max(0, MAX_ENTRIES - entriesUsed(entries)),
      };
    },

    async leaderboard(limit = 25, now = new Date()) {
      const t = await current(now);
      const board = await repo.board(db, t.id, limit);
      return {
        week_key: t.week_key,
        course: { id: t.course_id, name: t.course_name },
        holes: t.holes,
        ends_at: t.ends_at,
        leaderboard: board.map((r, i) => ({
          rank: i + 1,
          player_id: r.player_id,
          name: r.display_name || r.username || 'Player',
          level: r.level,
          vs_par: r.vs_par,
          strokes: r.strokes,
        })),
      };
    },
  };
}

export type TournamentService = ReturnType<typeof createTournamentService>;
