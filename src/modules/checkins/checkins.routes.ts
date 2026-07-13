// src/modules/checkins/checkins.routes.ts — HTTP layer for check-ins. All
// routes require auth.

import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { unauthorized } from '../../http/errors';
import { parseCheckin } from './checkins.validation';
import type { CheckinsService } from './checkins.service';

function playerId(req: { player?: { id: number } }): number {
  if (!req.player) throw unauthorized();
  return req.player.id;
}

export function createCheckinsRouter(service: CheckinsService, requireAuth: RequestHandler): Router {
  const router = Router();

  router.post(
    '/checkins',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.checkIn(playerId(req), parseCheckin(req.body)));
    })
  );

  router.get(
    '/checkins/status',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.status(playerId(req), parseInt(String(req.query.course_id), 10)));
    })
  );

  router.get(
    '/checkins/at-course',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.atCourse(playerId(req), parseInt(String(req.query.course_id), 10)));
    })
  );

  router.get(
    '/checkins/me',
    requireAuth,
    asyncHandler(async (req, res) => {
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
      const offset = Math.max(0, parseInt(String(req.query.offset ?? '0'), 10) || 0);
      res.json(await service.history(playerId(req), limit, offset));
    })
  );

  return router;
}
