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
    const out: Record<string, unknown> = {};
    try {
      const r = await db.query<{ now: Date; db: string }>('SELECT NOW() AS now, current_database() AS db');
      out.connection = 'ok';
      out.now = r.rows[0]?.now;
      out.database = r.rows[0]?.db;
    } catch (err) {
      const e = err as Error & { code?: string };
      return res.status(500).json({ connection: 'error', code: e.code ?? null, message: e.message });
    }
    try {
      const t = await db.query<{ n: string }>("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = 'public'");
      out.public_tables = parseInt(t.rows[0]?.n ?? '0', 10);
      const c = await db.query<{ n: string }>('SELECT COUNT(*) AS n FROM courses');
      out.courses = parseInt(c.rows[0]?.n ?? '0', 10);
    } catch (err) {
      const e = err as Error & { code?: string };
      out.query_error = { code: e.code ?? null, message: e.message };
    }
    res.json(out);
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
