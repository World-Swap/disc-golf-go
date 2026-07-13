// src/modules/players/players.routes.ts — HTTP layer for the players feature.
// All routes require auth (injected). Thin: parse, call service, respond.

import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { unauthorized } from '../../http/errors';
import { parseProfileUpdate } from './players.validation';
import type { PlayersService } from './players.service';

function playerId(req: { player?: { id: number } }): number {
  if (!req.player) throw unauthorized();
  return req.player.id;
}

export function createPlayersRouter(service: PlayersService, requireAuth: RequestHandler): Router {
  const router = Router();

  router.get(
    '/players/me',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.getMe(playerId(req)));
    })
  );

  router.get(
    '/players/badges',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.getBadges(playerId(req)));
    })
  );

  router.get(
    '/players/progress',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.getProgress(playerId(req)));
    })
  );

  router.get(
    '/players/xp-history',
    requireAuth,
    asyncHandler(async (req, res) => {
      const limit = Math.min(parseInt(String(req.query.limit ?? '30'), 10) || 30, 100);
      res.json(await service.getXpHistory(playerId(req), limit));
    })
  );

  router.put(
    '/players/me',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.updateProfile(playerId(req), parseProfileUpdate(req.body)));
    })
  );

  router.post(
    '/players/reset-progress',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.resetProgress(playerId(req)));
    })
  );

  return router;
}
