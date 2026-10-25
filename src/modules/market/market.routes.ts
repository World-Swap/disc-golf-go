// src/modules/market/market.routes.ts — HTTP layer for the Market.
//
// All public. The Market is a search over shops' own public data and a reason
// to open the app before signing up rather than after; putting it behind a
// login would make the emptiest version of the app the first one a visitor
// sees, which is the retention problem this exists to help with.

import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { badRequest } from '../../http/errors';
import type { MarketService } from './market.service';
import { DEPARTMENTS, DEPARTMENT_BY_KEY, featuredDepartment } from './market.catalog';

export function createMarketRouter(service: MarketService): Router {
  const router = Router();

  /**
   * What the page needs to render cold and to describe itself honestly --
   * including whether a web-search key is configured, because the reach of a
   * search depends on it and the page must not imply more than it has.
   */
  router.get(
    '/market',
    asyncHandler(async (_req, res) => {
      const featured = featuredDepartment();
      res.json({
        departments: DEPARTMENTS,
        featured: { key: featured.key, label: featured.label, query: featured.query, why: featured.why },
        ...service.status(),
      });
    })
  );

  router.get(
    '/market/search',
    asyncHandler(async (req, res) => {
      const q = String(req.query.q ?? '').trim();
      if (!q) throw badRequest('Search for a disc, a bag, a basket — anything you would buy');
      const asked = parseInt(String(req.query.limit ?? ''), 10);
      const limit = Number.isFinite(asked) ? Math.min(120, Math.max(10, asked)) : undefined;
      res.json(await service.search(q, limit));
    })
  );

  /**
   * A department is a preset query, served through the same search rather
   * than a second path that could drift from it. An unknown key is refused
   * rather than silently becoming a different department.
   */
  router.get(
    '/market/department/:key',
    asyncHandler(async (req, res) => {
      const dept = DEPARTMENT_BY_KEY.get(String(req.params.key));
      if (!dept) throw badRequest('No such department');
      const result = await service.search(dept.query);
      res.json({ ...result, department: dept });
    })
  );

  return router;
}
