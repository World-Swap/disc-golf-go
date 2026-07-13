// routes/referrals.js — owns referral code generation, referral stats, and reward delivery.
// Does NOT own: signup (auth.js handles referral code claim), round completion (rounds.js triggers reward).

const express = require('express');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');
const { appendUtm } = require('../lib/utm');

const REFERRAL_UTM = { source: 'referral_share', medium: 'share_link', campaign: 'referral_program' };

// Referral reward config — Mechanic A: referrer earns gold when friend completes qualifying round
const ACTIVATION_WINDOW_DAYS = 90;
const REWARD_GOLD = 200; // 200 gold when friend completes a 9+ hole round

// ── Analytics event helpers ──────────────────────────────────────────────────
// All referral funnel events go to the referral_events table and fire a
// referral_link_clicked payload to the pageview pipeline via the pageviews log.

// Track a referral funnel event. Non-blocking — never delays the response.
function trackReferralEvent(pool, { eventType, referralCode, referrerId, userId, metadata = {} }) {
  pool.query(
    `INSERT INTO referral_events
     (event_type, referral_code, referrer_id, user_id, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, now())`,
    [eventType, referralCode, referrerId || null, userId || null, JSON.stringify(metadata)]
  ).catch(err => console.error('[referrals] trackReferralEvent failed:', err.message));
}

// Generate a short, URL-safe referral code (8 chars, uppercase alphanumeric)
function generateCode() {
  return crypto.randomBytes(5).toString('base64')
    .replace(/\//g, 'X').replace(/\//g, 'X')
    .replace(/\//g, 'X').replace(/\//g, 'X')
    .toUpperCase()
    .slice(0, 8);
}

// Compute expiration date (90 days from now)
function expiresAt() {
  const d = new Date();
  d.setDate(d.getDate() + ACTIVATION_WINDOW_DAYS);
  return d.toISOString();
}

module.exports = ({ pool }) => {
  const router = express.Router();

  // GET /api/referrals/me — get referrer's own referral codes + stats
  router.get('/referrals/me', requireAuth, async (req, res) => {
    const playerId = req.player.id;

    try {
      const [codesResult, activationsResult, playerResult] = await Promise.all([
        pool.query(
          `SELECT code, created_at FROM referral_codes WHERE player_id = $1`,
          [playerId]
        ),
        pool.query(
          `SELECT ra.code_used, ra.status, ra.reward_type, ra.reward_amount, ra.rewarded_at,
                  ra.friend_id, ra.expires_at, ra.created_at,
                  p.display_name AS friend_name
           FROM referral_activations ra
           LEFT JOIN players p ON p.id = ra.friend_id
           WHERE ra.referrer_id = $1
           ORDER BY ra.created_at DESC
           LIMIT 50`,
          [playerId]
        ),
        pool.query('SELECT display_name, gold FROM players WHERE id = $1', [playerId]),
      ]);

      const player = playerResult.rows[0];

      // Build referral link base from app URL env
      const baseUrl = process.env.APP_URL || 'https://disc-golf-go.polsia.app';

      const codes = codesResult.rows.map(row => ({
        code: row.code,
        referral_url: appendUtm(`${baseUrl}/register?ref=${row.code}`, REFERRAL_UTM),
        created_at: row.created_at,
      }));

      const referrals = activationsResult.rows.map(row => ({
        code_used: row.code_used,
        status: row.status,
        friend_name: row.friend_id ? row.friend_name : null,
        reward_type: row.reward_type,
        reward_amount: row.reward_amount,
        rewarded_at: row.rewarded_at,
        expires_at: row.expires_at,
        created_at: row.created_at,
      }));

      const total_rewards_gold = referrals
        .filter(r => r.status === 'rewarded' && r.reward_type === 'gold')
        .reduce((sum, r) => sum + (r.reward_amount || 0), 0);

      const activated_count = referrals.filter(r => r.status === 'activated' || r.status === 'rewarded').length;
      const rewarded_count = referrals.filter(r => r.status === 'rewarded').length;

      res.json({
        codes,
        referrals,
        stats: {
          total_codes: codes.length,
          total_referrals_sent: referrals.length,
          activated_count,
          rewarded_count,
          total_rewards_gold: total_rewards_gold,
        },
        player_name: player?.display_name,
        current_gold: player?.gold || 0,
        activation_window_days: ACTIVATION_WINDOW_DAYS,
        reward_description: `200 gold when your friend completes a 9+ hole round`,
      });
    } catch (err) {
      console.error('[referrals] GET /me error:', err.message);
      res.status(500).json({ error: 'Failed to load referral info' });
    }
  });

  // POST /api/referrals/generate — generate a new referral code for the authenticated player
  router.post('/referrals/generate', requireAuth, async (req, res) => {
    const playerId = req.player.id;

    try {
      // Check if player already has a code
      const existing = await pool.query(
        'SELECT code FROM referral_codes WHERE player_id = $1',
        [playerId]
      );

      if (existing.rows.length > 0) {
        // Reuse existing code — return it (immutable, no need to regenerate)
        const code = existing.rows[0].code;
        const baseUrl = process.env.APP_URL || 'https://disc-golf-go.polsia.app';
        return res.json({
          code,
          referral_url: appendUtm(`${baseUrl}/register?ref=${code}`, REFERRAL_UTM),
          already_existed: true,
        });
      }

      // Generate unique code (retry on collision — extremely rare with 8 chars)
      let code;
      let attempts = 0;
      while (attempts < 10) {
        code = generateCode();
        const collision = await pool.query(
          'SELECT id FROM referral_codes WHERE code = $1',
          [code]
        );
        if (collision.rows.length === 0) break;
        attempts++;
      }

      await pool.query(
        'INSERT INTO referral_codes (player_id, code) VALUES ($1, $2)',
        [playerId, code]
      );

      const baseUrl = process.env.APP_URL || 'https://disc-golf-go.polsia.app';
      res.status(201).json({
        code,
        referral_url: appendUtm(`${baseUrl}/register?ref=${code}`, REFERRAL_UTM),
        already_existed: false,
      });
    } catch (err) {
      console.error('[referrals] POST /generate error:', err.message);
      res.status(500).json({ error: 'Failed to generate referral code' });
    }
  });

  // GET /api/referrals/click — fires referral_link_clicked event then redirects to /register
  // Called by the public /referral landing page when user clicks a referral link.
  router.get('/referrals/click', async (req, res) => {
    const { code } = req.query;
    const baseUrl = process.env.APP_URL || 'https://disc-golf-go.polsia.app';

    if (!code || code.length < 4 || code.length > 12) {
      return res.redirect(baseUrl);
    }

    try {
      const result = await pool.query(
        `SELECT rc.code, p.id AS referrer_id
         FROM referral_codes rc
         JOIN players p ON p.id = rc.player_id
         WHERE rc.code = $1`,
        [code.toUpperCase()]
      );

      if (result.rows.length > 0) {
        const { code: validCode, referrer_id } = result.rows[0];
        trackReferralEvent(pool, {
          eventType: 'referral_link_clicked',
          referralCode: validCode,
          referrerId: referrer_id,
          userId: null,
          metadata: {
            user_agent: (req.headers['user-agent'] || '').substring(0, 500),
            referer: (req.headers['referer'] || '').substring(0, 200),
          },
        });
        return res.redirect(appendUtm(`${baseUrl}/register?ref=${validCode}`, REFERRAL_UTM));
      }

      res.redirect(baseUrl);
    } catch (err) {
      console.error('[referrals] GET /click error:', err.message);
      res.redirect(baseUrl);
    }
  });
  router.get('/referrals/validate/:code', async (req, res) => {
    const { code } = req.params;

    if (!code || code.length < 4 || code.length > 12) {
      return res.status(400).json({ valid: false, error: 'Invalid code format' });
    }

    try {
      const result = await pool.query(
        `SELECT rc.code, p.display_name AS referrer_name
         FROM referral_codes rc
         JOIN players p ON p.id = rc.player_id
         WHERE rc.code = $1`,
        [code.toUpperCase()]
      );

      if (result.rows.length === 0) {
        return res.json({ valid: false, error: 'Code not found' });
      }

      const row = result.rows[0];
      res.json({
        valid: true,
        code: row.code,
        referrer_name: row.referrer_name,
        reward_preview: 'You and the referrer both earn rewards when you complete a 9+ hole round!',
      });
    } catch (err) {
      console.error('[referrals] GET /validate error:', err.message);
      res.status(500).json({ error: 'Failed to validate code' });
    }
  });

  // POST /api/referrals/claim — internal endpoint called by auth.js during signup
  // Marks a referral activation as "activated" and starts the 90-day window
  router.post('/referrals/claim', requireAuth, async (req, res) => {
    const friendId = req.player.id;
    const { code } = req.body;

    if (!code) return res.status(400).json({ error: 'referral code required' });

    try {
      // Find the referrer by code
      const referrerRow = await pool.query(
        'SELECT player_id FROM referral_codes WHERE code = $1',
        [code.toUpperCase()]
      );

      if (referrerRow.rows.length === 0) {
        return res.json({ claimed: false, reason: 'code_not_found' });
      }

      const referrerId = referrerRow.rows[0].player_id;

      // Fraud: can't refer yourself
      if (referrerId === friendId) {
        return res.json({ claimed: false, reason: 'self_referral' });
      }

      // Upsert activation — create or update
      const expiresAtDate = expiresAt();
      await pool.query(
        `INSERT INTO referral_activations (referrer_id, friend_id, code_used, expires_at, status)
         VALUES ($1, $2, $3, $4, 'activated')
         ON CONFLICT (referrer_id, code_used)
         DO UPDATE SET
           friend_id = $2,
           status = CASE WHEN status = 'pending' THEN 'activated' ELSE status END,
           expires_at = CASE WHEN status = 'pending' THEN $4 ELSE referral_activations.expires_at END`,
        [referrerId, friendId, code.toUpperCase(), expiresAtDate]
      );

      // Analytics: referral_signup — friend created account with code
      trackReferralEvent(pool, {
        eventType: 'referral_signup',
        referralCode: code.toUpperCase(),
        referrerId,
        userId: friendId,
        metadata: { activation_status: 'activated' },
      });

      res.json({ claimed: true, expires_at: expiresAtDate });
    } catch (err) {
      console.error('[referrals] POST /claim error:', err.message);
      res.status(500).json({ error: 'Failed to process referral claim' });
    }
  });

  // POST /api/referrals/share — fire referral_share event when authenticated user shares their code
  router.post('/referrals/share', requireAuth, async (req, res) => {
    const playerId = req.player.id;
    const { code } = req.body;

    if (!code) return res.status(400).json({ error: 'referral code required' });

    try {
      const ownerRow = await pool.query(
        'SELECT player_id FROM referral_codes WHERE code = $1',
        [code.toUpperCase()]
      );

      if (ownerRow.rows.length === 0 || ownerRow.rows[0].player_id !== playerId) {
        return res.status(403).json({ error: 'not your code' });
      }

      trackReferralEvent(pool, {
        eventType: 'referral_share',
        referralCode: code.toUpperCase(),
        referrerId: playerId,
        userId: playerId,
        metadata: { share_source: 'referrals_page' },
      });

      res.json({ shared: true });
    } catch (err) {
      console.error('[referrals] POST /share error:', err.message);
      res.status(500).json({ error: 'Failed to log share event' });
    }
  });

  // INTERNAL: Called by rounds.js when a qualifying round is completed
  // Awards referrer their gold reward if the activation qualifies
  router.post('/referrals/award', requireAuth, async (req, res) => {
    const friendId = req.player.id;

    try {
      // Find all activated (not yet rewarded) referrals for this friend where the window is still open
      const activations = await pool.query(
        `SELECT id, referrer_id, code_used, expires_at
         FROM referral_activations
         WHERE friend_id = $1 AND status = 'activated' AND expires_at > now()`,
        [friendId]
      );

      if (activations.rows.length === 0) {
        return res.json({ awarded: false, reason: 'no_active_referral' });
      }

      // Award the first (most recent) qualifying activation
      // In practice there should be at most one, but we handle all gracefully
      const results = [];
      for (const activation of activations.rows) {
        const existing = await pool.query(
          `SELECT id FROM referral_activations WHERE id = $1 AND status = 'rewarded'`,
          [activation.id]
        );
        if (existing.rows.length > 0) continue; // already rewarded

        // Grant gold to referrer
        await pool.query(
          `UPDATE players SET gold = gold + $1 WHERE id = $2`,
          [REWARD_GOLD, activation.referrer_id]
        );

        // Also grant 50 gold to the friend as their sign-up incentive
        await pool.query(
          `UPDATE players SET gold = gold + 50 WHERE id = $1`,
          [friendId]
        );

        // Mark activation as rewarded
        await pool.query(
          `UPDATE referral_activations
           SET status = 'rewarded', reward_type = 'gold', reward_amount = $1, rewarded_at = now()
           WHERE id = $2`,
          [REWARD_GOLD, activation.id]
        );

        // Analytics: referral_first_round — friend completed qualifying round
        trackReferralEvent(pool, {
          eventType: 'referral_first_round',
          referralCode: activation.code_used,
          referrerId: activation.referrer_id,
          userId: friendId,
          metadata: { reward_gold: REWARD_GOLD, friend_bonus: 50 },
        });

        // Log to xp_log for visibility
        await pool.query(
          `INSERT INTO xp_log (player_id, source, amount, context)
           VALUES ($1, 'referral_reward', $2, $3)`,
          [activation.referrer_id, REWARD_GOLD, JSON.stringify({ friend_id: friendId, activation_id: activation.id })]
        );

        await pool.query(
          `INSERT INTO xp_log (player_id, source, amount, context)
           VALUES ($1, 'referral_signup_bonus', 50, $2)`,
          [friendId, JSON.stringify({ referrer_activation_id: activation.id })]
        );

        results.push({ referrer_id: activation.referrer_id, amount: REWARD_GOLD });
      }

      if (results.length === 0) {
        return res.json({ awarded: false, reason: 'already_rewarded' });
      }

      res.json({ awarded: true, rewards: results, friend_bonus: 50 });
    } catch (err) {
      console.error('[referrals] POST /award error:', err.message);
      res.status(500).json({ error: 'Failed to award referral reward' });
    }
  });

  return router;
};