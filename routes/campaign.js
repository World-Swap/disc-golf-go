// routes/campaign.js — bulk internal operations (referral email campaigns, etc).
// Does NOT own: any user-facing feature.

const express = require('express');
const crypto = require('crypto');
const { appendUtm } = require('../lib/utm');

const EMAIL_API = 'https://polsia.com/api/proxy/email';
const FROM_EMAIL = 'disc-golf-go@polsia.app';
const REFERRAL_EMAIL_UTM = { source: 'referral_email', medium: 'email', campaign: 'referral_program' };

// Generate referral code: 8 chars, uppercase alphanumeric, URL-safe
function generateCode() {
  return crypto.randomBytes(5).toString('base64')
    .replace(/\//g, 'X')
    .toUpperCase()
    .slice(0, 8);
}

function buildReferralEmail(player, refUrl) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #2d7d46 0%, #1a5230 100%); padding: 32px 24px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 8px;">🎯</div>
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">Disc Golf Go</h1>
      <p style="color: #a8d5b5; margin: 8px 0 0; font-size: 14px;">Your referral code is ready</p>
    </div>
    <div style="padding: 32px 24px;">
      <p style="font-size: 16px; color: #333; margin: 0 0 8px;">Hey ${player.display_name},</p>
      <p style="font-size: 16px; color: #333; margin: 0 0 24px;">Your personal referral code is ready. Share it with your disc golf crew — when they sign up and play a 9+ hole round, you both earn rewards.</p>
      <div style="background: #f8faf8; border: 2px dashed #2d7d46; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
        <p style="color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">Your Referral Code</p>
        <div style="font-size: 32px; font-weight: 800; color: #2d7d46; letter-spacing: 4px; font-family: 'Courier New', Courier, monospace;">${player.code}</div>
      </div>
      <a href="${refUrl}" style="display: inline-block; background: #2d7d46; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; text-align: center; width: 100%; box-sizing: border-box;">Share Your Link & Earn</a>
      <p style="font-size: 14px; color: #888; margin: 20px 0 0; text-align: center;">Referral link: <a href="${refUrl}" style="color: #2d7d46;">${refUrl}</a></p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
      <h3 style="color: #333; font-size: 14px; margin: 0 0 12px;">How it works</h3>
      <p style="font-size: 14px; color: #555; margin: 0 0 8px;">🎯 Friend signs up with your code</p>
      <p style="font-size: 14px; color: #555; margin: 0 0 8px;">🎯 They play a 9+ hole round</p>
      <p style="font-size: 14px; color: #555; margin: 0;">🎯 You both earn 200 gold</p>
    </div>
    <div style="background: #fafafa; padding: 16px 24px; text-align: center;">
      <p style="font-size: 12px; color: #aaa; margin: 0;">Disc Golf Go · discgolfgo.app · You're receiving this because you have an account</p>
    </div>
  </div>
</body></html>`;

  const text = `Hey ${player.display_name},

Your personal referral code is ready: ${player.code}

Share it with your disc golf crew. When they sign up and play a 9+ hole round, you both earn 200 gold.

Share your link: ${refUrl}

How it works:
1. Friend signs up with your code
2. They play a 9+ hole round
3. You both earn 200 gold

Disc Golf Go · discgolfgo.app`;

  return { html, text };
}

module.exports = ({ pool }) => {
  const router = express.Router();

  // POST /api/internal/referral-campaign
  // Generates referral codes for all players who don't have one, then sends
  // each a personalized referral email. Internal use only — secret in body.
  router.post('/internal/referral-campaign', async (req, res) => {
    // Simple secret in body to prevent accidental triggers
    if (req.body.secret !== 'DGGO-CAMPAIGN-2026') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const baseUrl = process.env.APP_BASE_URL || 'https://disc-golf-go.polsia.app';

    try {
      // Get all players with emails
      const playersResult = await pool.query(
        `SELECT id, display_name, email FROM players WHERE email IS NOT NULL ORDER BY id`
      );

      const results = [];

      for (const row of playersResult.rows) {
        // Get or generate referral code
        const existing = await pool.query(
          'SELECT code FROM referral_codes WHERE player_id = $1',
          [row.id]
        );

        let code;
        if (existing.rows.length > 0) {
          code = existing.rows[0].code;
        } else {
          // Generate unique code
          let attempts = 0;
          while (attempts < 10) {
            code = generateCode();
            const collision = await pool.query(
              'SELECT id FROM referral_codes WHERE code = $1', [code]
            );
            if (collision.rows.length === 0) break;
            attempts++;
          }
          await pool.query(
            'INSERT INTO referral_codes (player_id, code) VALUES ($1, $2)',
            [row.id, code]
          );
        }

        const refUrl = appendUtm(`${baseUrl}/register?ref=${code}`, REFERRAL_EMAIL_UTM);
        const { html, text } = buildReferralEmail({ display_name: row.display_name, code }, refUrl);

        const emailRes = await fetch(`${EMAIL_API}/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.POLSIA_API_KEY}`,
          },
          body: JSON.stringify({
            to: row.email,
            subject: 'Your referral code is ready 🎯',
            body: text,
            html,
          }),
        });

        const emailData = await emailRes.json();
        const ok = emailRes.status >= 200 && emailRes.status < 300;
        results.push({ player_id: row.id, email: row.email, sent: ok, status: emailRes.status });
      }

      const sent = results.filter(r => r.sent).length;
      const failed = results.length - sent;
      res.json({ total: results.length, sent, failed, results });
    } catch (err) {
      console.error('[campaign] referral-campaign error:', err.message);
      res.status(500).json({ error: 'Campaign failed: ' + err.message });
    }
  });

  return router;
};