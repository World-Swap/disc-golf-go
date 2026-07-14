// src/modules/training-notifications/training-notifications.repo.ts — settings
// + in-app training notifications (bell).

import type { Queryable } from '../../db/types';

export interface NotificationSettings {
  tips_enabled: boolean;
  tips_frequency: string;
  reminders_enabled: boolean;
  mission_alerts_enabled: boolean;
  achievement_alerts_enabled: boolean;
  push_enabled: boolean;
}

export interface SettingsUpdate {
  tips_enabled: boolean | null;
  tips_frequency: string | null;
  reminders_enabled: boolean | null;
  mission_alerts_enabled: boolean | null;
  achievement_alerts_enabled: boolean | null;
  push_enabled: boolean | null;
}

export function createTrainingNotificationsRepo(db: Queryable) {
  return {
    async settings(playerId: number): Promise<NotificationSettings | null> {
      const r = await db.query<NotificationSettings>(
        `SELECT tips_enabled, tips_frequency, reminders_enabled, mission_alerts_enabled, achievement_alerts_enabled, push_enabled
         FROM player_training_notification_settings WHERE player_id = $1`,
        [playerId]
      );
      return r.rows[0] ?? null;
    },

    // Partial update: unspecified fields (null) preserve the existing value
    // (fixes the legacy COALESCE($n, EXCLUDED.$n) no-op that nulled them).
    async upsertSettings(playerId: number, u: SettingsUpdate): Promise<NotificationSettings> {
      await db.query(
        `INSERT INTO player_training_notification_settings
           (player_id, tips_enabled, tips_frequency, reminders_enabled, mission_alerts_enabled, achievement_alerts_enabled, push_enabled)
         VALUES ($1, COALESCE($2, TRUE), COALESCE($3, 'daily'), COALESCE($4, TRUE), COALESCE($5, TRUE), COALESCE($6, TRUE), COALESCE($7, FALSE))
         ON CONFLICT (player_id) DO UPDATE SET
           tips_enabled = COALESCE($2, player_training_notification_settings.tips_enabled),
           tips_frequency = COALESCE($3, player_training_notification_settings.tips_frequency),
           reminders_enabled = COALESCE($4, player_training_notification_settings.reminders_enabled),
           mission_alerts_enabled = COALESCE($5, player_training_notification_settings.mission_alerts_enabled),
           achievement_alerts_enabled = COALESCE($6, player_training_notification_settings.achievement_alerts_enabled),
           push_enabled = COALESCE($7, player_training_notification_settings.push_enabled),
           updated_at = NOW()`,
        [playerId, u.tips_enabled, u.tips_frequency, u.reminders_enabled, u.mission_alerts_enabled, u.achievement_alerts_enabled, u.push_enabled]
      );
      const r = await db.query<NotificationSettings>('SELECT * FROM player_training_notification_settings WHERE player_id = $1', [playerId]);
      return r.rows[0]!;
    },

    async list(playerId: number, limit: number, offset: number) {
      const r = await db.query(
        `SELECT tn.id, tn.type, tn.title, tn.message, tn.lesson_id, tn.is_read, tn.created_at,
                l.slug AS lesson_slug, l.title AS lesson_title
         FROM training_notifications tn
         LEFT JOIN training_lessons l ON l.id = tn.lesson_id
         WHERE tn.player_id = $1 ORDER BY tn.created_at DESC LIMIT $2 OFFSET $3`,
        [playerId, limit, offset]
      );
      return r.rows;
    },

    async counts(playerId: number) {
      const r = await db.query<{ total: string; unread: string }>(
        'SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE NOT is_read) AS unread FROM training_notifications WHERE player_id = $1',
        [playerId]
      );
      return { total: parseInt(r.rows[0]!.total, 10), unread: parseInt(r.rows[0]!.unread, 10) };
    },

    async unreadCount(playerId: number): Promise<number> {
      const r = await db.query<{ unread: string }>('SELECT COUNT(*) AS unread FROM training_notifications WHERE player_id = $1 AND is_read = false', [playerId]);
      return parseInt(r.rows[0]!.unread, 10);
    },

    async markRead(playerId: number, id: number) {
      await db.query('UPDATE training_notifications SET is_read = true WHERE id = $1 AND player_id = $2', [id, playerId]);
    },

    async markAllRead(playerId: number) {
      await db.query('UPDATE training_notifications SET is_read = true WHERE player_id = $1 AND is_read = false', [playerId]);
    },

    async lessonForTip(lessonId: number) {
      const r = await db.query<{ description: string | null }>(
        'SELECT l.description FROM training_lessons l JOIN training_categories c ON c.id = l.category_id WHERE l.id = $1 AND l.is_active = true',
        [lessonId]
      );
      return r.rows[0] ?? null;
    },

    async insertTip(playerId: number, message: string | null, lessonId: number) {
      await db.query(
        `INSERT INTO training_notifications (player_id, type, title, message, lesson_id) VALUES ($1, 'daily_tip', $2, $3, $4)`,
        [playerId, 'Daily Training Tip', message, lessonId]
      );
    },
  };
}

export type TrainingNotificationsRepo = ReturnType<typeof createTrainingNotificationsRepo>;
