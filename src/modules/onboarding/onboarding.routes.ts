// src/modules/onboarding/onboarding.routes.ts — onboarding funnel + state.
// Uses the shared training resolver (JWT or x-guest-uuid). The admin-only
// funnel analytics endpoint lives in the admin module.

import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { unauthorized } from '../../http/errors';
import type { OnboardingService } from './onboarding.service';

export function createOnboardingRouter(service: OnboardingService, resolve: RequestHandler): Router {
  const router = Router();

  // Anonymous funnel event tracking (no auth — fired during onboarding).
  router.post('/onboarding/event', asyncHandler(async (req, res) => {
    res.json(await service.trackEvent((req.body ?? {}) as Record<string, unknown>));
  }));

  router.put('/onboarding/experience', resolve, asyncHandler(async (req, res) => {
    if (!req.player) throw unauthorized('not authenticated');
    res.json(await service.setExperience(req.player.id, (req.body as { experience_level?: unknown })?.experience_level));
  }));

  router.post('/onboarding/complete', resolve, asyncHandler(async (req, res) => {
    if (!req.player) throw unauthorized('not authenticated');
    res.json(await service.complete(req.player.id));
  }));

  router.get('/onboarding/status', resolve, asyncHandler(async (req, res) => {
    res.json(await service.getStatus(req.player?.id ?? null));
  }));

  return router;
}
