const express = require('express');
const { requireAuth } = require('../middleware/auth');

const POLSIA_API_KEY = process.env.POLSIA_API_KEY;
const EMAIL_PROXY_URL = 'https://polsia.com/api/proxy/email/send';

async function sendDeletionNotification(email, displayName) {
  if (!POLSIA_API_KEY) return;
  try {
    await fetch(EMAIL_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${POLSIA_API_KEY}`,
      },
      body: JSON.stringify({
        to: email,
        subject: 'Your Disc Golf Go account deletion request',
        body: `Hi ${displayName || 'there'},\n\nWe received your request to delete your Disc Golf Go account.\n\nYour account and all associated data (scores, XP, achievements, battle history, GPS paths, and profile information) will be permanently deleted within 48 hours.\n\nThis action cannot be undone.\n\nIf you did not request this, please contact us at contact@discgolfgo.com immediately.\n\n— The Disc Golf Go Team`,
        html: `<p>Hi ${displayName || 'there'},</p><p>We received your request to delete your Disc Golf Go account.</p><p>Your account and all associated data (scores, XP, achievements, battle history, GPS paths, and profile information) will be <strong>permanently deleted within 48 hours</strong>.</p><p>This action cannot be undone.</p><p>If you did not request this, please contact us at <a href="mailto:contact@discgolfgo.com">contact@discgolfgo.com</a> immediately.</p><p>— The Disc Golf Go Team</p>`,
      }),
    });
  } catch (_) {
    // fire-and-forget — don't fail deletion if email fails
  }
}

async function sendDeletionRequestNotification(email) {
  if (!POLSIA_API_KEY) return;
  try {
    await fetch(EMAIL_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${POLSIA_API_KEY}`,
      },
      body: JSON.stringify({
        to: email,
        subject: 'Disc Golf Go — Account deletion request received',
        body: `We received a request to delete the Disc Golf Go account associated with this email address.\n\nIf an account exists, all associated data will be permanently removed within 48 hours.\n\nIf you did not make this request, you can safely ignore this email.\n\n— The Disc Golf Go Team`,
        html: `<p>We received a request to delete the Disc Golf Go account associated with this email address.</p><p>If an account exists, all associated data will be <strong>permanently removed within 48 hours</strong>.</p><p>If you did not make this request, you can safely ignore this email.</p><p>— The Disc Golf Go Team</p>`,
      }),
    });
  } catch (_) {
    // fire-and-forget
  }
}

module.exports = ({ pool }) => {
  const router = express.Router();

  // DELETE /api/delete-account — authenticated: delete all user data immediately
  router.delete('/delete-account', requireAuth(pool), async (req, res) => {
    const playerId = req.player.id;

    try {
      // Fetch player info for confirmation email before deleting
      const playerResult = await pool.query(
        'SELECT email, display_name FROM players WHERE id = $1',
        [playerId]
      );
      const player = playerResult.rows[0];

      // Delete all user-linked data in dependency order (FK constraints)
      await pool.query('DELETE FROM round_tracking WHERE round_id IN (SELECT id FROM rounds WHERE player_id = $1)', [playerId]);
      await pool.query('DELETE FROM round_analytics WHERE round_id IN (SELECT id FROM rounds WHERE player_id = $1)', [playerId]);
      await pool.query('DELETE FROM rounds WHERE player_id = $1', [playerId]);
      await pool.query('DELETE FROM checkins WHERE player_id = $1', [playerId]);
      await pool.query('DELETE FROM xp_transactions WHERE player_id = $1', [playerId]);
      await pool.query('DELETE FROM gold_transactions WHERE player_id = $1', [playerId]);
      await pool.query('DELETE FROM player_badges WHERE player_id = $1', [playerId]);
      await pool.query('DELETE FROM player_challenges WHERE player_id = $1', [playerId]);
      await pool.query('DELETE FROM player_inventory WHERE player_id = $1', [playerId]);
      await pool.query('DELETE FROM active_boosts WHERE player_id = $1', [playerId]);
      await pool.query('DELETE FROM battles WHERE challenger_id = $1 OR opponent_id = $1', [playerId]);
      await pool.query('DELETE FROM players WHERE id = $1', [playerId]);

      // Send confirmation email (non-blocking)
      if (player && player.email) {
        sendDeletionNotification(player.email, player.display_name);
      }

      res.json({ success: true, message: 'Account deleted' });
    } catch (err) {
      console.error('Delete account error:', err.message);
      res.status(500).json({ error: 'Failed to delete account. Please try again.' });
    }
  });

  // POST /api/delete-account/request — unauthenticated: queue email-based deletion request
  router.post('/delete-account/request', async (req, res) => {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email address is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    try {
      // Check if account exists (but always return generic message for privacy)
      const result = await pool.query(
        'SELECT id FROM players WHERE email = $1',
        [normalizedEmail]
      );

      if (result.rows.length > 0) {
        // Account exists — log the request and queue deletion
        await pool.query(
          `INSERT INTO deletion_requests (email, requested_at)
           VALUES ($1, NOW())
           ON CONFLICT (email) DO UPDATE SET requested_at = NOW()`,
          [normalizedEmail]
        ).catch(() => {
          // If table doesn't exist yet, silently continue
        });

        sendDeletionRequestNotification(normalizedEmail);
      }

      // Always return success (privacy — don't reveal if account exists)
      res.json({ success: true });
    } catch (err) {
      console.error('Delete account request error:', err.message);
      res.status(500).json({ error: 'Request failed. Please try again.' });
    }
  });

  return router;
};
