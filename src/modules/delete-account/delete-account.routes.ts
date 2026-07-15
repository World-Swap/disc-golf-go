// src/modules/delete-account/delete-account.routes.ts

import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { unauthorized } from '../../http/errors';
import type { DeleteAccountService } from './delete-account.service';

export function createDeleteAccountRouter(service: DeleteAccountService, requireAuth: RequestHandler): Router {
  const router = Router();

  router.delete('/delete-account', requireAuth, asyncHandler(async (req, res) => {
    if (!req.player) throw unauthorized();
    res.json(await service.deleteAccount(req.player.id));
  }));

  router.post('/delete-account/request', asyncHandler(async (req, res) => {
    res.json(await service.requestDeletion((req.body as { email?: unknown })?.email));
  }));

  return router;
}
