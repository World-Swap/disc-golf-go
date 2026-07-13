// src/modules/index.ts — composition root. Wires feature modules with their
// real dependencies (DB pool, email transport, config) and returns a single
// router mounted under /api. This is the only place production wiring happens;
// tests build modules with fakes instead.

import { Router } from 'express';
import type { Database } from '../db/types';
import { sendEmail } from '../lib/email';
import { config } from '../config';
import { requireAuth, optionalAuth } from '../middleware/auth';

import { createAuthRepo } from './auth/auth.repo';
import { createAuthService } from './auth/auth.service';
import { createAuthRouter } from './auth/auth.routes';
import { createPlayersService } from './players/players.service';
import { createPlayersRouter } from './players/players.routes';
import { createCoursesService } from './courses/courses.service';
import { createCoursesRouter } from './courses/courses.routes';
import { createCheckinsService } from './checkins/checkins.service';
import { createCheckinsRouter } from './checkins/checkins.routes';
import { createLeaderboardService } from './leaderboard/leaderboard.service';
import { createLeaderboardRouter } from './leaderboard/leaderboard.routes';
import { createVaultService } from './vault/vault.service';
import { createVaultRouter } from './vault/vault.routes';
import { createTrainingService } from './training/training.service';
import { createTrainingRouter, createTrainingResolver } from './training/training.routes';

export function createApiRouter(db: Database): Router {
  const api = Router();
  const auth = requireAuth(db);
  const optAuth = optionalAuth(db);

  const authService = createAuthService({ repo: createAuthRepo(db), sendEmail, appBaseUrl: config.appBaseUrl });
  api.use(createAuthRouter(authService));

  const playersService = createPlayersService({ db });
  api.use(createPlayersRouter(playersService, auth));

  const coursesService = createCoursesService(db);
  api.use(createCoursesRouter(coursesService, optAuth));

  const checkinsService = createCheckinsService(db);
  api.use(createCheckinsRouter(checkinsService, auth));

  api.use(createLeaderboardRouter(createLeaderboardService(db), optAuth));
  api.use(createVaultRouter(createVaultService(db), auth, optAuth));

  // Training. onLessonCompleted (story-mission triggers) wired when story lands.
  const trainingService = createTrainingService({ db });
  api.use(createTrainingRouter(trainingService, createTrainingResolver(db)));

  // Future modules mount here: story, challenges, battles, ...

  return api;
}
