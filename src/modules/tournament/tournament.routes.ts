// src/modules/tournament/tournament.routes.ts — HTTP layer for the tournaments.
//
// Mounted twice, once per kind. The weekly keeps the bare paths it has always
// had (/api/tournament, /api/tournament/entries, ...) because four pages in
// web/ already call them and a daily tournament is no reason to break them;
// the daily gets the same shape under /api/tournament/daily.

import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { badRequest, unauthorized } from '../../http/errors';
import type { TournamentService } from './tournament.service';

export function createTournamentRouter(
  service: TournamentService,
  requireAuth: RequestHandler,
  optionalAuth: RequestHandler,
  /** Path prefix under /api: 'tournament' for the weekly, 'tournament/daily'. */
  base = 'tournament'
): Router {
  const router = Router();
  const at = (suffix = '') => `/${base}${suffix}`;
  const player = (req: { player?: { id: number } }) => {
    if (!req.player) throw unauthorized();
    return req.player.id;
  };
  const entryId = (raw: unknown) => {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n <= 0) throw badRequest('A valid entry id is required');
    return n;
  };

  // The week's course, the board, and — when signed in — your entries.
  // Optional auth so the board can be read before signing in.
  router.get(
    at(),
    optionalAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.overview(req.player?.id ?? null));
    })
  );

  // Take an attempt. This spends it: leaving the round does not give it back.
  router.post(
    at('/entries'),
    requireAuth,
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.startEntry(player(req)));
    })
  );

  router.post(
    at('/entries/:id/finish'),
    requireAuth,
    asyncHandler(async (req, res) => {
      const holes = (req.body ?? {}).holes;
      res.json(await service.finishEntry(player(req), entryId(req.params.id), holes));
    })
  );

  router.post(
    at('/entries/:id/abandon'),
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.abandonEntry(player(req), entryId(req.params.id)));
    })
  );

  // A player's own tournament record — played, wins, podiums, past weeks.
  router.get(
    at('/career'),
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.career(player(req)));
    })
  );

  // All-time boards — wins, podiums, weeks played. Public, like the weekly one.
  router.get(
    at('/records'),
    optionalAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.records(
        req.query.metric,
        parseInt(String(req.query.limit ?? '25'), 10) || 25,
        req.player?.id ?? null
      ));
    })
  );

  router.get(
    at('/leaderboard'),
    optionalAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.leaderboard(parseInt(String(req.query.limit ?? '25'), 10) || 25));
    })
  );

  return router;
}
