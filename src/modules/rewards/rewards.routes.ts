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
  // The admin console's Coupons tab: who holds what, which codes are live,
  // which are spent. One call, because the page shows all of it at once and a
  // second endpoint would be a second chance for the two to disagree.
  router.get('/rewards/admin/coupons', requireAdmin, asyncHandler(async (_req, res) => {
    res.json(await service.adminOverview());
  }));

  router.get('/rewards/admin/lookup/:code', requireAdmin, asyncHandler(async (req, res) => {
    res.json(await service.lookup(req.params.code ?? ''));
  }));

  router.post('/rewards/admin/redeem', requireAdmin, asyncHandler(async (req, res) => {
    res.json(await service.markRedeemed(String(req.body?.code ?? ''), String(req.body?.note ?? '')));
  }));

  // Stacking: several codes, one purchase, one transaction. Separate from the
  // single redeem above because the limit and the same-kind rule only make
  // sense for a batch.
  router.post('/rewards/admin/redeem-together', requireAdmin, asyncHandler(async (req, res) => {
    const b = (req.body ?? {}) as { codes?: unknown; note?: unknown };
    res.json(await service.redeemTogether(b.codes, String(b.note ?? '')));
  }));

  return router;
}
