// routes/onboarding.js — owns onboarding flow, event tracking, and analytics.
// Does NOT own: player profile, XP, auth — those live in auth.js and players.

const express = require('express');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');

module.exports = ({ pool }) => {
  const router = express.Router();

  // ── Extract player ID from JWT or guest_uuid header ─────────────────────────
  async function resolvePlayerId(req) {
    const authHeader = req.headers.authorization;
    const guestUuid = req.headers['x-guest-uuid'];

    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
        if (decoded && decoded.id) return { playerId: decoded.id, guestUuid: null };
      } catch (_) {}
    }

    if (guestUuid) {
      try {
        const r = await pool.query('SELECT id FROM players WHERE guest_uuid = $1 LIMIT 1', [guestUuid]);
        if (r.rows.length) return { playerId: r.rows[0].id, guestUuid };
      } catch (_) {}
    }

    return null;
  }

  // ── Track onboarding events (analytics funnel) ──────────────────────────────

  async function trackEvent({
    player_id = null,
    guest_uuid = null,
    event_type,
    experience_level = null,
    session_id = null,
  }) {
    if (!event_type) return;
    try {
      await pool.query(
        `INSERT INTO onboarding_events (player_id, guest_uuid, event_type, experience_level, session_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [player_id, guest_uuid, event_type, experience_level, session_id]
      );
    } catch (err) {
      console.error('[onboarding] trackEvent failed:', err.message);
    }
  }

  // POST /api/onboarding/event
  // Fire-and-forget event tracker — never blocks the client.
  router.post('/onboarding/event', async (req, res) => {
    const { player_id, guest_uuid, event_type, experience_level, session_id } = req.body;

    const validTypes = [
      'onboard_loaded', 'experience_selected', 'tutorial_started',
      'tutorial_completed', 'tutorial_skipped', 'signup_prompted',
      'signup_triggered', 'guest_played_first_throw',
    ];

    if (!event_type || !validTypes.includes(event_type)) {
      return res.status(400).json({ error: 'invalid event_type' });
    }

    trackEvent({ player_id, guest_uuid, event_type, experience_level, session_id });
    res.json({ ok: true });
  });

  // ── Experience level selection ─────────────────────────────────────────────

  // PUT /api/onboarding/experience
  router.put('/onboarding/experience', async (req, res) => {
    const { experience_level } = req.body;
    if (!experience_level || !['new', 'experienced'].includes(experience_level)) {
      return res.status(400).json({ error: 'experience_level must be "new" or "experienced"' });
    }

    const resolved = await resolvePlayerId(req);
    if (!resolved) return res.status(401).json({ error: 'not authenticated' });

    try {
      await pool.query(
        'UPDATE players SET experience_level = $1 WHERE id = $2',
        [experience_level, resolved.playerId]
      );
      trackEvent({ player_id: resolved.playerId, event_type: 'experience_selected', experience_level });
      res.json({ ok: true, experience_level });
    } catch (err) {
      console.error('Set experience level error:', err.message);
      res.status(500).json({ error: 'failed to update experience level' });
    }
  });

  // ── Complete onboarding ─────────────────────────────────────────────────────

  // POST /api/onboarding/complete
  router.post('/onboarding/complete', async (req, res) => {
    const resolved = await resolvePlayerId(req);
    if (!resolved) return res.status(401).json({ error: 'not authenticated' });

    try {
      await pool.query(
        'UPDATE players SET onboarding_completed = true WHERE id = $1',
        [resolved.playerId]
      );
      res.json({ ok: true });
    } catch (err) {
      console.error('Complete onboarding error:', err.message);
      res.status(500).json({ error: 'failed to complete onboarding' });
    }
  });

  // GET /api/onboarding/status
  router.get('/onboarding/status', async (req, res) => {
    const resolved = await resolvePlayerId(req);

    if (!resolved) {
      return res.json({ needs_onboarding: false, onboarding_completed: true });
    }

    try {
      const r = await pool.query(
        'SELECT onboarding_completed, experience_level, is_guest FROM players WHERE id = $1',
        [resolved.playerId]
      );
      if (!r.rows.length) return res.json({ needs_onboarding: false, onboarding_completed: true });

      const p = r.rows[0];
      res.json({
        onboarding_completed: p.onboarding_completed,
        experience_level: p.experience_level,
        is_guest: p.is_guest,
        needs_onboarding: !p.onboarding_completed,
      });
    } catch (err) {
      console.error('Onboarding status error:', err.message);
      res.status(500).json({ error: 'server error' });
    }
  });

  // ── Admin: onboarding funnel analytics ─────────────────────────────────────

  // GET /api/onboarding/analytics
  router.get('/onboarding/analytics', async (req, res) => {
    const adminToken = req.headers['x-admin-token'];
    if (!adminToken || adminToken !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ error: 'admin only' });
    }

    try {
      const cohortStats = await pool.query(`
        SELECT
          p.experience_level,
          COUNT(DISTINCT p.id) FILTER (WHERE p.is_guest = false) AS registered_users,
          COUNT(DISTINCT p.id) FILTER (WHERE p.is_guest = true) AS guest_users,
          COUNT(DISTINCT p.id) FILTER (WHERE p.onboarding_completed = true) AS completed,
          COUNT(DISTINCT p.id) FILTER (WHERE p.onboarding_skipped = true) AS skipped,
          COUNT(DISTINCT p.id) FILTER (WHERE p.onboarding_completed = false AND p.onboarding_skipped = false AND p.created_at > NOW() - INTERVAL '7 days') AS in_progress_7d
        FROM players p
        GROUP BY p.experience_level
      `);

      const eventCounts = await pool.query(`
        SELECT event_type, experience_level, COUNT(*) AS count
        FROM onboarding_events
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY event_type, experience_level
        ORDER BY event_type, experience_level
      `);

      const funnelRates = await pool.query(`
        SELECT
          experience_level,
          COUNT(*) FILTER (WHERE event_type = 'tutorial_started') AS started,
          COUNT(*) FILTER (WHERE event_type = 'tutorial_completed') AS completed,
          COUNT(*) FILTER (WHERE event_type = 'tutorial_skipped') AS skipped
        FROM onboarding_events
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY experience_level
      `);

      res.json({
        cohort_stats: cohortStats.rows,
        event_counts: eventCounts.rows,
        funnel_rates: funnelRates.rows,
        period: 'last_30_days',
      });
    } catch (err) {
      console.error('Onboarding analytics error:', err.message);
      res.status(500).json({ error: 'analytics failed' });
    }
  });

  return router;
};