// src/http/error-handler.ts — the one place errors become responses.
// One shape everywhere: { error: string }. Known AppErrors keep their status;
// everything else is logged and returned as a generic 500.

import type { ErrorRequestHandler } from 'express';
import { AppError } from './errors';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (res.headersSent) return;

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, ...err.details });
    return;
  }

  console.error('[error]', err?.stack || err?.message || err);
  res.status(500).json({ error: 'Internal server error' });
};
