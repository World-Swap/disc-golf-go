// src/modules/tournament/tournament.routes.ts — HTTP layer for the weekly
// tournament.

import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { badRequest, unauthorized } from '../../http/errors';
import type { TournamentService } from './tournament.service';

export function createTournamentRouter(
  service: TournamentService,
  requireAuth: RequestHandler,
  optionalAuth: RequestHandler
): Router {
  const router = Router();
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
    '/tournament',
    optionalAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.overview(req.player?.id ?? null));
    })
  );

  // Take an attempt. This spends it: leaving the round does not give it back.
  router.post(
    '/tournament/entries',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.startEntry(player(req)));
    })
  );

  router.post(
    '/tournament/entries/:id/finish',
    requireAuth,
    asyncHandler(async (req, res) => {
      const holes = (req.body ?? {}).holes;
      res.json(await service.finishEntry(player(req), entryId(req.params.id), holes));
    })
  );

  router.post(
    '/tournament/entries/:id/abandon',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.abandonEntry(player(req), entryId(req.params.id)));
    })
  );

  router.get(
    '/tournament/leaderboard',
    optionalAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.leaderboard(parseInt(String(req.query.limit ?? '25'), 10) || 25));
    })
  );

  return router;
}
