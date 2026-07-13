// scripts/training-reengagement.js
// Re-engagement nudges for inactive players.
// - Day 3: "Your training streak needs you" (handled by reminder script)
// - Day 7: "We miss you! Here's a training tip: [tip text]"
// - Post-download (handled separately via app event, not cron)
// Runs: daily at 12pm.
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
    // Pick a random tip card to embed in the day-7 re-engagement message
    const tipRows = await client.query(`
      SELECT l.id, l.title, l.description
      FROM training_lessons l
      WHERE l.content_type = 'tip_card'
        AND l.is_active = true
      ORDER BY RANDOM()
      LIMIT 1
    `);
    const tip = tipRows.rows[0] || { title: 'Master your form', description: 'Practice your form daily for better results.' };

    // Players who:
    // 1. Push is enabled (or notification preferences exist with push)
    // 2. No training completion in exactly 7 days
    // 3. No reengagement sent in last 5 days
    const players = await client.query(`
      SELECT s.player_id, p.username,
             COALESCE(
               (SELECT MAX(tc.created_at) FROM training_completions tc WHERE tc.player_id = p.id),
               p.created_at
             ) AS last_completion_at
      FROM player_training_notification_settings s
      JOIN players p ON p.id = s.player_id
      WHERE s.push_enabled = true
        AND (p.deleted_at IS NULL OR p.deleted_at > NOW())
        AND (
          (SELECT MAX(tc.created_at) FROM training_completions tc WHERE tc.player_id = p.id) IS NULL
          OR (SELECT MAX(tc.created_at) FROM training_completions tc WHERE tc.player_id = p.id) < NOW() - INTERVAL '7 days'
        )
        AND (
          (SELECT COUNT(*) FROM training_notifications
           WHERE player_id = s.player_id AND type = 'reengagement'
           AND created_at > NOW() - INTERVAL '5 days') = 0
        )
    `);

    const sent = [];
    for (const row of players.rows) {
      const message = `We miss you! Here's a training tip: ${tip.description}`;

      await client.query(`
        INSERT INTO training_notifications (player_id, type, title, message, lesson_id)
        VALUES ($1, 'reengagement', 'We miss you!', $2)
      `, [row.player_id, message]);

      sent.push(row.player_id);
    }

    console.log('[reengagement] Sent', sent.length, 'day-7 re-engagement notifications');
    console.log('[reengagement] Player IDs:', sent.slice(0, 20).join(', ') + (sent.length > 20 ? '...' : ''));
  } catch (err) {
    console.error('[reengagement] Error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().then(() => { process.exit(0); }).catch(err => { console.error(err); process.exit(1); });