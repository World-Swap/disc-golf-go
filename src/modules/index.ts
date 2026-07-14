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
import { createStoryService } from './story/story.service';
import { createStoryRouter } from './story/story.routes';
import { checkMissionsFromTraining } from './story/quest-engine';
import { advanceDailyChallenge } from './story/daily-challenge';
import { createChallengesService } from './challenges/challenges.service';
import { createChallengesRouter } from './challenges/challenges.routes';
import { createTrainingNotificationsService } from './training-notifications/training-notifications.service';
import { createTrainingNotificationsRouter } from './training-notifications/training-notifications.routes';
import { createShopService } from './shop/shop.service';
import { createShopRouter } from './shop/shop.routes';
import { createOnboardingService } from './onboarding/onboarding.service';
import { createOnboardingRouter } from './onboarding/onboarding.routes';
import { createReviewsService } from './reviews/reviews.service';
import { createReviewsRouter } from './reviews/reviews.routes';
import { createFeedbackRouter } from './feedback/feedback';
import { createUploadRouter } from './upload/upload.routes';
import { createDeleteAccountService } from './delete-account/delete-account.service';
import { createDeleteAccountRouter } from './delete-account/delete-account.routes';

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

  // Training — story-mission + daily-challenge triggers fire (fire-and-forget)
  // on a brand-new lesson completion. The resolver (JWT or x-guest-uuid) is
  // shared with training-notifications.
  const trainingResolve = createTrainingResolver(db);
  const trainingService = createTrainingService({
    db,
    onLessonCompleted: (playerId, lesson) => {
      const today = new Date().toISOString().split('T')[0]!;
      void checkMissionsFromTraining(db, playerId, lesson).catch((e) => console.error('[training] checkMissionsFromTraining:', e.message));
      void advanceDailyChallenge(db, playerId, today, 1).catch((e) => console.error('[training] advanceDailyChallenge:', e.message));
    },
  });
  api.use(createTrainingRouter(trainingService, trainingResolve));
  api.use(createTrainingNotificationsRouter(createTrainingNotificationsService(db), trainingResolve));

  api.use(createStoryRouter(createStoryService(db), auth));
  api.use(createChallengesRouter(createChallengesService(db), auth));
  api.use(createShopRouter(createShopService(db), auth));
  api.use(createOnboardingRouter(createOnboardingService(db), trainingResolve));
  api.use(createReviewsRouter(createReviewsService(db), auth));
  api.use(createFeedbackRouter(db));
  api.use(createUploadRouter(db, auth));
  api.use(createDeleteAccountRouter(createDeleteAccountService({ db }), auth));

  // Future modules mount here: referrals, notifications, admin, ...

  return api;
}
