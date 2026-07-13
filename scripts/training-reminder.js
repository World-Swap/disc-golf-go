// scripts/training-reminder.js
// Training streak reminder — alerts players who haven't trained in 3+ days.
// Runs: daily at 10am.
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
    // Find players who:
    // 1. Have reminders enabled
    // 2. Haven't completed a training lesson in 3+ days
    // 3. Have a streak > 0 (they care about their streak)
    const players = await client.query(`
      SELECT s.player_id, p.username,
             COALESCE(p.training_streak_days, 0) AS streak_days,
             COALESCE(
               (SELECT MAX(tc.created_at) FROM training_completions tc WHERE tc.player_id = p.id),
               p.created_at
             ) AS last_completion_at
      FROM player_training_notification_settings s
      JOIN players p ON p.id = s.player_id
      WHERE s.reminders_enabled = true
        AND (p.deleted_at IS NULL OR p.deleted_at > NOW())
        AND COALESCE(p.training_streak_days, 0) > 0
        AND (
          (SELECT MAX(tc.created_at) FROM training_completions tc WHERE tc.player_id = p.id) IS NULL
          OR (SELECT MAX(tc.created_at) FROM training_completions tc WHERE tc.player_id = p.id) < NOW() - INTERVAL '3 days'
        )
        -- Don't spam: only send if no training_reminder sent in last 2 days
        AND (
          (SELECT COUNT(*) FROM training_notifications
           WHERE player_id = s.player_id AND type = 'training_reminder'
           AND created_at > NOW() - INTERVAL '2 days') = 0
        )
    `);

    const sent = [];
    for (const row of players.rows) {
      let daysSince = 3;
      try {
        const lastComp = await client.query(
          'SELECT MAX(created_at) FROM training_completions WHERE player_id = $1',
          [row.player_id]
        );
        if (lastComp.rows[0].max) {
          daysSince = Math.floor((Date.now() - new Date(lastComp.rows[0].max)) / 86400000);
        }
      } catch (_) {}

      const message = row.streak_days >= 3
        ? `Your ${row.streak_days}-day training streak is waiting! Come back and keep it alive.`
        : `You haven't trained in ${daysSince} days — your progress is calling you back.`;

      await client.query(`
        INSERT INTO training_notifications (player_id, type, title, message)
        VALUES ($1, 'training_reminder', 'Your training streak needs you', $2)
      `, [row.player_id, message]);

      sent.push(row.player_id);
    }

    console.log('[training-reminder] Notified', sent.length, 'players with reminder notifications');
    console.log('[training-reminder] Player IDs:', sent.slice(0, 20).join(', ') + (sent.length > 20 ? '...' : ''));
  } catch (err) {
    console.error('[training-reminder] Error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().then(() => { process.exit(0); }).catch(err => { console.error(err); process.exit(1); });