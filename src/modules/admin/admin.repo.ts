// src/modules/admin/admin.repo.ts — admin ops data access.

import type { Queryable, Database } from '../../db/types';

const USER_SORT_FIELDS = ['display_name', 'username', 'email', 'xp', 'level', 'created_at', 'last_active'];

async function count(db: Queryable, sql: string, params: unknown[] = []): Promise<number> {
  const r = await db.query<Record<string, string>>(sql, params);
  return parseInt(Object.values(r.rows[0] ?? {})[0] ?? '0', 10);
}

export function createAdminRepo(db: Database) {
  return {
    async dashboardStats() {
      const [total, new7, new30, active7, active30, checkins, rounds, challenges, avgXp, pageviews, unique30, today] = await Promise.all([
        count(db, 'SELECT COUNT(*) FROM players'),
        count(db, "SELECT COUNT(*) FROM players WHERE created_at >= NOW() - INTERVAL '7 days'"),
        count(db, "SELECT COUNT(*) FROM players WHERE created_at >= NOW() - INTERVAL '30 days'"),
        count(db, `SELECT COUNT(DISTINCT player_id) FROM (SELECT player_id FROM checkins WHERE checked_in_at >= NOW() - INTERVAL '7 days' UNION SELECT player_id FROM rounds WHERE completed_at >= NOW() - INTERVAL '7 days' AND status = 'completed') t`),
        count(db, `SELECT COUNT(DISTINCT player_id) FROM (SELECT player_id FROM checkins WHERE checked_in_at >= NOW() - INTERVAL '30 days' UNION SELECT player_id FROM rounds WHERE completed_at >= NOW() - INTERVAL '30 days' AND status = 'completed') t`),
        count(db, 'SELECT COUNT(*) FROM checkins'),
        count(db, "SELECT COUNT(*) FROM rounds WHERE status = 'completed'"),
        count(db, `SELECT (COALESCE((SELECT COUNT(*) FROM player_challenges WHERE completed = true),0) + COALESCE((SELECT COUNT(*) FROM player_challenge_slots WHERE completed = true),0))::int`),
        count(db, 'SELECT COALESCE(ROUND(AVG(xp)),0) FROM players'),
        count(db, 'SELECT COUNT(*) FROM pageviews'),
        count(db, "SELECT COUNT(DISTINCT session_hash) FROM pageviews WHERE created_at >= NOW() - INTERVAL '30 days'"),
        count(db, "SELECT COUNT(*) FROM pageviews WHERE created_at >= NOW() - INTERVAL '1 day'"),
      ]);
      return {
        players: { total, new_7d: new7, new_30d: new30, active_7d: active7, active_30d: active30, avg_xp: avgXp },
        activity: { total_checkins: checkins, total_rounds: rounds, challenges_completed: challenges },
        traffic: { total_pageviews: pageviews, unique_visitors_30d: unique30, today_pageviews: today },
      };
    },

    async listUsers(opts: { page: number; limit: number; search: string; sort: string; dir: 'ASC' | 'DESC' }) {
      const sortField = USER_SORT_FIELDS.includes(opts.sort) ? opts.sort : 'created_at';
      const orderBy = sortField === 'last_active' ? `last_active ${opts.dir} NULLS LAST` : `p.${sortField} ${opts.dir}`;
      const where = opts.search ? `WHERE LOWER(p.display_name) LIKE $1 OR LOWER(p.username) LIKE $1 OR LOWER(p.email) LIKE $1` : '';
      const like = '%' + opts.search.toLowerCase() + '%';
      const offset = (opts.page - 1) * opts.limit;

      const total = await count(db, `SELECT COUNT(*) FROM players p ${where}`, opts.search ? [like] : []);
      const params = opts.search ? [like, opts.limit, offset] : [opts.limit, opts.limit ? offset : 0];
      const limitP = opts.search ? '$2' : '$1';
      const offsetP = opts.search ? '$3' : '$2';
      const r = await db.query(
        `SELECT p.id, p.display_name, p.username, p.email, p.xp, p.level, p.created_at, p.last_login_date,
                GREATEST(MAX(ci.checked_in_at), MAX(r.completed_at), p.created_at) as last_active
         FROM players p
         LEFT JOIN checkins ci ON ci.player_id = p.id
         LEFT JOIN rounds r ON r.player_id = p.id AND r.status = 'completed'
         ${where}
         GROUP BY p.id, p.display_name, p.username, p.email, p.xp, p.level, p.created_at, p.last_login_date
         ORDER BY ${orderBy} LIMIT ${limitP} OFFSET ${offsetP}`,
        params
      );
      return { users: r.rows, total };
    },

    async playerBasic(id: number) {
      const r = await db.query<{ id: number; display_name: string; username: string | null }>('SELECT id, display_name, username FROM players WHERE id = $1', [id]);
      return r.rows[0] ?? null;
    },

    async deleteUser(id: number) {
      const r = await db.query<{ id: number; display_name: string }>('DELETE FROM players WHERE id = $1 RETURNING id, display_name', [id]);
      return r.rows[0] ?? null;
    },

    async getField(id: number, field: string): Promise<number | null> {
      const r = await db.query<Record<string, number>>(`SELECT ${field} FROM players WHERE id = $1`, [id]);
      return r.rows[0] ? Number(r.rows[0][field]) : null;
    },

    async setField(id: number, field: string, value: number) {
      await db.query(`UPDATE players SET ${field} = $1 WHERE id = $2`, [value, id]);
    },

    async audit(playerId: number, action: string, field: string | null, oldValue: string | null, newValue: string | null, metadata: object | null = null) {
      await db.query('INSERT INTO admin_audit_log (player_id, action, field_name, old_value, new_value, metadata) VALUES ($1, $2, $3, $4, $5, $6)', [
        playerId, action, field, oldValue, newValue, metadata ? JSON.stringify(metadata) : null,
      ]);
    },

    async addBadge(playerId: number, category: string, tier: string) {
      const r = await db.query('INSERT INTO player_badges (player_id, category, tier) VALUES ($1, $2, $3) ON CONFLICT (player_id, category, tier) DO NOTHING RETURNING id, category, tier, earned_at', [playerId, category, tier]);
      return r.rows[0] ?? null;
    },

    async removeBadge(playerId: number, badgeId: number) {
      const r = await db.query<{ id: number; category: string; tier: string }>('DELETE FROM player_badges WHERE id = $1 AND player_id = $2 RETURNING id, category, tier', [badgeId, playerId]);
      return r.rows[0] ?? null;
    },

    // ── notifications CRUD ──
    async listNotifications() {
      const r = await db.query('SELECT id, title, message, is_active, created_at FROM notifications ORDER BY created_at DESC');
      return r.rows;
    },
    async createNotification(title: string, message: string, isActive: boolean) {
      const r = await db.query('INSERT INTO notifications (title, message, is_active) VALUES ($1, $2, $3) RETURNING *', [title, message, isActive]);
      return r.rows[0];
    },
    async updateNotification(id: number, sets: string[], params: unknown[]) {
      const r = await db.query(`UPDATE notifications SET ${sets.join(', ')} WHERE id = $${params.length + 1} RETURNING *`, [...params, id]);
      return r.rows[0] ?? null;
    },
    async deleteNotification(id: number) {
      await db.query('DELETE FROM notifications WHERE id = $1', [id]);
    },

    // ── emails ──
    async listEmails() {
      const r = await db.query('SELECT id, subject, recipient_type, recipients, recipient_count, status, notes, sent_at FROM admin_emails ORDER BY sent_at DESC LIMIT 100');
      return r.rows;
    },
    async searchUsers(q: string) {
      const r = await db.query('SELECT id, display_name, username, email FROM players WHERE LOWER(display_name) LIKE $1 OR LOWER(username) LIKE $1 OR LOWER(email) LIKE $1 ORDER BY display_name ASC LIMIT 20', ['%' + q.toLowerCase() + '%']);
      return r.rows;
    },
    async recipientsAll() {
      const r = await db.query<{ id: number; display_name: string; email: string }>("SELECT id, display_name, email FROM players WHERE email IS NOT NULL AND email != '' ORDER BY created_at ASC");
      return r.rows;
    },
    async recipientsByIds(ids: number[]) {
      const r = await db.query<{ id: number; display_name: string; email: string }>('SELECT id, display_name, email FROM players WHERE id = ANY($1) AND email IS NOT NULL', [ids]);
      return r.rows;
    },
    async logEmail(subject: string, body: string, recipientType: string, recipients: unknown, count: number, status: string, notes: string | null) {
      const r = await db.query<{ id: number; sent_at: Date }>(
        'INSERT INTO admin_emails (subject, body, recipient_type, recipients, recipient_count, status, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, sent_at',
        [subject, body, recipientType, recipients ? JSON.stringify(recipients) : null, count, status, notes]
      );
      return r.rows[0]!;
    },

    // ── onboarding analytics ──
    async onboardingAnalytics() {
      const [cohort, events, funnel] = await Promise.all([
        db.query(`SELECT p.experience_level,
            COUNT(DISTINCT p.id) FILTER (WHERE p.is_guest = false) AS registered_users,
            COUNT(DISTINCT p.id) FILTER (WHERE p.is_guest = true) AS guest_users,
            COUNT(DISTINCT p.id) FILTER (WHERE p.onboarding_completed = true) AS completed,
            COUNT(DISTINCT p.id) FILTER (WHERE p.onboarding_skipped = true) AS skipped
          FROM players p GROUP BY p.experience_level`),
        db.query(`SELECT event_type, experience_level, COUNT(*) AS count FROM onboarding_events WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY event_type, experience_level ORDER BY event_type, experience_level`),
        db.query(`SELECT experience_level,
            COUNT(*) FILTER (WHERE event_type = 'tutorial_started') AS started,
            COUNT(*) FILTER (WHERE event_type = 'tutorial_completed') AS completed,
            COUNT(*) FILTER (WHERE event_type = 'tutorial_skipped') AS skipped
          FROM onboarding_events WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY experience_level`),
      ]);
      return { cohort_stats: cohort.rows, event_counts: events.rows, funnel_rates: funnel.rows, period: 'last_30_days' };
    },
  };
}

export type AdminRepo = ReturnType<typeof createAdminRepo>;
