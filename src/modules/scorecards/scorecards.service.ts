// src/modules/scorecards/scorecards.service.ts — rules for keeping a scorecard
// at a real course: start a round, score holes as you play, finish it.

import { badRequest, notFound } from '../../http/errors';
import type { ScorecardsRepo } from './scorecards.repo';

export const MAX_HOLES = 36;
export const MAX_STROKES = 20;   // a generous ceiling; beyond this it's a typo

export interface StartInput {
  /** Omitted on a blank card, or when the course came from the live map. */
  courseId?: number | null;
  /** What the player calls the place. Free text; we do not own this list. */
  courseName?: string | null;
  holes: number;
  pars?: number[] | null;
}

/** The longest course name we will store. A name, not an essay. */
export const MAX_COURSE_NAME = 80;

export function createScorecardsService(deps: { repo: ScorecardsRepo }) {
  const { repo } = deps;

  // Per-hole pars, defaulting to par 3 — which is what the overwhelming
  // majority of disc golf holes are, and what the courses table implies
  // when its total par is simply 3 × holes.
  function parsFor(holes: number, given?: number[] | null): number[] {
    if (!given || !given.length) return Array.from({ length: holes }, () => 3);
    if (given.length !== holes) throw badRequest('pars must have one entry per hole');
    return given.map((p) => {
      const n = Math.round(Number(p));
      if (!Number.isFinite(n) || n < 2 || n > 6) throw badRequest('Each par must be between 2 and 6');
      return n;
    });
  }

  return {
    async start(playerId: number, input: StartInput) {
      const holes = Math.round(Number(input.holes));
      if (!Number.isFinite(holes) || holes < 1 || holes > MAX_HOLES) {
        throw badRequest('holes must be between 1 and ' + MAX_HOLES);
      }

      // A course is OPTIONAL now. The card is a blank card you fill in on the
      // first tee: you may be at a course we have never heard of, at one the
      // live map found but our table has no id for, or in a field. A course id
      // is still honoured when it is given and real, because check-in and
      // "your best round here" are keyed on it.
      let courseId: number | null = null;
      if (input.courseId !== null && input.courseId !== undefined && String(input.courseId) !== '') {
        const id = Math.round(Number(input.courseId));
        if (!Number.isFinite(id)) throw badRequest('courseId must be a number');
        // An id we do not have is still a REFUSAL rather than a silent blank
        // card: it means the caller believes it is scoring a specific course,
        // and quietly dropping that would file the round against nothing.
        if (!(await repo.courseExists(id))) throw notFound('Course not found');
        courseId = id;
      }

      const courseName =
        typeof input.courseName === 'string' && input.courseName.trim()
          ? input.courseName.trim().slice(0, MAX_COURSE_NAME)
          : null;

      const pars = parsFor(holes, input.pars);
      const card = await repo.create(playerId, courseId, courseName, holes, pars.reduce((a, b) => a + b, 0));
      await repo.addHoles(
        card.id,
        pars.map((par, i) => ({ hole_number: i + 1, par }))
      );
      return { ...card, hole_scores: await repo.holes(card.id) };
    },

    async get(playerId: number, scorecardId: number) {
      const card = await repo.owned(playerId, scorecardId);
      if (!card) throw notFound('Scorecard not found');
      return { ...card, hole_scores: await repo.holes(scorecardId) };
    },

    async scoreHole(playerId: number, scorecardId: number, holeNumber: number, strokes: number | null) {
      const card = await repo.owned(playerId, scorecardId);
      if (!card) throw notFound('Scorecard not found');
      if (card.completed) throw badRequest('That round is already finished');

      const hole = Math.round(Number(holeNumber));
      if (!Number.isFinite(hole) || hole < 1 || hole > card.holes) throw badRequest('No such hole on this card');

      // null clears a hole the player hasn't played yet.
      let value: number | null = null;
      if (strokes !== null && strokes !== undefined) {
        value = Math.round(Number(strokes));
        if (!Number.isFinite(value) || value < 1 || value > MAX_STROKES) {
          throw badRequest('Strokes must be between 1 and ' + MAX_STROKES);
        }
      }
      const total = await repo.setHole(scorecardId, hole, value);
      return { id: scorecardId, hole_number: hole, strokes: value, total_strokes: total };
    },

    /**
     * Change a hole's par while the round is going. Every hole starts at 3 --
     * which is what most disc golf holes are -- and the player bumps the odd
     * 4 or 5 as they reach it, which is the only way a blank card can be
     * accurate at a course nobody has surveyed for us.
     */
    async setPar(playerId: number, scorecardId: number, holeNumber: number, par: number) {
      const card = await repo.owned(playerId, scorecardId);
      if (!card) throw notFound('Scorecard not found');
      if (card.completed) throw badRequest('That round is already finished');

      const hole = Math.round(Number(holeNumber));
      if (!Number.isFinite(hole) || hole < 1 || hole > card.holes) throw badRequest('No such hole on this card');

      const value = Math.round(Number(par));
      if (!Number.isFinite(value) || value < 2 || value > 6) throw badRequest('Par must be between 2 and 6');

      const total = await repo.setPar(scorecardId, hole, value);
      return { id: scorecardId, hole_number: hole, par: value, total_par: total };
    },

    async finish(playerId: number, scorecardId: number) {
      const card = await repo.owned(playerId, scorecardId);
      if (!card) throw notFound('Scorecard not found');
      if (card.completed) return { ...card, hole_scores: await repo.holes(scorecardId) };

      const holes = await repo.holes(scorecardId);
      const played = holes.filter((h) => h.strokes != null);
      if (!played.length) throw badRequest('Score at least one hole before finishing');

      const done = await repo.finish(scorecardId);
      // Par is counted over the holes actually played, so an abandoned round
      // at hole 7 doesn't read as 11 under par.
      const parPlayed = played.reduce((sum, h) => sum + h.par, 0);
      return {
        ...done,
        holes_played: played.length,
        par_played: parPlayed,
        vs_par: done.strokes - parPlayed,
        hole_scores: holes,
      };
    },

    async remove(playerId: number, scorecardId: number) {
      const deleted = await repo.remove(playerId, scorecardId);
      if (!deleted) throw notFound('Scorecard not found');
      return { success: true };
    },

    async list(playerId: number, limit: number) {
      return repo.listForPlayer(playerId, Math.min(Math.max(limit || 20, 1), 100));
    },

    async bestAt(playerId: number, courseId: number) {
      const best = await repo.bestForCourse(playerId, courseId);
      if (!best) return null;
      const par = best.par_played || best.par;
      return { ...best, vs_par: best.strokes - par };
    },
  };
}

export type ScorecardsService = ReturnType<typeof createScorecardsService>;
