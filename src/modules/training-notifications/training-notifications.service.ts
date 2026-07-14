// src/modules/training-notifications/training-notifications.service.ts

import { badRequest, notFound } from '../../http/errors';
import type { Database } from '../../db/types';
import { createTrainingNotificationsRepo, type TrainingNotificationsRepo, type NotificationSettings, type SettingsUpdate } from './training-notifications.repo';

const DEFAULT_SETTINGS: NotificationSettings = {
  tips_enabled: true,
  tips_frequency: 'daily',
  reminders_enabled: true,
  mission_alerts_enabled: true,
  achievement_alerts_enabled: true,
  push_enabled: false,
};

const VALID_FREQ = ['daily', 'every_2_days', 'weekly'];

const boolOrNull = (v: unknown): boolean | null => (v === undefined ? null : Boolean(v));

export function createTrainingNotificationsService(db: Database, repo: TrainingNotificationsRepo = createTrainingNotificationsRepo(db)) {
  return {
    async getSettings(playerId: number) {
      return (await repo.settings(playerId)) ?? DEFAULT_SETTINGS;
    },

    async updateSettings(playerId: number, body: Record<string, unknown>) {
      if (body.tips_frequency && !VALID_FREQ.includes(String(body.tips_frequency))) {
        throw badRequest('Invalid tips_frequency');
      }
      const update: SettingsUpdate = {
        tips_enabled: boolOrNull(body.tips_enabled),
        tips_frequency: body.tips_frequency ? String(body.tips_frequency) : null,
        reminders_enabled: boolOrNull(body.reminders_enabled),
        mission_alerts_enabled: boolOrNull(body.mission_alerts_enabled),
        achievement_alerts_enabled: boolOrNull(body.achievement_alerts_enabled),
        push_enabled: boolOrNull(body.push_enabled),
      };
      return repo.upsertSettings(playerId, update);
    },

    async list(playerId: number, limit: number, offset: number) {
      const [notifications, counts] = await Promise.all([repo.list(playerId, limit, offset), repo.counts(playerId)]);
      return { notifications, total: counts.total, unread_count: counts.unread };
    },

    unreadCount(playerId: number) {
      return repo.unreadCount(playerId).then((unread_count) => ({ unread_count }));
    },

    async markRead(playerId: number, id: number) {
      if (!id) throw badRequest('Invalid notification id');
      await repo.markRead(playerId, id);
      return { ok: true };
    },

    async markAllRead(playerId: number) {
      await repo.markAllRead(playerId);
      return { ok: true };
    },

    async recordTip(playerId: number, lessonId: number) {
      if (!lessonId) throw badRequest('lesson_id is required');
      const lesson = await repo.lessonForTip(lessonId);
      if (!lesson) throw notFound('Lesson not found');
      await repo.insertTip(playerId, lesson.description, lessonId);
      return { ok: true };
    },
  };
}

export type TrainingNotificationsService = ReturnType<typeof createTrainingNotificationsService>;
