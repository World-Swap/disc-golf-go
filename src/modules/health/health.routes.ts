// src/modules/health/health.routes.ts — liveness probe. No DB dependency, so it
// stays green even if Postgres is unreachable (matches Render's health check).

import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({ status: 'healthy' });
});
