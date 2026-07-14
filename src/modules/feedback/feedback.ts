// src/modules/feedback/feedback.ts — public landing-page feedback submission.

import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { badRequest } from '../../http/errors';
import type { Queryable } from '../../db/types';

const VALID_CATEGORIES = ['Feedback', 'Suggestion', 'Bug Report'];

export function createFeedbackRouter(db: Queryable): Router {
  const router = Router();

  router.post('/feedback', asyncHandler(async (req, res) => {
    const { name, email, category, message } = (req.body ?? {}) as Record<string, unknown>;

    if (typeof message !== 'string' || message.trim().length < 10) {
      throw badRequest('Message is required and must be at least 10 characters.');
    }
    if (typeof category !== 'string' || !VALID_CATEGORIES.includes(category)) {
      throw badRequest('Invalid category. Choose: Feedback, Suggestion, or Bug Report.');
    }

    await db.query('INSERT INTO feedback (name, email, category, message) VALUES ($1, $2, $3, $4)', [
      typeof name === 'string' ? name.trim().slice(0, 100) : null,
      typeof email === 'string' ? email.trim().slice(0, 255) : null,
      category,
      message.trim().slice(0, 2000),
    ]);

    res.json({ success: true, message: 'Thanks for your feedback!' });
  }));

  return router;
}
