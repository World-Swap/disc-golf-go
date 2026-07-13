// routes/auth.js — owns signup, login, guest accounts, password reset.
// Does NOT own: player profile, XP curve (see xp-engine), email transport (see lib/email).

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { createToken } = require('../middleware/auth');
const { rateLimit, sanitizeFields } = require('../middleware/security');
const { getLevelFromXp, getLevelProgress } = require('./xp-engine');
const { appBaseUrl } = require('../lib/app-url');
const { sendEmail } = require('../lib/email');

// Shape a player row into the public payload returned by auth endpoints.
function publicPlayer(p, extra = {}) {
  return {
    id: p.id,
    display_name: p.display_name,
    username: p.username,
    email: p.email,
    profile_photo_url: p.profile_photo_url,
    xp: p.xp,
    level: getLevelFromXp(p.xp),
    level_progress: getLevelProgress(p.xp),
    ...extra,
  };
}

// Cryptographically secure single-use reset token (32 bytes = 64 hex chars).
function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Compose + send the password-reset email (transport lives in lib/email).
async function sendResetEmail(toEmail, resetToken) {
  const resetUrl = `${appBaseUrl()}/reset-password?token=${resetToken}`;

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0a0a1a;color:#fff;border-radius:12px;overflow:hidden;">
      <div style="background:#7ed957;padding:20px 24px;">
        <p style="margin:0;font-size:1.2rem;font-weight:700;color:#0a0a1a;">🥏 Disc Golf Go</p>
      </div>
      <div style="padding:32px 24px;">
        <h1 style="margin:0 0 12px;font-size:1.5rem;">Reset your password</h1>
        <p style="color:#aaa;margin-bottom:24px;">Click the button below to choose a new password. This link expires in <strong style="color:#fff;">1 hour</strong>.</p>
        <a href="${resetUrl}" style="display:inline-block;background:#7ed957;color:#0a0a1a;padding:14px 28px;border-radius:10px;font-weight:700;text-decoration:none;font-size:1rem;">Reset Password →</a>
        <p style="color:#666;font-size:0.8rem;margin-top:24px;">If you didn't request this, you can safely ignore this email. Your password won't change.</p>
        <p style="color:#444;font-size:0.75rem;margin-top:8px;word-break:break-all;">Or copy this link: ${resetUrl}</p>
      </div>
    </div>
  `;

  await sendEmail({
    to: toEmail,
    subject: 'Reset your Disc Golf Go password',
    text: `Reset your Disc Golf Go password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
    html,
  });
}

module.exports = ({ pool }) => {
  const router = express.Router();

  // Rate limiters for auth endpoints — prevent brute force attacks.
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, message: 'Too many attempts, please try again in 15 minutes' });
  const signupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: 'Too many signup attempts, please try again later' });
  const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: 'Too many password reset attempts, please try again later' });

  // POST /api/auth/signup
  router.post('/auth/signup', signupLimiter, sanitizeFields('display_name'), async (req, res, next) => {
    const { display_name, username, email, password, referral_code } = req.body;

    if (!display_name || !username || !email || !password) {
      return res.status(400).json({ error: 'display_name, username, email, and password are required' });
    }
    if (display_name.length < 2 || display_name.length > 30) {
      return res.status(400).json({ error: 'Display name must be 2-30 characters' });
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-20 characters: letters, numbers, underscores only' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const emailLower = email.toLowerCase();
    const usernameLower = username.toLowerCase();

    try {
      // Single uniqueness check; email conflict takes priority over username.
      const existing = await pool.query(
        'SELECT email, username FROM players WHERE email = $1 OR username = $2',
        [emailLower, usernameLower]
      );
      if (existing.rows.some(r => r.email === emailLower)) {
        return res.status(409).json({ error: 'An account with that email already exists' });
      }
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'That username is already taken' });
      }

      const password_hash = await bcrypt.hash(password, 10);
      const player_uuid = crypto.randomUUID();

      const result = await pool.query(
        `INSERT INTO players (player_uuid, display_name, username, email, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, player_uuid, display_name, username, email, xp, profile_photo_url, created_at`,
        [player_uuid, display_name.trim(), usernameLower, emailLower, password_hash]
      );
      const player = result.rows[0];

      const token = createToken({ id: player.id, player_uuid: player.player_uuid });

      // Fire-and-forget referral claim — don't block signup on referral processing.
      if (referral_code && typeof referral_code === 'string') {
        fetch(`${appBaseUrl()}/api/referrals/claim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ code: referral_code }),
        }).catch(err => console.error('[auth] Referral claim failed:', err.message));
      }

      res.status(201).json({ token, player: publicPlayer(player) });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/auth/login
  router.post('/auth/login', authLimiter, async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
      const result = await pool.query(
        'SELECT id, player_uuid, display_name, username, email, password_hash, xp, profile_photo_url FROM players WHERE email = $1',
        [email.toLowerCase()]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const player = result.rows[0];

      if (!player.password_hash) {
        return res.status(401).json({ error: 'This account was created before passwords were added. Please sign up again.' });
      }

      const valid = await bcrypt.compare(password, player.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = createToken({ id: player.id, player_uuid: player.player_uuid });

      res.json({ token, player: publicPlayer(player) });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/auth/forgot-password
  // Always returns the same response — never reveals whether the email exists.
  router.post('/auth/forgot-password', resetLimiter, async (req, res, next) => {
    const { email } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email address required' });
    }

    const normalized = email.toLowerCase().trim();

    try {
      // Per-email throttle: at most 3 reset tokens per hour.
      const rateCheck = await pool.query(
        `SELECT COUNT(*) AS cnt
         FROM password_reset_tokens prt
         JOIN players p ON p.id = prt.player_id
         WHERE p.email = $1
           AND prt.created_at > NOW() - INTERVAL '1 hour'`,
        [normalized]
      );
      if (parseInt(rateCheck.rows[0].cnt, 10) >= 3) {
        // Still return success — don't leak rate-limit state that aids enumeration.
        return res.json({ success: true });
      }

      const playerResult = await pool.query('SELECT id FROM players WHERE email = $1', [normalized]);

      if (playerResult.rows.length > 0) {
        const playerId = playerResult.rows[0].id;
        const token = generateResetToken();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await pool.query(
          `INSERT INTO password_reset_tokens (player_id, token, expires_at) VALUES ($1, $2, $3)`,
          [playerId, token, expiresAt]
        );

        // Fire-and-forget — don't block the response on email delivery.
        sendResetEmail(normalized, token).catch(err => {
          console.error('[auth] Password reset email failed:', err.message);
        });
      }

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/auth/reset-password
  // Validates the token, updates the password, and invalidates all of the
  // player's outstanding reset tokens (single-use guarantee).
  router.post('/auth/reset-password', resetLimiter, async (req, res, next) => {
    const { token, password } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Reset token is required' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    try {
      const tokenResult = await pool.query(
        `SELECT id, player_id, used_at, expires_at FROM password_reset_tokens WHERE token = $1`,
        [token]
      );

      if (tokenResult.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
      }

      const row = tokenResult.rows[0];

      if (row.used_at) {
        return res.status(400).json({ error: 'This reset link has already been used. Please request a new one.' });
      }
      if (new Date(row.expires_at) < new Date()) {
        return res.status(400).json({ error: 'This reset link has expired. Please request a new one.' });
      }

      const password_hash = await bcrypt.hash(password, 10);

      await pool.query('UPDATE players SET password_hash = $1 WHERE id = $2', [password_hash, row.player_id]);

      // Consume this token and invalidate any other outstanding tokens for the player.
      await pool.query(
        `UPDATE password_reset_tokens SET used_at = NOW()
         WHERE player_id = $1 AND used_at IS NULL`,
        [row.player_id]
      );

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/auth/verify-reset-token?token=xxx
  // Lets the reset-password page validate a token before showing the form.
  router.get('/auth/verify-reset-token', async (req, res, next) => {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ valid: false, error: 'Token required' });
    }

    try {
      const result = await pool.query(
        `SELECT used_at, expires_at FROM password_reset_tokens WHERE token = $1`,
        [token]
      );

      if (result.rows.length === 0) {
        return res.json({ valid: false, error: 'invalid' });
      }
      const row = result.rows[0];
      if (row.used_at) {
        return res.json({ valid: false, error: 'used' });
      }
      if (new Date(row.expires_at) < new Date()) {
        return res.json({ valid: false, error: 'expired' });
      }
      res.json({ valid: true });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/auth/guest
  // Creates a guest player (no email/password) so they can play immediately.
  // onboarding_completed stays false — they're prompted to sign up after their
  // first throw lands. Guests can convert to full accounts later.
  router.post('/auth/guest', async (req, res, next) => {
    try {
      const guestUuid = crypto.randomUUID();

      const result = await pool.query(
        `INSERT INTO players (player_uuid, display_name, username, email, is_guest, guest_uuid)
         VALUES ($1, $2, $3, NULL, true, $1)
         RETURNING id, player_uuid, display_name, xp, created_at`,
        [guestUuid, 'Guest Player', 'guest_' + guestUuid.slice(0, 8)]
      );

      const player = result.rows[0];
      const token = createToken({ id: player.id, player_uuid: player.player_uuid });

      res.status(201).json({
        token,
        player: {
          id: player.id,
          display_name: player.display_name,
          is_guest: true,
          xp: player.xp,
          level: getLevelFromXp(player.xp),
          level_progress: getLevelProgress(player.xp),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/auth/guest-status
  // Returns whether the guest_uuid stored in localStorage is still valid.
  // Used to persist guest identity across sessions before conversion.
  router.get('/auth/guest-status', async (req, res, next) => {
    const guestUuid = req.headers['x-guest-uuid'];
    if (!guestUuid) return res.status(400).json({ valid: false, error: 'guest_uuid required' });

    try {
      const result = await pool.query(
        `SELECT id, player_uuid, display_name, xp, is_guest, onboarding_completed, experience_level
         FROM players WHERE guest_uuid = $1 LIMIT 1`,
        [guestUuid]
      );

      if (result.rows.length === 0) {
        return res.json({ valid: false });
      }

      const p = result.rows[0];
      return res.json({
        valid: true,
        player: {
          id: p.id,
          player_uuid: p.player_uuid,
          display_name: p.display_name,
          xp: p.xp,
          is_guest: p.is_guest,
          onboarding_completed: p.onboarding_completed,
          experience_level: p.experience_level,
          level: getLevelFromXp(p.xp),
          level_progress: getLevelProgress(p.xp),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
