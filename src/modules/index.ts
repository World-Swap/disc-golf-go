// src/modules/index.ts — composition root. Wires feature modules with their
// real dependencies (DB pool, email transport, config) and returns a single
// router mounted under /api. This is the only place production wiring happens;
// tests build modules with fakes instead.

import { Router } from 'express';
import type { Database } from '../db/types';
import { sendEmail } from '../lib/email';
import { config } from '../config';
import { requireAuth } from '../middleware/auth';

import { createAuthRepo } from './auth/auth.repo';
import { createAuthService } from './auth/auth.service';
import { createAuthRouter } from './auth/auth.routes';
import { createPlayersService } from './players/players.service';
import { createPlayersRouter } from './players/players.routes';

export function createApiRouter(db: Database): Router {
  const api = Router();
  const auth = requireAuth(db);

  const authService = createAuthService({ repo: createAuthRepo(db), sendEmail, appBaseUrl: config.appBaseUrl });
  api.use(createAuthRouter(authService));

  const playersService = createPlayersService({ db });
  api.use(createPlayersRouter(playersService, auth));

  // Future modules mount here: courses, checkins, ...

  return api;
}
