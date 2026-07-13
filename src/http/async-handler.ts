// src/http/async-handler.ts — wrap an async route handler so any rejection is
// forwarded to the central error handler via next(err). Every async route is
// registered through this, so no handler needs its own try/catch for errors.

import type { RequestHandler } from 'express';

export const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
