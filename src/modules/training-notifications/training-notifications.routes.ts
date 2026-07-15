// src/modules/training-notifications/training-notifications.routes.ts
// Uses the shared training resolver (JWT or x-guest-uuid).

import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { unauthorized, badRequest } from '../../http/errors';
import type { TrainingNotificationsService } from './training-notifications.service';

function requirePlayerId(req: { player?: { id: number } }): number {
  if (!req.player) throw unauthorized();
  return req.player.id;
}

export function createTrainingNotificationsRouter(service: TrainingNotificationsService, resolve: RequestHandler): Router {
  const router = Router();

  router.get('/training/notifications/settings', resolve, asyncHandler(async (req, res) => {
    res.json(await service.getSettings(requirePlayerId(req)));
  }));

  router.put('/training/notifications/settings', resolve, asyncHandler(async (req, res) => {
    res.json(await service.updateSettings(requirePlayerId(req), (req.body ?? {}) as Record<string, unknown>));
  }));

  router.get('/training/notifications', resolve, asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 50);
    const offset = parseInt(String(req.query.offset ?? '0'), 10) || 0;
    res.json(await service.list(requirePlayerId(req), limit, offset));
  }));

  // Bell count: anonymous callers just get 0 (no 401).
  router.get('/training/notifications/unread-count', resolve, asyncHandler(async (req, res) => {
    if (!req.player) return void res.json({ unread_count: 0 });
    res.json(await service.unreadCount(req.player.id));
  }));

  router.post('/training/notifications/:id/read', resolve, asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) throw badRequest('Invalid notification id');
    res.json(await service.markRead(requirePlayerId(req), id));
  }));

  router.post('/training/notifications/read-all', resolve, asyncHandler(async (req, res) => {
    res.json(await service.markAllRead(requirePlayerId(req)));
  }));

  router.post('/training/notifications/record-tip', resolve, asyncHandler(async (req, res) => {
    const lessonId = Number((req.body as { lesson_id?: unknown })?.lesson_id);
    res.json(await service.recordTip(requirePlayerId(req), lessonId));
  }));

  return router;
}
