// src/modules/referrals/referrals.routes.ts — referral program endpoints.

import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { unauthorized } from '../../http/errors';
import type { ReferralsService } from './referrals.service';

function playerId(req: { player?: { id: number } }): number {
  if (!req.player) throw unauthorized();
  return req.player.id;
}

export function createReferralsRouter(service: ReferralsService, requireAuth: RequestHandler): Router {
  const router = Router();

  router.get('/referrals/me', requireAuth, asyncHandler(async (req, res) => {
    res.json(await service.getMe(playerId(req)));
  }));

  router.post('/referrals/generate', requireAuth, asyncHandler(async (req, res) => {
    const result = await service.generate(playerId(req));
    const { status, ...body } = result as typeof result & { status?: number };
    res.status(status ?? 200).json(body);
  }));

  // Public — fires the click event and redirects to /register.
  router.get('/referrals/click', asyncHandler(async (req, res) => {
    const target = await service.clickTarget(req.query.code, {
      user_agent: String(req.headers['user-agent'] ?? ''),
      referer: String(req.headers['referer'] ?? ''),
    });
    res.redirect(target);
  }));

  router.get('/referrals/validate/:code', asyncHandler(async (req, res) => {
    res.json(await service.validate(req.params.code));
  }));

  router.post('/referrals/claim', requireAuth, asyncHandler(async (req, res) => {
    res.json(await service.claim(playerId(req), (req.body as { code?: unknown })?.code));
  }));

  router.post('/referrals/share', requireAuth, asyncHandler(async (req, res) => {
    res.json(await service.share(playerId(req), (req.body as { code?: unknown })?.code));
  }));

  router.post('/referrals/award', requireAuth, asyncHandler(async (req, res) => {
    res.json(await service.award(playerId(req)));
  }));

  return router;
}
