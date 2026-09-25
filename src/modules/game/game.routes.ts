// src/modules/game/game.routes.ts — HTTP layer for Throw Lab.

import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { unauthorized } from '../../http/errors';
import type { GameService } from './game.service';

export function createGameRouter(service: GameService, requireAuth: RequestHandler, optionalAuth: RequestHandler): Router {
  const router = Router();
  const player = (req: { player?: { id: number } }) => {
    if (!req.player) throw unauthorized();
    return req.player.id;
  };

  // Submit a finished round: the server scores it, pays XP and settles
  // challenges. The client never says how much it earned.
  router.post(
    '/game/rounds',
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      res.status(201).json(
        await service.submit(player(req), {
          mode: body.mode,
          courseId: body.course_id ?? null,
          holes: body.holes,
        })
      );
    })
  );

  router.get(
    '/game/challenges',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.challenges(player(req)));
    })
  );

  router.get(
    '/game/stats',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.stats(player(req)));
    })
  );

  // Public so the ranking can be seen before signing in.
  router.get(
    '/game/leaderboard',
    optionalAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.leaderboard(req.query.period, parseInt(String(req.query.limit ?? '25'), 10)));
    })
  );

  return router;
}
