// src/modules/reviews/reviews.service.ts — course reviews (one per player/course).

import { badRequest, notFound } from '../../http/errors';
import type { Queryable } from '../../db/types';
import { createReviewsRepo, type ReviewsRepo } from './reviews.repo';

export function createReviewsService(db: Queryable, repo: ReviewsRepo = createReviewsRepo(db)) {
  return {
    async getReviews(courseId: number, limit: number, offset: number) {
      const [reviews, summary] = await Promise.all([repo.list(courseId, limit, offset), repo.summary(courseId)]);
      return { reviews, summary, pagination: { limit, offset } };
    },

    async submitReview(playerId: number, courseId: number, rating: unknown, reviewText: unknown) {
      if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
        throw badRequest('Rating must be an integer from 1 to 5');
      }
      if (!(await repo.courseExists(courseId))) throw notFound('Course not found');
      const text = reviewText ? String(reviewText).trim().slice(0, 2000) : null;
      return { success: true, review: await repo.upsert(playerId, courseId, rating, text) };
    },

    async deleteReview(playerId: number, courseId: number) {
      if ((await repo.remove(playerId, courseId)) === 0) throw notFound('Review not found');
      return { success: true };
    },
  };
}

export type ReviewsService = ReturnType<typeof createReviewsService>;
