// src/modules/notifications/notifications.repo.ts — admin-composed in-app
// notices + per-user dismissals (user-facing reads only).

import type { Queryable } from '../../db/types';

const UNDISMISSED = `
  SELECT n.id, n.title, n.message, n.created_at
  FROM notifications n
  WHERE n.is_active = true
    AND n.id NOT IN (SELECT notification_id FROM user_notification_dismissals WHERE player_id = $1)
  ORDER BY n.created_at DESC`;

export function createNotificationsRepo(db: Queryable) {
  return {
    async allActive(playerId: number) {
      const r = await db.query(UNDISMISSED, [playerId]);
      return r.rows;
    },

    async mostRecentActive(playerId: number) {
      const r = await db.query(`${UNDISMISSED} LIMIT 1`, [playerId]);
      return r.rows[0] ?? null;
    },

    async dismiss(playerId: number, notificationId: number) {
      await db.query(
        `INSERT INTO user_notification_dismissals (player_id, notification_id) VALUES ($1, $2) ON CONFLICT (player_id, notification_id) DO NOTHING`,
        [playerId, notificationId]
      );
    },
  };
}

export type NotificationsRepo = ReturnType<typeof createNotificationsRepo>;
