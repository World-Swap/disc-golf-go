// src/modules/scorecards/scorecards.routes.ts — HTTP layer for scorecards.
// Thin: parse input, call the service, send the result.

import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { badRequest, unauthorized } from '../../http/errors';
import type { ScorecardsService } from './scorecards.service';

function id(raw: string, what: string): number {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) throw badRequest('Invalid ' + what);
  return n;
}

export function createScorecardsRouter(service: ScorecardsService, requireAuth: RequestHandler): Router {
  const router = Router();
  const player = (req: { player?: { id: number } }) => {
    if (!req.player) throw unauthorized();
    return req.player.id;
  };

  router.get(
    '/scorecards',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.list(player(req), parseInt(String(req.query.limit ?? '20'), 10)));
    })
  );

  router.post(
    '/scorecards',
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      // course_id is OPTIONAL now: the card is a blank card. See the comment
      // on service.start -- a round at a course we have no row for is the
      // normal case after the pivot, not an error.
      res.status(201).json(
        await service.start(player(req), {
          courseId: body.course_id ?? null,
          courseName: typeof body.course_name === 'string' ? body.course_name : null,
          holes: Number(body.holes),
          pars: body.pars ?? null,
        })
      );
    })
  );

  // Best completed round at a course — registered before /:id so the
  // wildcard doesn't swallow it.
  router.get(
    '/scorecards/best/:courseId',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.bestAt(player(req), id(req.params.courseId, 'course ID')));
    })
  );

  router.get(
    '/scorecards/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.get(player(req), id(req.params.id, 'scorecard ID')));
    })
  );

  router.post(
    '/scorecards/:id/holes',
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      res.json(
        await service.scoreHole(
          player(req),
          id(req.params.id, 'scorecard ID'),
          Number(body.hole_number),
          body.strokes === null || body.strokes === undefined ? null : Number(body.strokes)
        )
      );
    })
  );

  // Par per hole, editable while the round is going: every hole starts at 3
  // and the player bumps the 4s and 5s as they meet them.
  router.post(
    '/scorecards/:id/par',
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      res.json(
        await service.setPar(
          player(req),
          id(req.params.id, 'scorecard ID'),
          Number(body.hole_number),
          Number(body.par)
        )
      );
    })
  );

  router.post(
    '/scorecards/:id/finish',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.finish(player(req), id(req.params.id, 'scorecard ID')));
    })
  );

  router.delete(
    '/scorecards/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await service.remove(player(req), id(req.params.id, 'scorecard ID')));
    })
  );

  return router;
}
