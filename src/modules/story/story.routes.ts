// src/modules/story/story.routes.ts — HTTP layer for missions + daily challenge.

import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { unauthorized } from '../../http/errors';
import type { StoryService } from './story.service';

function playerId(req: { player?: { id: number } }): number {
  if (!req.player) throw unauthorized();
  return req.player.id;
}

export function createStoryRouter(service: StoryService, requireAuth: RequestHandler): Router {
  const router = Router();

  router.get('/story/missions', requireAuth, asyncHandler(async (req, res) => {
    res.json(await service.getMissions(playerId(req)));
  }));

  router.get('/story/daily', requireAuth, asyncHandler(async (req, res) => {
    res.json(await service.getDaily(playerId(req)));
  }));

  return router;
}
