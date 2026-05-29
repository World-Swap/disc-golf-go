// routes/auth.js — owns signup, login, password reset.
// Does NOT own: player profile, XP, sessions beyond JWT creation.

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { createToken } = require('../middleware/auth');
const { rateLimit, sanitizeFields } = require('../middleware/security');

const XP_PER_LEVEL = 500;
function getLevel(xp) { return Math.floor(xp / XP_PER_LEVEL) + 1; }
function getLevelProgress(xp) {
  const lvl = getLevel(xp);
  const base = (lvl - 1) * XP_PER_LEVEL;
  const progress = xp - base;
  return { progress, needed: XP_PER_LEVEL, percent: Math.round((progress / XP_PER_LEVEL) * 100) };
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Cryptographically secure reset token (32 bytes = 64 hex chars)
function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Send password reset email via Polsia email proxy
async function sendResetEmail(toEmail, resetToken) {
  const baseUrl = process.env.APP_URL || 'https://disc-golf-go.polsia.app';
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

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

  await fetch('https://polsia.com/api/proxy/email/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.POLSIA_API_KEY}`,
    },
    body: JSON.stringify({
      to: toEmail,
      subject: 'Reset your Disc Golf Go password',
      body: `Reset your Disc Golf Go password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
      html,
    }),
  });
}

module.exports = ({ pool }) => {
  const router = express.Router();

  // Rate limiters for auth endpoints — prevent brute force attacks
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, message: 'Too many attempts, please try again in 15 minutes' });
  const signupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: 'Too many signup attempts, please try again later' });
  const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: 'Too many password reset attempts, please try again later' });

  // POST /api/auth/signup
  router.post('/auth/signup', signupLimiter, sanitizeFields('display_name'), async (req, res) => {
    const { display_name, username, email, password } = req.body;

    // Validation
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

    try {
      // Check uniqueness
      const existing = await pool.query(
        'SELECT id FROM players WHERE email = $1 OR username = $2 LIMIT 1',
        [email.toLowerCase(), username.toLowerCase()]
      );
      if (existing.rows.length > 0) {
        // Which one conflicts?
        const emailCheck = await pool.query('SELECT id FROM players WHERE email = $1', [email.toLowerCase()]);
        if (emailCheck.rows.length > 0) {
          return res.status(409).json({ error: 'An account with that email already exists' });
        }
        return res.status(409).json({ error: 'That username is already taken' });
      }

      const password_hash = await bcrypt.hash(password, 10);
      const player_uuid = generateUUID();

      const result = await pool.query(
        `INSERT INTO players (player_uuid, display_name, username, email, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, player_uuid, display_name, username, email, xp, profile_photo_url, created_at`,
        [player_uuid, display_name.trim(), username.toLowerCase(), email.toLowerCase(), password_hash]
      );
      const player = result.rows[0];

      const token = createToken({ id: player.id, player_uuid: player.player_uuid });

      res.status(201).json({
        token,
        player: {
          id: player.id,
          display_name: player.display_name,
          username: player.username,
          email: player.email,
          profile_photo_url: player.profile_photo_url,
          xp: player.xp,
          level: getLevel(player.xp),
          level_progress: getLevelProgress(player.xp)
        }
      });
    } catch (err) {
      console.error('Signup error:', err.message);
      res.status(500).json({ error: 'Failed to create account' });
    }
  });

  // POST /api/auth/login
  router.post('/auth/login', authLimiter, async (req, res) => {
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

      res.json({
        token,
        player: {
          id: player.id,
          display_name: player.display_name,
          username: player.username,
          email: player.email,
          profile_photo_url: player.profile_photo_url,
          xp: player.xp,
          level: getLevel(player.xp),
          level_progress: getLevelProgress(player.xp)
        }
      });
    } catch (err) {
      console.error('Login error:', err.message);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // POST /api/auth/forgot-password
  // Rate limit: max 3 tokens per email per hour to prevent abuse.
  // Always returns the same message — doesn't reveal whether email exists.
  router.post('/auth/forgot-password', resetLimiter, async (req, res) => {
    const { email } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email address required' });
    }

    const normalized = email.toLowerCase().trim();

    try {
      // Rate limit: count tokens created in the last hour for this email
      const rateCheck = await pool.query(
        `SELECT COUNT(*) AS cnt
         FROM password_reset_tokens prt
         JOIN players p ON p.id = prt.player_id
         WHERE p.email = $1
           AND prt.created_at > NOW() - INTERVAL '1 hour'`,
        [normalized]
      );
      if (parseInt(rateCheck.rows[0].cnt, 10) >= 3) {
        // Still return success — don't reveal rate-limit info that could assist enumeration
        return res.json({ success: true });
      }

      // Look up the player (don't reveal if found or not)
      const playerResult = await pool.query(
        'SELECT id FROM players WHERE email = $1',
        [normalized]
      );

      if (playerResult.rows.length > 0) {
        const playerId = playerResult.rows[0].id;
        const token = generateResetToken();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await pool.query(
          `INSERT INTO password_reset_tokens (player_id, token, expires_at)
           VALUES ($1, $2, $3)`,
          [playerId, token, expiresAt]
        );

        // Fire-and-forget — don't block the response on email delivery
        sendResetEmail(normalized, token).catch((err) => {
          console.error('Password reset email failed:', err.message);
        });
      }

      // Always the same response regardless of whether email exists
      res.json({ success: true });
    } catch (err) {
      console.error('Forgot password error:', err.message);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  // POST /api/auth/reset-password
  // Validates token, updates password, invalidates token and all prior tokens for that player.
  router.post('/auth/reset-password', resetLimiter, async (req, res) => {
    const { token, password } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Reset token is required' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    try {
      // Find valid, unused, non-expired token
      const tokenResult = await pool.query(
        `SELECT id, player_id, used_at, expires_at
         FROM password_reset_tokens
         WHERE token = $1`,
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

      // Update password
      await pool.query(
        'UPDATE players SET password_hash = $1 WHERE id = $2',
        [password_hash, row.player_id]
      );

      // Mark token used (single-use guarantee)
      await pool.query(
        'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
        [row.id]
      );

      // Invalidate all other unused tokens for this player (old sessions are handled by JWT expiry —
      // new JWTs issued from this point will carry the updated credential)
      await pool.query(
        `UPDATE password_reset_tokens SET used_at = NOW()
         WHERE player_id = $1 AND used_at IS NULL AND id != $2`,
        [row.player_id, row.id]
      );

      res.json({ success: true });
    } catch (err) {
      console.error('Reset password error:', err.message);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  // GET /api/auth/verify-reset-token?token=xxx
  // Lets the reset-password page validate a token before showing the form.
  router.get('/auth/verify-reset-token', async (req, res) => {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ valid: false, error: 'Token required' });
    }

    try {
      const result = await pool.query(
        `SELECT id, used_at, expires_at FROM password_reset_tokens WHERE token = $1`,
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
      console.error('Verify reset token error:', err.message);
      res.status(500).json({ valid: false, error: 'server_error' });
    }
  });

  return router;
};
