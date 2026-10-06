// src/modules/players/players.routes.ts — HTTP layer for the players feature.
// All routes require auth (injected). Thin: parse, call service, respond.

import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { unauthorized } from '../../http/errors';
import { parseProfileUpdate } from './players.validation';
import type { PlayersService } from './players.service';

function playerId(req: { player?: { id: number } }): number {
  if (!req.player) throw unauthorized();
  return req.player.id;
}

export function createPlayersRouter(service: PlayersService, requireAuth: RequestHandler): Router {
  const router = Router();

  router.get(
    '/players/me',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.getMe(playerId(req)));
    })
  );

  router.get(
    '/players/badges',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.getBadges(playerId(req)));
    })
  );

  router.get(
    '/players/progress',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.getProgress(playerId(req)));
    })
  );

  router.get(
    '/players/xp-history',
    requireAuth,
    asyncHandler(async (req, res) => {
      const limit = Math.min(parseInt(String(req.query.limit ?? '30'), 10) || 30, 100);
      res.json(await service.getXpHistory(playerId(req), limit));
    })
  );

  router.put(
    '/players/me',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.updateProfile(playerId(req), parseProfileUpdate(req.body)));
    })
  );

  // ── profile photo ──────────────────────────────────────────────────────

  router.post(
    '/players/me/photo',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.savePhoto(playerId(req), (req.body as { image?: unknown })?.image));
    })
  );

  router.delete(
    '/players/me/photo',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.deletePhoto(playerId(req)));
    })
  );

  // PUBLIC on purpose: a photo appears next to its player on the leaderboards,
  // which read signed out. It serves only the stored bytes under the stored
  // type, both of which were checked on the way in (src/modules/players/photo.ts).
  //
  // Immutable, because the URL carries the save time -- a changed photo is a
  // changed URL, so nothing has to be revalidated and a replacement is never
  // hidden behind the old one. 404 rather than a placeholder: the caller knows
  // whether it asked for a photo that should exist, and a default avatar is the
  // page's decision, not this endpoint's.
  router.get(
    '/players/:id/photo',
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const photo = Number.isInteger(id) && id > 0 ? await service.getPhoto(id) : null;
      if (!photo) {
        res.status(404).json({ error: 'No photo' });
        return;
      }
      res.setHeader('Content-Type', photo.mime);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      // Stops a stored file being sniffed as anything other than what it says.
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(photo.bytes);
    })
  );

  router.post(
    '/players/reset-progress',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.resetProgress(playerId(req)));
    })
  );

  return router;
}
