// src/modules/health/health.routes.ts — liveness probe. No DB dependency, so it
// stays green even if Postgres is unreachable (matches Render's health check).

import { Router } from 'express';
import { getSchedulerStatus } from '../../lib/scheduler';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({ status: 'healthy' });
});

// Read-only scheduler observability (job names + last-run timestamps only —
// no secrets). Lets the scheduler be verified over HTTP without Render logs.
healthRouter.get('/scheduler', (_req, res) => {
  res.json(getSchedulerStatus());
});
