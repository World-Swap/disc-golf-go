// src/http/app.ts — assemble the Express app: middleware, feature routers, then
// the central error handler last. Kept free of business logic and of listen()
// so it can be imported directly in tests.

import express, { type Express } from 'express';
import { securityHeaders } from '../middleware/security';
import { errorHandler } from './error-handler';
import { healthRouter } from '../modules/health/health.routes';
import { createApiRouter } from '../modules';
import { mountFrontend } from './static';
import type { Database } from '../db/types';

export interface AppOptions {
  serveFrontend?: boolean;
}

export function createApp(db: Database, opts: AppOptions = {}): Express {
  const app = express();

  app.use(securityHeaders);
  app.use(express.json({ limit: '1mb' }));

  app.use('/health', healthRouter);

  // Temporary DB diagnostic — surfaces the exact connection error in the browser
  // so we can pinpoint a Neon/DATABASE_URL problem without Render log access.
  app.get('/health/db', async (_req, res) => {
    try {
      const r = await db.query<{ ok: number; now: Date }>('SELECT 1 AS ok, NOW() AS now');
      res.json({ db: 'ok', now: r.rows[0]?.now });
    } catch (err) {
      const e = err as Error & { code?: string };
      res.status(500).json({ db: 'error', code: e.code ?? null, message: e.message });
    }
  });

  app.use('/api', createApiRouter(db));

  // Serve the web/ frontend (skippable so tests stay API-only).
  if (opts.serveFrontend !== false) {
    mountFrontend(app);
  }

  // Error handler must be registered last.
  app.use(errorHandler);

  return app;
}
