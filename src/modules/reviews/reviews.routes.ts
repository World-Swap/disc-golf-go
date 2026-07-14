// src/modules/reviews/reviews.routes.ts — course reviews.

import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { badRequest, unauthorized } from '../../http/errors';
import type { ReviewsService } from './reviews.service';

function courseId(req: { params: { courseId: string } }): number {
  const id = parseInt(req.params.courseId, 10);
  if (Number.isNaN(id)) throw badRequest('Invalid course ID');
  return id;
}
function playerId(req: { player?: { id: number } }): number {
  if (!req.player) throw unauthorized();
  return req.player.id;
}

export function createReviewsRouter(service: ReviewsService, requireAuth: RequestHandler): Router {
  const router = Router();

  router.get('/courses/:courseId/reviews', asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(String(req.query.limit), 10) || 10, 50);
    const offset = Math.max(parseInt(String(req.query.offset), 10) || 0, 0);
    res.json(await service.getReviews(courseId(req), limit, offset));
  }));

  router.post('/courses/:courseId/reviews', requireAuth, asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as { rating?: unknown; review_text?: unknown };
    res.status(201).json(await service.submitReview(playerId(req), courseId(req), body.rating, body.review_text));
  }));

  router.delete('/courses/:courseId/reviews', requireAuth, asyncHandler(async (req, res) => {
    res.json(await service.deleteReview(playerId(req), courseId(req)));
  }));

  return router;
}
