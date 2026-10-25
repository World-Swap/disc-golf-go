// src/modules/market/market.routes.ts — HTTP layer for the Market.
//
// All public. The Market is shops' own public storefront data and a reason to
// open the app before you have an account; putting it behind a login would
// make the emptiest version of the app the first one a visitor sees, which is
// the retention problem this pivot exists to fix.

import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { badRequest } from '../../http/errors';
import type { MarketService } from './market.service';
import { DEPARTMENTS, DEPARTMENT_BY_KEY, featuredDepartment } from './market.catalog';

export function createMarketRouter(service: MarketService): Router {
  const router = Router();

  /** The departments and the shops: everything the page needs to render cold. */
  router.get(
    '/market',
    asyncHandler(async (_req, res) => {
      const featured = featuredDepartment();
      res.json({
        departments: DEPARTMENTS,
        shops: await service.shops(),
        featured: { key: featured.key, label: featured.label, query: featured.query, why: featured.why },
      });
    })
  );

  router.get(
    '/market/search',
    asyncHandler(async (req, res) => {
      const q = String(req.query.q ?? '').trim();
      if (!q) throw badRequest('Search for a disc, a bag, a basket — anything you would buy');
      const retailer = req.query.retailer ? String(req.query.retailer) : undefined;
      res.json(await service.search(q, { retailer }));
    })
  );

  /**
   * A department is a preset query, so it is served through the same search
   * rather than a second path that could drift from it. An unknown key is a
   * 404 and not a silent fallback: a department that quietly becomes a
   * different department is worse than a page that says it is not there.
   */
  router.get(
    '/market/department/:key',
    asyncHandler(async (req, res) => {
      const dept = DEPARTMENT_BY_KEY.get(String(req.params.key));
      if (!dept) throw badRequest('No such department');
      const result = await service.search(dept.query, {
        retailer: req.query.retailer ? String(req.query.retailer) : undefined,
      });
      res.json({ ...result, department: dept });
    })
  );

  return router;
}
