// src/modules/courses/courses.routes.ts — HTTP layer for courses. Read-only.
// Literal /courses/* routes are registered before /courses/:id so the wildcard
// doesn't swallow them.

import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { badRequest } from '../../http/errors';
import type { CoursesService } from './courses.service';

export function createCoursesRouter(service: CoursesService, optionalAuth: RequestHandler): Router {
  const router = Router();

  router.get(
    '/courses',
    asyncHandler(async (req, res) => {
      const search = typeof req.query.search === 'string' && req.query.search ? req.query.search : null;
      const limit = parseInt(String(req.query.limit ?? ''), 10);
      // ?state=TX matches the state exactly, which a substring search can't:
      // searching "IN" would otherwise match every course with "in" in its name.
      const state = typeof req.query.state === 'string' && req.query.state ? req.query.state : null;
      if (state) {
        res.json(await service.inState(state, Number.isNaN(limit) ? 500 : limit));
        return;
      }
      res.json(await service.search(search, Number.isNaN(limit) ? 5000 : limit));
    })
  );

  router.get(
    '/courses/count',
    asyncHandler(async (_req, res) => {
      res.set('Cache-Control', 'public, max-age=300');
      res.json({ total: await service.count() });
    })
  );

  router.get(
    '/courses/states',
    asyncHandler(async (_req, res) => {
      res.set('Cache-Control', 'public, max-age=300');
      res.json(await service.states());
    })
  );

  /**
   * Live nearby: the map servers first, our table underneath. Separate from
   * /courses/nearby rather than replacing it, because check-in still gates on
   * our own rows (a course we have no id for cannot be checked in to) and
   * quietly changing what that endpoint returns would break it.
   */
  router.get(
    '/courses/live',
    asyncHandler(async (req, res) => {
      const lat = parseFloat(String(req.query.lat));
      const lng = parseFloat(String(req.query.lng));
      if (Number.isNaN(lat) || Number.isNaN(lng)) throw badRequest('lat and lng query params required');
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) throw badRequest('lat or lng out of range');
      const asked = parseInt(String(req.query.radius ?? '40000'), 10);
      // Clamped rather than trusted: the radius sizes a bounding box sent to
      // a shared public map server, and an unbounded one is a query that
      // asks it for a continent.
      const radius = Math.min(80_000, Math.max(1_000, Number.isFinite(asked) ? asked : 40_000));
      res.json(await service.nearbyLive(lat, lng, radius));
    })
  );

  router.get(
    '/courses/nearby',
    asyncHandler(async (req, res) => {
      const lat = parseFloat(String(req.query.lat));
      const lng = parseFloat(String(req.query.lng));
      if (Number.isNaN(lat) || Number.isNaN(lng)) throw badRequest('lat and lng query params required');
      const radius = parseFloat(String(req.query.radius));
      res.json(
        await service.nearby({
          lat,
          lng,
          checkinOnly: req.query.checkin_only === 'true',
          radius: Number.isNaN(radius) ? undefined : radius,
        })
      );
    })
  );

  router.get(
    '/courses/map-pins',
    optionalAuth,
    asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.json(await service.mapPins(req.player?.id ?? null));
    })
  );

  router.get(
    '/courses/:id',
    asyncHandler(async (req, res) => {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) throw badRequest('Invalid course ID');
      res.json(await service.detail(id));
    })
  );

  return router;
}
