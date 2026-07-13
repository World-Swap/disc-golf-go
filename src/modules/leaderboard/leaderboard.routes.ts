// src/modules/leaderboard/leaderboard.routes.ts — HTTP layer. All routes use
// optionalAuth so the current player is highlighted when logged in.

import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../../http/async-handler';
import type { LeaderboardService } from './leaderboard.service';

export function createLeaderboardRouter(service: LeaderboardService, optionalAuth: RequestHandler): Router {
  const router = Router();

  router.get(
    '/leaderboard/top5',
    optionalAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.top5(req.player?.id ?? null));
    })
  );

  router.get(
    '/leaderboard',
    optionalAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.leaderboard(req.query.tab, req.query.period, req.player?.id ?? null));
    })
  );

  router.get(
    '/leaderboard/crews/training',
    optionalAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.crewsTraining(req.player?.id ?? null));
    })
  );

  return router;
}
