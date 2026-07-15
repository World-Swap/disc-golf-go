// src/modules/shop/shop.routes.ts — gold balance + item shop (legacy paths).

import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { unauthorized } from '../../http/errors';
import type { ShopService } from './shop.service';

function playerId(req: { player?: { id: number } }): number {
  if (!req.player) throw unauthorized();
  return req.player.id;
}

export function createShopRouter(service: ShopService, requireAuth: RequestHandler): Router {
  const router = Router();

  router.get('/gold/balance', requireAuth, asyncHandler(async (req, res) => {
    res.json(await service.balance(playerId(req)));
  }));

  router.get('/vault/items', requireAuth, asyncHandler(async (req, res) => {
    res.json(await service.items(playerId(req)));
  }));

  router.get('/vault/inventory', requireAuth, asyncHandler(async (req, res) => {
    res.json(await service.inventory(playerId(req)));
  }));

  router.post('/vault/buy', requireAuth, asyncHandler(async (req, res) => {
    const itemId = Number((req.body as { item_id?: unknown })?.item_id);
    res.json(await service.buy(playerId(req), itemId));
  }));

  router.post('/vault/activate', requireAuth, asyncHandler(async (req, res) => {
    const invId = parseInt(String((req.body as { inventory_id?: unknown })?.inventory_id), 10);
    res.json(await service.activate(playerId(req), invId));
  }));

  router.post('/vault/activate/:invId', requireAuth, asyncHandler(async (req, res) => {
    res.json(await service.activate(playerId(req), parseInt(req.params.invId, 10)));
  }));

  return router;
}
