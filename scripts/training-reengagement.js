// scripts/training-reengagement.js
// Re-engagement nudges for inactive players.
// - Day 3: "Your training streak needs you" (handled by reminder script)
// - Day 7: one lesson from the curated library, by name
// - Post-download (handled separately via app event, not cron)
// Runs: daily at 12pm.
'use strict';

try { require('dotenv').config({ path: require('path').join(__dirname, '../.env') }); } catch { /* dotenv optional — Render injects env directly */ }
const { Pool } = require('pg');

// --dry-run reports who WOULD be notified and writes nothing.
const DRY_RUN = process.argv.includes('--dry-run');

const { dbSsl } = require('./lib/db-ssl');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: dbSsl(),
});

async function run() {
  const client = await pool.connect();
  try {
    // Pick a lesson to put in the day-7 message.
    //
    // Three things were wrong here. content_type = 'tip_card' matches nothing
    // (all 134 curated lessons are 'video_embed'), so this always fell through
    // to the hardcoded pair below -- meaning every lapsed player was going to
    // be sent "Master your form / Practice your form daily for better results",
    // a line that teaches nothing and that no one wrote on purpose for them.
    // Filler is worse than silence, so there is no fallback now: if the library
    // somehow has nothing, the job says so and sends nothing.
    //
    // generated_from_video IS NULL keeps an unwatched channel upload from being
    // mailed out as a coached tip.
    const tipRows = await client.query(`
      SELECT l.id, l.title, l.description
      FROM training_lessons l
      WHERE l.is_active = true
        AND l.generated_from_video IS NULL
        AND l.description IS NOT NULL AND l.description <> ''
      ORDER BY RANDOM()
      LIMIT 1
    `);

    if (!tipRows.rows.length) {
      console.log('[reengagement] No curated lesson available — skipping');
      return;
    }
    const tip = tipRows.rows[0];

    // Players who:
    // 1. Push is enabled (or notification preferences exist with push)
    // 2. No training completion in exactly 7 days
    // 3. No reengagement sent in last 5 days
    const players = await client.query(`
      SELECT s.player_id, p.username,
             COALESCE(
               (SELECT MAX(tc.completed_at) FROM training_completions tc WHERE tc.player_id = p.id),
               p.created_at
             ) AS last_completion_at
      FROM player_training_notification_settings s
      JOIN players p ON p.id = s.player_id
      WHERE s.push_enabled = true
        -- players.deleted_at does not exist: account deletion is a HARD delete
        -- (delete-account.repo.ts runs DELETE FROM players), and deletion_requests
        -- only logs an email. The clause that stood here referenced that phantom
        -- column, so every one of these jobs would still have failed after the
        -- column fix above. JOIN players already guarantees a live account.
        AND (
          (SELECT MAX(tc.completed_at) FROM training_completions tc WHERE tc.player_id = p.id) IS NULL
          OR (SELECT MAX(tc.completed_at) FROM training_completions tc WHERE tc.player_id = p.id) < NOW() - INTERVAL '7 days'
        )
        AND (
          (SELECT COUNT(*) FROM training_notifications
           WHERE player_id = s.player_id AND type = 'reengagement'
           AND created_at > NOW() - INTERVAL '5 days') = 0
        )
    `);

    const sent = [];
    for (const row of players.rows) {
      const message = `${tip.title} — ${tip.description}`;

      if (DRY_RUN) { sent.push(row.player_id); continue; }

      // The column list named five columns and supplied four values, so this
      // INSERT was rejected outright ("INSERT has more target columns than
      // expressions") independently of the tc.created_at fault above. lesson_id
      // is what makes the notification open the lesson it is about.
      await client.query(`
        INSERT INTO training_notifications (player_id, type, title, message, lesson_id)
        VALUES ($1, 'reengagement', 'A lesson to come back to', $2, $3)
      `, [row.player_id, message, tip.id]);

      sent.push(row.player_id);
    }

    console.log(
      DRY_RUN
        ? `[reengagement] DRY RUN — nothing written. Would send ${sent.length} day-7 notifications`
        : `[reengagement] Sent ${sent.length} day-7 re-engagement notifications`
    );
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