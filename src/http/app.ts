// src/http/app.ts — assemble the Express app: middleware, feature routers, then
// the central error handler last. Kept free of business logic and of listen()
// so it can be imported directly in tests.

import express, { type Express } from 'express';
import { securityHeaders } from '../middleware/security';
import { errorHandler } from './error-handler';
import { healthRouter } from '../modules/health/health.routes';

export function createApp(): Express {
  const app = express();

  app.use(securityHeaders);
  app.use(express.json({ limit: '1mb' }));

  app.use('/health', healthRouter);

  // Feature routers mount here under /api as modules are built:
  //   app.use('/api', authRouter);

  // Error handler must be registered last.
  app.use(errorHandler);

  return app;
}
