// src/modules/admin/admin.service.ts — admin ops (auth, dashboard, user mgmt,
// notifications, email blasts, onboarding analytics).

import { badRequest, notFound, conflict, unauthorized, AppError } from '../../http/errors';
import { createAdminToken, verifyAdminPassword } from '../../middleware/admin-auth';
import { sendEmail as defaultSendEmail, type SendEmail } from '../../lib/email';
import type { Database } from '../../db/types';
import { createAdminRepo, type AdminRepo } from './admin.repo';

const BADGE_TIERS = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
const RESETTABLE_FIELDS = [
  'xp', 'gold', 'battle_wins', 'battle_losses', 'total_rounds', 'login_streak', 'best_streak',
  'total_distance_m', 'total_birdies', 'total_aces', 'total_checkins', 'total_courses_visited', 'challenges_completed',
];

export interface AdminDeps {
  db: Database;
  repo?: AdminRepo;
  send?: SendEmail;
}

export function createAdminService({ db, repo = createAdminRepo(db), send = defaultSendEmail }: AdminDeps) {
  return {
    login(password: unknown) {
      if (!verifyAdminPassword(password)) throw unauthorized('Invalid password');
      return { token: createAdminToken() };
    },

    stats() {
      return repo.dashboardStats();
    },

    async listUsers(query: Record<string, unknown>) {
      const page = Math.max(1, parseInt(String(query.page), 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(String(query.limit), 10) || 25));
      const { users, total } = await repo.listUsers({
        page,
        limit,
        search: String(query.search ?? '').trim(),
        sort: String(query.sort ?? 'created_at'),
        dir: query.dir === 'asc' ? 'ASC' : 'DESC',
      });
      return { users, total, page, limit, pages: Math.ceil(total / limit) };
    },

    async deleteUser(userId: number, confirmUsername: unknown) {
      const player = await repo.playerBasic(userId);
      if (!player) throw notFound('User not found');
      if (typeof confirmUsername === 'string' && confirmUsername.toLowerCase() !== (player.username || '').toLowerCase()) {
        throw badRequest('Username confirmation does not match');
      }
      return { success: true, deleted: await repo.deleteUser(userId) };
    },

    async grant(userId: number, type: unknown, amountRaw: unknown) {
      if (type !== 'xp' && type !== 'gold') throw badRequest('type must be xp or gold');
      const amount = parseInt(String(amountRaw), 10);
      if (Number.isNaN(amount) || amount <= 0) throw badRequest('amount must be a positive integer');

      const oldVal = await repo.getField(userId, type);
      if (oldVal == null) throw notFound('User not found');
      const newVal = oldVal + amount;
      await repo.setField(userId, type, newVal);
      await repo.audit(userId, 'grant', type, String(oldVal), String(newVal), { granted: amount });
      return { success: true, field: type, old_value: oldVal, new_value: newVal };
    },

    async resetStat(userId: number, field: unknown) {
      if (typeof field !== 'string' || !RESETTABLE_FIELDS.includes(field)) {
        throw badRequest('Invalid field. Allowed: ' + RESETTABLE_FIELDS.join(', '));
      }
      const oldVal = await repo.getField(userId, field);
      if (oldVal == null) throw notFound('User not found');
      await repo.setField(userId, field, 0);
      await repo.audit(userId, 'stat_reset', field, String(oldVal), '0');
      return { success: true, field, old_value: oldVal, new_value: 0 };
    },

    async addBadge(userId: number, category: unknown, tier: unknown) {
      if (!category || !tier) throw badRequest('category and tier are required');
      if (typeof tier !== 'string' || !BADGE_TIERS.includes(tier)) throw badRequest('tier must be bronze/silver/gold/platinum/diamond');
      if (!(await repo.playerBasic(userId))) throw notFound('User not found');
      const badge = await repo.addBadge(userId, String(category).trim(), tier);
      if (!badge) throw conflict('User already has this badge');
      await repo.audit(userId, 'badge_grant', 'badge', null, `${category}:${tier}`);
      return { badge };
    },

    async removeBadge(userId: number, badgeId: number) {
      const removed = await repo.removeBadge(userId, badgeId);
      if (!removed) throw notFound('Badge not found');
      await repo.audit(userId, 'badge_remove', 'badge', `${removed.category}:${removed.tier}`, null);
      return { success: true, removed };
    },

    // ── notifications ──
    listNotifications() {
      return repo.listNotifications().then((notifications) => ({ notifications }));
    },
    async createNotification(title: unknown, message: unknown, isActive: unknown) {
      const t = String(title ?? '').trim();
      const m = String(message ?? '').trim();
      if (!t) throw badRequest('title is required');
      if (!m) throw badRequest('message is required');
      return { notification: await repo.createNotification(t, m, isActive === undefined ? true : Boolean(isActive)) };
    },
    async updateNotification(id: number, body: Record<string, unknown>) {
      const sets: string[] = [];
      const params: unknown[] = [];
      if (body.title !== undefined) { params.push(String(body.title).trim()); sets.push(`title = $${params.length}`); }
      if (body.message !== undefined) { params.push(String(body.message).trim()); sets.push(`message = $${params.length}`); }
      if (body.is_active !== undefined) { params.push(Boolean(body.is_active)); sets.push(`is_active = $${params.length}`); }
      if (sets.length === 0) throw badRequest('Nothing to update');
      const notification = await repo.updateNotification(id, sets, params);
      if (!notification) throw notFound('Not found');
      return { notification };
    },
    async deleteNotification(id: number) {
      await repo.deleteNotification(id);
      return { ok: true };
    },

    // ── emails ──
    listEmails() {
      return repo.listEmails().then((emails) => ({ emails }));
    },
    async searchUsers(q: string) {
      if (!q || q.trim().length < 2) return { users: [] };
      return { users: await repo.searchUsers(q.trim()) };
    },
    async sendBlast(body: Record<string, unknown>) {
      const subject = String(body.subject ?? '').trim();
      const text = String(body.body ?? '').trim();
      const recipientType = body.recipient_type;
      if (!subject) throw badRequest('subject is required');
      if (!text) throw badRequest('body is required');
      if (recipientType !== 'all' && recipientType !== 'individual') throw badRequest('recipient_type must be "all" or "individual"');
      if (!process.env.POLSIA_API_KEY) throw new AppError(500, 'Email proxy not configured (missing POLSIA_API_KEY)');

      let recipients: Array<{ id: number; display_name: string; email: string }>;
      if (recipientType === 'all') {
        recipients = await repo.recipientsAll();
      } else {
        const ids = (Array.isArray(body.recipient_ids) ? body.recipient_ids : []).map((x) => parseInt(String(x), 10)).filter(Boolean);
        if (ids.length === 0) throw badRequest('recipient_ids is required for individual sends');
        recipients = await repo.recipientsByIds(ids);
      }
      if (recipients.length === 0) throw badRequest('No recipients found');

      let sent = 0;
      let failed = 0;
      const errors: string[] = [];
      for (const p of recipients) {
        try {
          await send({ to: p.email, subject, text, html: text });
          sent++;
        } catch (err) {
          failed++;
          errors.push(`${p.email}: ${(err as Error).message}`);
        }
      }

      const status = failed === 0 ? 'sent' : sent === 0 ? 'failed' : 'partial';
      const logged = await repo.logEmail(
        subject, text, recipientType,
        recipientType === 'individual' ? recipients.map((p) => ({ id: p.id, email: p.email, display_name: p.display_name })) : null,
        recipients.length, status, errors.length ? errors.slice(0, 5).join('; ') : null
      );
      return { ok: true, sent, failed, total: recipients.length, status, email_id: logged.id, sent_at: logged.sent_at };
    },

    onboardingAnalytics() {
      return repo.onboardingAnalytics();
    },
  };
}

export type AdminService = ReturnType<typeof createAdminService>;
