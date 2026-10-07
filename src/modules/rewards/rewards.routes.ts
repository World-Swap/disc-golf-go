// src/modules/rewards/rewards.routes.ts — HTTP layer for level rewards and
// coupons. Thin: parse input, call the service, send the result.

import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { unauthorized } from '../../http/errors';
import type { RewardsService } from './rewards.service';

export function createRewardsRouter(
  service: RewardsService,
  requireAuth: RequestHandler,
  requireAdmin: RequestHandler
): Router {
  const router = Router();
  const player = (req: { player?: { id: number } }) => {
    if (!req.player) throw unauthorized();
    return req.player.id;
  };

  // No auth: the catalogue is what is on offer, and the page should be able to
  // show it before anyone signs in.
  router.get('/rewards/catalogue', asyncHandler(async (_req, res) => {
    res.json(service.catalogue());
  }));

  router.get('/rewards/mine', requireAuth, asyncHandler(async (req, res) => {
    res.json(await service.mine(player(req)));
  }));

  router.post('/rewards/redeem', requireAuth, asyncHandler(async (req, res) => {
    res.json(await service.redeem(player(req), String(req.body?.type_key ?? '')));
  }));

  // Staff only, and deliberately so: a public lookup lets anyone probe codes,
  // and a public redeem lets anyone burn a coupon they do not hold.
  router.get('/rewards/admin/lookup/:code', requireAdmin, asyncHandler(async (req, res) => {
    res.json(await service.lookup(req.params.code ?? ''));
  }));

  router.post('/rewards/admin/redeem', requireAdmin, asyncHandler(async (req, res) => {
    res.json(await service.markRedeemed(String(req.body?.code ?? ''), String(req.body?.note ?? '')));
  }));

  return router;
}
