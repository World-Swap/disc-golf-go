// src/modules/vault/vault.routes.ts — HTTP layer for the vault.

import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { unauthorized, badRequest } from '../../http/errors';
import type { VaultService } from './vault.service';

function playerId(req: { player?: { id: number } }): number {
  if (!req.player) throw unauthorized();
  return req.player.id;
}

export function createVaultRouter(service: VaultService, requireAuth: RequestHandler, optionalAuth: RequestHandler): Router {
  const router = Router();

  router.get(
    '/vault/library',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.library(playerId(req)));
    })
  );

  router.get(
    '/vault/bonus',
    optionalAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.bonus(req.player?.id ?? null));
    })
  );

  router.get(
    '/vault/gold',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.gold(playerId(req)));
    })
  );

  router.post(
    '/vault/training/unlock',
    requireAuth,
    asyncHandler(async (req, res) => {
      const itemId = Number((req.body as { item_id?: unknown })?.item_id);
      if (!itemId) throw badRequest('item_id required');
      res.json(await service.unlockTraining(playerId(req), itemId));
    })
  );

  return router;
}
