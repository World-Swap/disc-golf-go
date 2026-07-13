// routes/training-notifications.js — Training notification preferences, bell, and in-app notification management.
// Owns: player_training_notification_settings, training_notifications tables.
// Does NOT own: generic notifications (notifications.js), push infrastructure.
const express = require('express');
const { requireAuth } = require('../middleware/auth');

module.exports = ({ pool }) => {
  const router = express.Router();

  // Auth helper — accepts JWT or guest_uuid header
  async function getPlayerId(req) {
    const authHeader = req.headers.authorization;
    const guestUuid = req.headers['x-guest-uuid'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const { JWT_SECRET } = require('../middleware/auth');
      const jwt = require('jsonwebtoken');
      try {
        const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
        if (decoded && decoded.id) return decoded.id;
      } catch (_) {}
    }
    if (guestUuid) {
      const r = await pool.query('SELECT id FROM players WHERE guest_uuid = $1 LIMIT 1', [guestUuid]);
      if (r.rows.length) return r.rows[0].id;
    }
    return null;
  }

  // GET /api/training/notifications/settings — get current user's notification preferences
  router.get('/training/notifications/settings', async (req, res) => {
    try {
      const playerId = await getPlayerId(req);
      if (!playerId) return res.status(401).json({ error: 'Authentication required' });

      const row = await pool.query(
        `SELECT tips_enabled, tips_frequency, reminders_enabled,
                mission_alerts_enabled, achievement_alerts_enabled, push_enabled
         FROM player_training_notification_settings WHERE player_id = $1`,
        [playerId]
      );

      if (!row.rows.length) {
        // Return defaults if no record
        return res.json({
          tips_enabled: true,
          tips_frequency: 'daily',
          reminders_enabled: true,
          mission_alerts_enabled: true,
          achievement_alerts_enabled: true,
          push_enabled: false,
        });
      }
      res.json(row.rows[0]);
    } catch (err) {
      console.error('[training-notifications] GET /settings error:', err.message);
      res.status(500).json({ error: 'Failed to load notification settings' });
    }
  });

  // PUT /api/training/notifications/settings — update notification preferences
  router.put('/training/notifications/settings', async (req, res) => {
    try {
      const playerId = await getPlayerId(req);
      if (!playerId) return res.status(401).json({ error: 'Authentication required' });

      const {
        tips_enabled,
        tips_frequency,
        reminders_enabled,
        mission_alerts_enabled,
        achievement_alerts_enabled,
        push_enabled,
      } = req.body;

      const validFreqs = ['daily', 'every_2_days', 'weekly'];
      if (tips_frequency && !validFreqs.includes(tips_frequency)) {
        return res.status(400).json({ error: 'Invalid tips_frequency' });
      }

      await pool.query(`
        INSERT INTO player_training_notification_settings
          (player_id, tips_enabled, tips_frequency, reminders_enabled,
           mission_alerts_enabled, achievement_alerts_enabled, push_enabled)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (player_id) DO UPDATE SET
          tips_enabled = COALESCE($2, EXCLUDED.tips_enabled),
          tips_frequency = COALESCE($3, EXCLUDED.tips_frequency),
          reminders_enabled = COALESCE($4, EXCLUDED.reminders_enabled),
          mission_alerts_enabled = COALESCE($5, EXCLUDED.mission_alerts_enabled),
          achievement_alerts_enabled = COALESCE($6, EXCLUDED.achievement_alerts_enabled),
          push_enabled = COALESCE($7, EXCLUDED.push_enabled),
          updated_at = NOW()
      `, [
        playerId,
        tips_enabled !== undefined ? Boolean(tips_enabled) : null,
        tips_frequency || null,
        reminders_enabled !== undefined ? Boolean(reminders_enabled) : null,
        mission_alerts_enabled !== undefined ? Boolean(mission_alerts_enabled) : null,
        achievement_alerts_enabled !== undefined ? Boolean(achievement_alerts_enabled) : null,
        push_enabled !== undefined ? Boolean(push_enabled) : null,
      ]);

      const updated = await pool.query(
        'SELECT * FROM player_training_notification_settings WHERE player_id = $1',
        [playerId]
      );
      res.json(updated.rows[0]);
    } catch (err) {
      console.error('[training-notifications] PUT /settings error:', err.message);
      res.status(500).json({ error: 'Failed to save notification settings' });
    }
  });

  // GET /api/training/notifications — list user's training notifications
  router.get('/training/notifications', async (req, res) => {
    try {
      const playerId = await getPlayerId(req);
      if (!playerId) return res.status(401).json({ error: 'Authentication required' });

      const limit = Math.min(parseInt(req.query.limit) || 20, 50);
      const offset = parseInt(req.query.offset) || 0;

      const result = await pool.query(`
        SELECT tn.id, tn.type, tn.title, tn.message,
               tn.lesson_id, tn.is_read, tn.created_at,
               l.slug AS lesson_slug, l.title AS lesson_title
        FROM training_notifications tn
        LEFT JOIN training_lessons l ON l.id = tn.lesson_id
        WHERE tn.player_id = $1
        ORDER BY tn.created_at DESC
        LIMIT $2 OFFSET $3
      `, [playerId, limit, offset]);

      const countResult = await pool.query(
        'SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE NOT is_read) AS unread FROM training_notifications WHERE player_id = $1',
        [playerId]
      );

      res.json({
        notifications: result.rows,
        total: parseInt(countResult.rows[0].total),
        unread_count: parseInt(countResult.rows[0].unread),
      });
    } catch (err) {
      console.error('[training-notifications] GET /notifications error:', err.message);
      res.status(500).json({ error: 'Failed to load notifications' });
    }
  });

  // GET /api/training/notifications/unread-count — count unread for header bell
  router.get('/training/notifications/unread-count', async (req, res) => {
    try {
      const playerId = await getPlayerId(req);
      if (!playerId) return res.json({ unread_count: 0 });

      const result = await pool.query(
        'SELECT COUNT(*) AS unread FROM training_notifications WHERE player_id = $1 AND is_read = false',
        [playerId]
      );
      res.json({ unread_count: parseInt(result.rows[0].unread) });
    } catch (err) {
      console.error('[training-notifications] GET /unread-count error:', err.message);
      res.status(500).json({ error: 'Failed to get unread count' });
    }
  });

  // POST /api/training/notifications/:id/read — mark a single notification as read
  router.post('/training/notifications/:id/read', async (req, res) => {
    try {
      const playerId = await getPlayerId(req);
      if (!playerId) return res.status(401).json({ error: 'Authentication required' });

      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ error: 'Invalid notification id' });

      await pool.query(
        'UPDATE training_notifications SET is_read = true WHERE id = $1 AND player_id = $2',
        [id, playerId]
      );
      res.json({ ok: true });
    } catch (err) {
      console.error('[training-notifications] POST /read error:', err.message);
      res.status(500).json({ error: 'Failed to mark notification as read' });
    }
  });

  // POST /api/training/notifications/read-all — mark all as read
  router.post('/training/notifications/read-all', async (req, res) => {
    try {
      const playerId = await getPlayerId(req);
      if (!playerId) return res.status(401).json({ error: 'Authentication required' });

      await pool.query(
        'UPDATE training_notifications SET is_read = true WHERE player_id = $1 AND is_read = false',
        [playerId]
      );
      res.json({ ok: true });
    } catch (err) {
      console.error('[training-notifications] POST /read-all error:', err.message);
      res.status(500).json({ error: 'Failed to mark all as read' });
    }
  });

  // POST /api/training/notifications/record-tip — record that a tip was sent (for cron tracking)
  // Called by cron job scripts after sending each tip
  router.post('/training/notifications/record-tip', async (req, res) => {
    try {
      const playerId = await getPlayerId(req);
      if (!playerId) return res.status(401).json({ error: 'Authentication required' });

      const { lesson_id } = req.body;
      if (!lesson_id) return res.status(400).json({ error: 'lesson_id is required' });

      const lesson = await pool.query(
        'SELECT l.*, c.name AS category_name FROM training_lessons l JOIN training_categories c ON c.id = l.category_id WHERE l.id = $1 AND l.is_active = true',
        [lesson_id]
      );
      if (!lesson.rows.length) return res.status(404).json({ error: 'Lesson not found' });

      const lr = lesson.rows[0];
      await pool.query(`
        INSERT INTO training_notifications (player_id, type, title, message, lesson_id)
        VALUES ($1, 'daily_tip', $2, $3, $4)
      `, [playerId, 'Daily Training Tip', lr.description, lesson_id]);

      res.json({ ok: true });
    } catch (err) {
      console.error('[training-notifications] POST /record-tip error:', err.message);
      res.status(500).json({ error: 'Failed to record tip' });
    }
  });

  return router;
};