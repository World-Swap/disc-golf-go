// src/modules/auth/auth.routes.ts — HTTP layer for auth. Thin: validate input,
// call the service, send the result. All errors propagate to the central
// handler via asyncHandler.

import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import type { AuthService } from './auth.service';
import { parseSignup, parseLogin, parseEmail, parseReset } from './auth.validation';

export function createAuthRouter(service: AuthService): Router {
  const router = Router();

  router.post(
    '/auth/signup',
    asyncHandler(async (req, res) => {
      const result = await service.signup(parseSignup(req.body));
      res.status(201).json(result);
    })
  );

  router.post(
    '/auth/login',
    asyncHandler(async (req, res) => {
      const result = await service.login(parseLogin(req.body));
      res.json(result);
    })
  );

  router.post(
    '/auth/guest',
    asyncHandler(async (_req, res) => {
      const result = await service.createGuest();
      res.status(201).json(result);
    })
  );

  router.post(
    '/auth/forgot-password',
    asyncHandler(async (req, res) => {
      await service.requestPasswordReset(parseEmail(req.body));
      res.json({ success: true });
    })
  );

  router.post(
    '/auth/reset-password',
    asyncHandler(async (req, res) => {
      await service.resetPassword(parseReset(req.body));
      res.json({ success: true });
    })
  );

  // Check endpoints have a uniform contract: always 200 with { valid: boolean }.
  router.get(
    '/auth/verify-reset-token',
    asyncHandler(async (req, res) => {
      const token = req.query.token;
      if (typeof token !== 'string' || !token) {
        res.json({ valid: false, error: 'missing' });
        return;
      }
      res.json(await service.verifyResetToken(token));
    })
  );

  router.get(
    '/auth/guest-status',
    asyncHandler(async (req, res) => {
      const guestUuid = req.headers['x-guest-uuid'];
      if (typeof guestUuid !== 'string' || !guestUuid) {
        res.json({ valid: false });
        return;
      }
      res.json(await service.guestStatus(guestUuid));
    })
  );

  return router;
}
