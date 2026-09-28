// src/modules/videos/videos.routes.ts — HTTP layer for the channel feed.
//
// Everything here is public: the feed is the creators' own public uploads, so
// gating it behind a login would only make the app look emptier than it is.

import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { badRequest } from '../../http/errors';
import type { VideosService } from './videos.service';

/** A YouTube channel id: "UC" then 22 characters of the URL-safe alphabet. */
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

export function createVideosRouter(service: VideosService): Router {
  const router = Router();

  router.get(
    '/videos/newest',
    asyncHandler(async (req, res) => {
      res.json(await service.newest(parseInt(String(req.query.limit ?? '10'), 10) || 10));
    })
  );

  router.get(
    '/videos/teaching',
    asyncHandler(async (req, res) => {
      res.json(await service.teaching(parseInt(String(req.query.limit ?? '12'), 10) || 12));
    })
  );

  router.get(
    '/videos/creators',
    asyncHandler(async (_req, res) => {
      res.json(await service.creators());
    })
  );

  router.get(
    '/videos/creators/:channelId',
    asyncHandler(async (req, res) => {
      // Validated rather than passed through: it is a path segment that ends
      // up in a query, and an id that is not one can only be a bad link.
      const id = String(req.params.channelId);
      if (!CHANNEL_ID.test(id)) throw badRequest('Not a channel id');
      res.json(await service.byCreator(id, parseInt(String(req.query.limit ?? '50'), 10) || 50));
    })
  );

  return router;
}
