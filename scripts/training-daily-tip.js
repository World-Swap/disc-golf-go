// scripts/training-daily-tip.js
// Daily training tip cron job — sends one lesson tip to each opted-in player.
// Runs: daily at 8am. Records each tip in training_notifications table.
'use strict';

try { require('dotenv').config({ path: require('path').join(__dirname, '../.env') }); } catch { /* dotenv optional — Render injects env directly */ }
const { Pool } = require('pg');

// --dry-run reports who WOULD be notified and writes nothing. The jobs below
// had been dead long enough that nobody knows the real audience any more, so
// the count has to be obtainable from production without sending anything.
const DRY_RUN = process.argv.includes('--dry-run');

const { dbSsl } = require('./lib/db-ssl');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: dbSsl(),
});

async function run() {
  const client = await pool.connect();
  try {
    // Pick one lesson to tip about.
    //
    // This used to require content_type = 'tip_card', which is a leftover from
    // the June-era library. Every one of the 134 curated lessons is
    // 'video_embed' now, so the filter matched NOTHING and this job logged
    // "No tip cards found — skipping" and exited 0 every morning. A filter that
    // silently selects nothing looks exactly like a job with no work to do.
    //
    // generated_from_video IS NULL is the other half: a generated row is a
    // channel upload nobody here has watched, so it must never be pushed to a
    // player as today's coached tip. Same rule as the seven recommendation
    // queries in training.repo.ts.
    const tipRows = await client.query(`
      SELECT l.id, l.title, l.description, l.slug, c.slug AS category_slug
      FROM training_lessons l
      JOIN training_categories c ON c.id = l.category_id
      WHERE l.is_active = true
        AND l.generated_from_video IS NULL
        AND l.description IS NOT NULL AND l.description <> ''
      ORDER BY RANDOM()
      LIMIT 1
    `);

    if (!tipRows.rows.length) {
      // The curated library is seeded, so this means something is wrong rather
      // than that there is nothing to say. Never substitute filler.
      console.log('[daily-tip] No curated lesson available — skipping');
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
        -- players.deleted_at does not exist: account deletion is a HARD delete
        -- (delete-account.repo.ts runs DELETE FROM players), and deletion_requests
        -- only logs an email. The clause that stood here referenced that phantom
        -- column, so every one of these jobs would still have failed after the
        -- column fix above. JOIN players already guarantees a live account.
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

      if (DRY_RUN) { sent.push(row.player_id); continue; }

      // Create notification record
      await client.query(`
        INSERT INTO training_notifications (player_id, type, title, message, lesson_id)
        VALUES ($1, 'daily_tip', $2, $3, $4)
      `, [row.player_id, tip.title, tip.description, tip.id]);

      sent.push(row.player_id);
    }

    console.log(
      (DRY_RUN ? '[daily-tip] DRY RUN — nothing written. Tip:' : '[daily-tip] Tip:'),
      tip.title, '|', (DRY_RUN ? 'Would send to:' : 'Sent to:'), sent.length,
      '| Skipped (too recent):', skipped.length
    );
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