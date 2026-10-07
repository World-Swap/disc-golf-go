// src/modules/health/health.routes.ts — liveness and readiness, deliberately
// separate endpoints with different jobs.
//
//   GET /health        LIVENESS. "Is this process running?" No database call,
//                      so a transient Neon blip can never make Render restart a
//                      container that is otherwise fine. This is what Render's
//                      health check points at, and it should stay DB-free.
//
//   GET /health/ready  READINESS. "Can this process actually serve requests?"
//                      Hits the database and answers 503 when it cannot. For
//                      monitoring and for answering "is it really up?" without
//                      reading deploy logs -- NOT for Render's restart policy,
//                      because tying restarts to database health turns a brief
//                      outage into a restart loop.
//
// Neither of these gates a deploy. That is startup's job: src/db/probe.ts exits
// non-zero when the database is unreachable, so a broken deploy fails and the
// previous version keeps serving. Before that existed, a process with a dead
// database opened its port, passed this liveness check, and went live green.

import { Router } from 'express';
import { getSchedulerStatus } from '../../lib/scheduler';
import type { Database } from '../../db/types';

export function createHealthRouter(db: Database): Router {
  const healthRouter = Router();

  healthRouter.get('/', (_req, res) => {
    res.json({ status: 'healthy' });
  });

  healthRouter.get('/ready', async (_req, res) => {
    const startedAt = Date.now();
    try {
      await db.query('SELECT 1');
      res.json({ status: 'ready', database: 'up', latency_ms: Date.now() - startedAt });
    } catch (err) {
      res.status(503).json({
        status: 'not_ready',
        database: 'down',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Read-only scheduler observability (job names + last-run timestamps only —
  // no secrets). Lets the scheduler be verified over HTTP without Render logs.
  healthRouter.get('/scheduler', (_req, res) => {
    res.json(getSchedulerStatus());
  });

  return healthRouter;
}
