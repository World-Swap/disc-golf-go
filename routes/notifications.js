// notifications.js — owns notifications CRUD (admin), user dismissal, and admin email messaging
// Does NOT own: auth, player profile, any other feature area

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin, sanitizeFields } = require('../middleware/security');

module.exports = ({ pool }) => {
  const router = express.Router();

  // GET /api/notifications/all — all active notifications not yet dismissed by this user
  // Used by the header bell panel to show full list + unread count
  router.get('/notifications/all', requireAuth(pool), async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT n.id, n.title, n.message, n.created_at
         FROM notifications n
         WHERE n.is_active = true
           AND n.id NOT IN (
             SELECT notification_id FROM user_notification_dismissals WHERE player_id = $1
           )
         ORDER BY n.created_at DESC`,
        [req.player.id]
      );
      res.json({ notifications: result.rows });
    } catch (err) {
      console.error('notifications/all error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /api/notifications/active — active notifications not yet dismissed by this user
  // Returns at most 1 (most recent) for the popup; requires auth
  router.get('/notifications/active', requireAuth(pool), async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT n.id, n.title, n.message, n.created_at
         FROM notifications n
         WHERE n.is_active = true
           AND n.id NOT IN (
             SELECT notification_id FROM user_notification_dismissals WHERE player_id = $1
           )
         ORDER BY n.created_at DESC
         LIMIT 1`,
        [req.player.id]
      );
      res.json({ notification: result.rows[0] || null });
    } catch (err) {
      console.error('notifications/active error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /api/notifications/:id/dismiss — mark a notification dismissed for this user
  router.post('/notifications/:id/dismiss', requireAuth(pool), async (req, res) => {
    const notificationId = parseInt(req.params.id, 10);
    if (!notificationId) return res.status(400).json({ error: 'Invalid notification id' });
    try {
      await pool.query(
        `INSERT INTO user_notification_dismissals (player_id, notification_id)
         VALUES ($1, $2)
         ON CONFLICT (player_id, notification_id) DO NOTHING`,
        [req.player.id, notificationId]
      );
      res.json({ ok: true });
    } catch (err) {
      console.error('notifications/dismiss error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Admin endpoints ────────────────────────────────────────────────────────

  // GET /api/admin/notifications — list all notifications
  router.get('/admin/notifications', requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, title, message, is_active, created_at
         FROM notifications
         ORDER BY created_at DESC`
      );
      res.json({ notifications: result.rows });
    } catch (err) {
      console.error('admin/notifications list error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /api/admin/notifications — create a new notification
  router.post('/admin/notifications', requireAdmin, sanitizeFields('title', 'message'), async (req, res) => {
    const { title, message, is_active = true } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });
    if (!message || !message.trim()) return res.status(400).json({ error: 'message is required' });
    try {
      const result = await pool.query(
        `INSERT INTO notifications (title, message, is_active)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [title.trim(), message.trim(), Boolean(is_active)]
      );
      res.json({ notification: result.rows[0] });
    } catch (err) {
      console.error('admin/notifications create error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // PATCH /api/admin/notifications/:id — update title, message, or is_active
  router.patch('/admin/notifications/:id', requireAdmin, sanitizeFields('title', 'message'), async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const { title, message, is_active } = req.body;

    // Build dynamic SET clause — only update provided fields
    const sets = [];
    const params = [];
    if (title !== undefined) { params.push(title.trim()); sets.push(`title = $${params.length}`); }
    if (message !== undefined) { params.push(message.trim()); sets.push(`message = $${params.length}`); }
    if (is_active !== undefined) { params.push(Boolean(is_active)); sets.push(`is_active = $${params.length}`); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(id);
    try {
      const result = await pool.query(
        `UPDATE notifications SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
      res.json({ notification: result.rows[0] });
    } catch (err) {
      console.error('admin/notifications update error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // DELETE /api/admin/notifications/:id — hard delete
  router.delete('/admin/notifications/:id', requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      await pool.query('DELETE FROM notifications WHERE id = $1', [id]);
      res.json({ ok: true });
    } catch (err) {
      console.error('admin/notifications delete error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Admin email messaging ───────────────────────────────────────────────────

  // GET /api/admin/emails — list sent email history, newest first
  router.get('/admin/emails', requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, subject, recipient_type, recipients, recipient_count, status, notes, sent_at
         FROM admin_emails
         ORDER BY sent_at DESC
         LIMIT 100`
      );
      res.json({ emails: result.rows });
    } catch (err) {
      console.error('admin/emails list error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /api/admin/emails/users-search — search players by name/email for recipient picker
  router.get('/admin/emails/users-search', requireAdmin, async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) return res.json({ users: [] });
    try {
      const result = await pool.query(
        `SELECT id, display_name, username, email
         FROM players
         WHERE LOWER(display_name) LIKE $1 OR LOWER(username) LIKE $1 OR LOWER(email) LIKE $1
         ORDER BY display_name ASC
         LIMIT 20`,
        ['%' + q.toLowerCase() + '%']
      );
      res.json({ users: result.rows });
    } catch (err) {
      console.error('admin/emails users-search error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /api/admin/emails/send — send email blast or individual email via Polsia proxy
  router.post('/admin/emails/send', requireAdmin, sanitizeFields('subject', 'body'), async (req, res) => {
    const { subject, body, recipient_type, recipient_ids } = req.body;

    if (!subject || !subject.trim()) return res.status(400).json({ error: 'subject is required' });
    if (!body || !body.trim()) return res.status(400).json({ error: 'body is required' });
    if (!['all', 'individual'].includes(recipient_type)) {
      return res.status(400).json({ error: 'recipient_type must be "all" or "individual"' });
    }
    if (recipient_type === 'individual' && (!Array.isArray(recipient_ids) || recipient_ids.length === 0)) {
      return res.status(400).json({ error: 'recipient_ids is required for individual sends' });
    }

    const POLSIA_API_KEY = process.env.POLSIA_API_KEY;
    if (!POLSIA_API_KEY) {
      return res.status(500).json({ error: 'Email proxy not configured (missing POLSIA_API_KEY)' });
    }

    try {
      let recipients = [];

      if (recipient_type === 'all') {
        // Fetch all player emails
        const result = await pool.query(
          `SELECT id, display_name, email FROM players WHERE email IS NOT NULL AND email != '' ORDER BY created_at ASC`
        );
        recipients = result.rows;
      } else {
        // Fetch specified players
        const ids = recipient_ids.map(id => parseInt(id)).filter(Boolean);
        if (!ids.length) return res.status(400).json({ error: 'No valid recipient IDs' });
        const result = await pool.query(
          `SELECT id, display_name, email FROM players WHERE id = ANY($1) AND email IS NOT NULL`,
          [ids]
        );
        recipients = result.rows;
      }

      if (!recipients.length) {
        return res.status(400).json({ error: 'No recipients found' });
      }

      // Send emails via Polsia proxy — individual sends (not BCC) so each player gets a personal copy
      let sent = 0;
      let failed = 0;
      const errors = [];

      for (const player of recipients) {
        try {
          const response = await fetch('https://polsia.com/api/proxy/email/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${POLSIA_API_KEY}`,
            },
            body: JSON.stringify({
              to: player.email,
              subject: subject.trim(),
              body: body.trim(),
            }),
          });

          if (response.ok) {
            sent++;
          } else {
            failed++;
            const errData = await response.json().catch(() => ({}));
            errors.push(`${player.email}: ${errData.error || response.status}`);
          }
        } catch (fetchErr) {
          failed++;
          errors.push(`${player.email}: network error`);
        }
      }

      // Record in audit log
      const status = failed === 0 ? 'sent' : sent === 0 ? 'failed' : 'partial';
      const notes = errors.length > 0 ? errors.slice(0, 5).join('; ') : null;

      const logResult = await pool.query(
        `INSERT INTO admin_emails (subject, body, recipient_type, recipients, recipient_count, status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, sent_at`,
        [
          subject.trim(),
          body.trim(),
          recipient_type,
          recipient_type === 'individual' ? JSON.stringify(recipients.map(p => ({ id: p.id, email: p.email, display_name: p.display_name }))) : null,
          recipients.length,
          status,
          notes,
        ]
      );

      res.json({
        ok: true,
        sent,
        failed,
        total: recipients.length,
        status,
        email_id: logResult.rows[0].id,
        sent_at: logResult.rows[0].sent_at,
      });
    } catch (err) {
      console.error('admin/emails send error:', err);
      res.status(500).json({ error: 'Failed to send emails' });
    }
  });

  return router;
};
