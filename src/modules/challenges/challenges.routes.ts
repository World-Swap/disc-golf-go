// src/modules/challenges/challenges.routes.ts — HTTP layer for challenges.

import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { unauthorized, badRequest } from '../../http/errors';
import type { ChallengesService } from './challenges.service';

function playerId(req: { player?: { id: number } }): number {
  if (!req.player) throw unauthorized();
  return req.player.id;
}

export function createChallengesRouter(service: ChallengesService, requireAuth: RequestHandler): Router {
  const router = Router();

  router.get('/challenges/board', requireAuth, asyncHandler(async (req, res) => {
    res.json(await service.getBoard(playerId(req)));
  }));

  router.post('/challenges/slots/:slotId/claim', requireAuth, asyncHandler(async (req, res) => {
    const slotId = parseInt(req.params.slotId, 10);
    if (Number.isNaN(slotId)) throw badRequest('Invalid slot ID');
    res.json(await service.claimSlot(playerId(req), slotId));
  }));

  router.get('/challenges/leaderboard', asyncHandler(async (_req, res) => {
    res.json(await service.leaderboard());
  }));

  router.get('/challenges', requireAuth, asyncHandler(async (req, res) => {
    res.json(await service.listPermanent(playerId(req)));
  }));

  router.post('/challenges/:id/progress', requireAuth, asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) throw badRequest('Invalid challenge ID');
    res.json(await service.syncProgress(playerId(req), id));
  }));

  return router;
}
