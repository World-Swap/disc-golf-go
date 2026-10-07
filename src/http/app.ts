// src/http/app.ts — assemble the Express app: middleware, feature routers, then
// the central error handler last. Kept free of business logic and of listen()
// so it can be imported directly in tests.

import express, { type Express } from 'express';
import { securityHeaders } from '../middleware/security';
import { errorHandler } from './error-handler';
import { createHealthRouter } from '../modules/health/health.routes';
import { createApiRouter } from '../modules';
import { mountFrontend, comHostSplit, robotsTxt, PROMO_HOSTS } from './static';
import { learnPages } from './learn';
import type { Database } from '../db/types';

export interface AppOptions {
  serveFrontend?: boolean;
}

export function createApp(db: Database, opts: AppOptions = {}): Express {
  const app = express();

  // Behind Render's proxy: trust X-Forwarded-* so req.hostname/req.ip are correct.
  //
  // A COUNT, not `true`. With `true` Express trusts every hop, which makes
  // req.ip the LEFTMOST X-Forwarded-For entry -- and that entry is whatever the
  // client sent, because a proxy appends to the header rather than replacing
  // it. Every per-IP rate limit was therefore bypassable by adding one header:
  // measured on the signup limit (5/hour), a fixed X-Forwarded-For got 429 on
  // the 6th request while a rotating one never got a 429 at all.
  //
  // With a count of n, Express skips the n hops nearest the app and takes the
  // address the outermost trusted proxy actually observed. One hop is right for
  // Render today; TRUST_PROXY_HOPS exists so that is correctable from the
  // dashboard without a deploy if it ever gains another. Setting it too HIGH is
  // the safer error (real users share a bucket and get limited together);
  // setting it too low hands the key back to the client.
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || 1);

  app.use(securityHeaders);

  // Before comHostSplit and the static middleware: both would answer /robots.txt
  // first, and it has to differ between the marketing domain and the app.
  app.use(robotsTxt());

  // discgolfgo.com = promo site; app routes there redirect to discgolfgo.app.
  // Runs before /api and the frontend so it can intercept. No-op on .app.
  if (opts.serveFrontend !== false) {
    // Before comHostSplit: it redirects any extensionless .com path it does not
    // recognise off to the app domain, which would swallow /learn.
    app.use(learnPages(PROMO_HOSTS));
    app.use(comHostSplit());
  }

  app.use(express.json({ limit: '1mb' }));

  app.use('/health', createHealthRouter(db));

  app.use('/api', createApiRouter(db));

  // Serve the web/ frontend (skippable so tests stay API-only).
  if (opts.serveFrontend !== false) {
    mountFrontend(app);
  }

  // Error handler must be registered last.
  app.use(errorHandler);

  return app;
}
