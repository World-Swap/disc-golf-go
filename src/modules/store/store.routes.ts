// src/modules/store/store.routes.ts — HTTP layer for our own storefront.
//
// All public, for the same reason the Market is: a shop behind a login is a
// shop nobody browses, and nothing here is personal to a player.

import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import type { createStoreService } from './store.service';

export function createStoreRouter(service: ReturnType<typeof createStoreService>): Router {
  const router = Router();

  /**
   * Whether we sell anything at all, plus the collections to filter by.
   *
   * Both in one call because the page needs both before it can draw, and the
   * collections read costs nothing when the store is unconfigured -- it
   * returns an empty list without touching the network.
   */
  router.get(
    '/store',
    asyncHandler(async (_req, res) => {
      const status = service.status();
      res.json({
        ...status,
        collections: status.open ? await service.collections() : [],
      });
    })
  );

  /**
   * One page of our catalogue.
   *
   * An unknown collection browses everything rather than erroring: this is a
   * read, and a stale or mistyped link should still show the shop rather than
   * a failure page.
   */
  router.get(
    '/store/products',
    asyncHandler(async (req, res) => {
      const page = parseInt(String(req.query.page ?? ''), 10);
      res.json(
        await service.products({
          collection: String(req.query.collection ?? '') || undefined,
          page: Number.isFinite(page) ? page : 1,
        })
      );
    })
  );

  return router;
}
