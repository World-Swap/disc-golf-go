// scripts/training-daily-tip.js
// Daily training tip cron job — sends one tip card to each opted-in player.
// Runs: daily at 8am. Records each tip in training_notifications table.
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

async function run() {
  const client = await pool.connect();
  try {
    // Pick one random tip_card lesson (or every_2_days / weekly based on last tip date)
    // For simplicity: pick one random tip card not yet sent today to players who want it
    const tipRows = await client.query(`
      SELECT l.id, l.title, l.description, l.slug, c.slug AS category_slug
      FROM training_lessons l
      JOIN training_categories c ON c.id = l.category_id
      WHERE l.content_type = 'tip_card'
        AND l.is_active = true
      ORDER BY RANDOM()
      LIMIT 1
    `);

    if (!tipRows.rows.length) {
      console.log('[daily-tip] No tip cards found — skipping');
      return;
    }

    const tip = tipRows.rows[0];

    // Find players with tips_enabled = true
    // Filter by frequency: only send to players whose last tip was > frequency days ago
    const players = await client.query(`
      SELECT s.player_id, s.tips_frequency,
             COALESCE(
               (SELECT MAX(created_at) FROM training_notifications
                WHERE player_id = s.player_id AND type = 'daily_tip'),
               '1970-01-01'::timestamptz
             ) AS last_tip_at
      FROM player_training_notification_settings s
      JOIN players p ON p.id = s.player_id
      WHERE s.tips_enabled = true
        AND (p.deleted_at IS NULL OR p.deleted_at > NOW())
    `);

    const now = new Date();
    const sent = [];
    const skipped = [];

    for (const row of players.rows) {
      let daysSince = (now - new Date(row.last_tip_at)) / 86400000;
      const freq = row.tips_frequency || 'daily';
      const minDays = freq === 'daily' ? 0.8 : freq === 'every_2_days' ? 1.8 : 6;

      if (daysSince < minDays) {
        skipped.push(row.player_id);
        continue;
      }

      // Create notification record
      await client.query(`
        INSERT INTO training_notifications (player_id, type, title, message, lesson_id)
        VALUES ($1, 'daily_tip', $2, $3, $4)
      `, [row.player_id, 'Daily Training Tip', tip.description, tip.id]);

      sent.push(row.player_id);
    }

    console.log('[daily-tip] Tip:', tip.title, '| Sent to:', sent.length, '| Skipped (too recent):', skipped.length);
    console.log('[daily-tip] Player IDs:', sent.slice(0, 20).join(', ') + (sent.length > 20 ? '...' : ''));
  } catch (err) {
    console.error('[daily-tip] Error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().then(() => { process.exit(0); }).catch(err => { console.error(err); process.exit(1); });