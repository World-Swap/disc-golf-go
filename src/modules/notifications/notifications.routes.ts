// src/modules/notifications/notifications.routes.ts — user-facing notices.
// Admin notification/email management lives in the admin module.

import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { unauthorized, badRequest } from '../../http/errors';
import { createNotificationsRepo, type NotificationsRepo } from './notifications.repo';
import type { Queryable } from '../../db/types';

function playerId(req: { player?: { id: number } }): number {
  if (!req.player) throw unauthorized();
  return req.player.id;
}

export function createNotificationsRouter(db: Queryable, requireAuth: RequestHandler, repo: NotificationsRepo = createNotificationsRepo(db)): Router {
  const router = Router();

  router.get('/notifications/all', requireAuth, asyncHandler(async (req, res) => {
    res.json({ notifications: await repo.allActive(playerId(req)) });
  }));

  router.get('/notifications/active', requireAuth, asyncHandler(async (req, res) => {
    res.json({ notification: await repo.mostRecentActive(playerId(req)) });
  }));

  router.post('/notifications/:id/dismiss', requireAuth, asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) throw badRequest('Invalid notification id');
    await repo.dismiss(playerId(req), id);
    res.json({ ok: true });
  }));

  return router;
}
