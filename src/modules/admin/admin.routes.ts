// src/modules/admin/admin.routes.ts — admin dashboard + ops. All routes except
// login require the admin JWT (x-admin-token). Course/layout/rounds admin and
// per-user detailed stats are intentionally out of the focused port.

import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { badRequest } from '../../http/errors';
import { requireAdmin } from '../../middleware/admin-auth';
import type { AdminService } from './admin.service';

function intParam(value: string, label = 'id'): number {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n <= 0) throw badRequest(`Invalid ${label}`);
  return n;
}

export function createAdminRouter(service: AdminService): Router {
  const router = Router();

  router.post('/admin/login', asyncHandler(async (req, res) => {
    res.json(service.login((req.body as { password?: unknown })?.password));
  }));

  router.get('/admin/stats', requireAdmin, asyncHandler(async (_req, res) => {
    res.json(await service.stats());
  }));

  router.get('/admin/users', requireAdmin, asyncHandler(async (req, res) => {
    res.json(await service.listUsers(req.query as Record<string, unknown>));
  }));

  router.delete('/admin/users/:id', requireAdmin, asyncHandler(async (req, res) => {
    const confirm = req.query.confirm_username ?? (req.body as { confirm_username?: unknown })?.confirm_username;
    res.json(await service.deleteUser(intParam(req.params.id, 'user ID'), confirm));
  }));

  router.post('/admin/users/:id/grant', requireAdmin, asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as { type?: unknown; amount?: unknown };
    res.json(await service.grant(intParam(req.params.id, 'user ID'), body.type, body.amount));
  }));

  router.post('/admin/users/:id/reset-stat', requireAdmin, asyncHandler(async (req, res) => {
    res.json(await service.resetStat(intParam(req.params.id, 'user ID'), (req.body as { field?: unknown })?.field));
  }));

  router.post('/admin/users/:id/badges', requireAdmin, asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as { category?: unknown; tier?: unknown };
    res.status(201).json(await service.addBadge(intParam(req.params.id, 'user ID'), body.category, body.tier));
  }));

  router.delete('/admin/users/:id/badges/:badgeId', requireAdmin, asyncHandler(async (req, res) => {
    res.json(await service.removeBadge(intParam(req.params.id, 'user ID'), intParam(req.params.badgeId, 'badge ID')));
  }));

  // ── notifications CRUD ──
  router.get('/admin/notifications', requireAdmin, asyncHandler(async (_req, res) => {
    res.json(await service.listNotifications());
  }));
  router.post('/admin/notifications', requireAdmin, asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as { title?: unknown; message?: unknown; is_active?: unknown };
    res.json(await service.createNotification(body.title, body.message, body.is_active));
  }));
  router.patch('/admin/notifications/:id', requireAdmin, asyncHandler(async (req, res) => {
    res.json(await service.updateNotification(intParam(req.params.id), (req.body ?? {}) as Record<string, unknown>));
  }));
  router.delete('/admin/notifications/:id', requireAdmin, asyncHandler(async (req, res) => {
    res.json(await service.deleteNotification(intParam(req.params.id)));
  }));

  // ── emails ──
  router.get('/admin/emails', requireAdmin, asyncHandler(async (_req, res) => {
    res.json(await service.listEmails());
  }));
  router.get('/admin/emails/users-search', requireAdmin, asyncHandler(async (req, res) => {
    res.json(await service.searchUsers(String(req.query.q ?? '')));
  }));
  router.post('/admin/emails/send', requireAdmin, asyncHandler(async (req, res) => {
    res.json(await service.sendBlast((req.body ?? {}) as Record<string, unknown>));
  }));

  // ── onboarding funnel analytics ──
  router.get('/admin/onboarding/analytics', requireAdmin, asyncHandler(async (_req, res) => {
    res.json(await service.onboardingAnalytics());
  }));

  return router;
}
