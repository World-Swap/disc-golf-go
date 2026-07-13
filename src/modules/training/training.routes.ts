// src/modules/training/training.routes.ts — HTTP layer for training. Uses a
// resolver that accepts either a JWT or the x-guest-uuid header (guests can
// train), attaching req.player when present. Browse endpoints personalize when
// present; the rest require a player.

import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { unauthorized, badRequest } from '../../http/errors';
import { verifyToken } from '../../middleware/auth';
import type { Database } from '../../db/types';
import type { TrainingService } from './training.service';

// Resolve a player from a Bearer token or the legacy x-guest-uuid header.
export function createTrainingResolver(db: Database): RequestHandler {
  return async (req, _res, next) => {
    const header = req.headers['authorization'];
    if (header && header.startsWith('Bearer ')) {
      try {
        req.player = verifyToken(header.slice(7));
        return next();
      } catch {
        /* fall through to guest / anonymous */
      }
    }
    const guestUuid = req.headers['x-guest-uuid'];
    if (typeof guestUuid === 'string' && guestUuid) {
      try {
        const r = await db.query<{ id: number; player_uuid: string }>('SELECT id, player_uuid FROM players WHERE guest_uuid = $1 LIMIT 1', [guestUuid]);
        if (r.rows[0]) req.player = r.rows[0];
      } catch (err) {
        console.warn('[training] guest lookup failed:', (err as Error).message);
      }
    }
    next();
  };
}

function requirePlayerId(req: { player?: { id: number } }): number {
  if (!req.player) throw unauthorized();
  return req.player.id;
}

export function createTrainingRouter(service: TrainingService, resolve: RequestHandler): Router {
  const router = Router();

  router.get('/training/categories', resolve, asyncHandler(async (req, res) => {
    res.json(await service.listCategories(req.player?.id ?? null, req.query.level));
  }));

  router.get('/training/categories/:slug/lessons', resolve, asyncHandler(async (req, res) => {
    res.json(await service.listLessons(req.player?.id ?? null, req.params.slug, req.query.level));
  }));

  router.get('/training/lessons/:id', resolve, asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) throw badRequest('Invalid lesson ID');
    res.json(await service.getLesson(req.player?.id ?? null, id));
  }));

  router.get('/training/lessons/:id/resources', asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) throw badRequest('Invalid lesson ID');
    res.json(await service.getResources(id));
  }));

  router.post('/training/completions', resolve, asyncHandler(async (req, res) => {
    const playerId = requirePlayerId(req);
    const lessonId = Number((req.body as { lesson_id?: unknown })?.lesson_id);
    if (!lessonId) throw badRequest('lesson_id is required');
    res.json(await service.completeLesson(playerId, lessonId));
  }));

  router.post('/training/completions/:id/share', resolve, asyncHandler(async (req, res) => {
    res.json(await service.shareCompletion(requirePlayerId(req), parseInt(req.params.id, 10)));
  }));

  router.get('/training/progress', resolve, asyncHandler(async (req, res) => {
    res.json(await service.getProgress(requirePlayerId(req)));
  }));

  router.get('/training/streak', resolve, asyncHandler(async (req, res) => {
    res.json(await service.getStreak(requirePlayerId(req)));
  }));

  router.get('/training/milestones', resolve, asyncHandler(async (req, res) => {
    res.json(await service.getMilestones(requirePlayerId(req)));
  }));

  router.post('/training/milestones/check', resolve, asyncHandler(async (req, res) => {
    res.json(await service.checkMilestones(requirePlayerId(req)));
  }));

  return router;
}
