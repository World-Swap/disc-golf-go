// scripts/training-reminder.js
// Training streak reminder — alerts players who haven't trained in 3+ days.
// Runs: daily at 10am.
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
    // Find players who:
    //
    // NOTE: these subqueries read training_completions.completed_at. They said
    // tc.created_at, a column that does not exist on that table, so this job
    // threw "column tc.created_at does not exist" on its FIRST query and exited
    // 1 every morning at 10:00 UTC. The only trace was one line in Render's
    // logs: "[scheduler] training-reminder exited with code 1".
    //
    // 1. Have reminders enabled
    // 2. Haven't completed a training lesson in 3+ days
    // 3. Have a streak > 0 (they care about their streak)
    const players = await client.query(`
      SELECT s.player_id, p.username,
             COALESCE(p.training_streak_days, 0) AS streak_days,
             COALESCE(
               (SELECT MAX(tc.completed_at) FROM training_completions tc WHERE tc.player_id = p.id),
               p.created_at
             ) AS last_completion_at
      FROM player_training_notification_settings s
      JOIN players p ON p.id = s.player_id
      WHERE s.reminders_enabled = true
        -- players.deleted_at does not exist: account deletion is a HARD delete
        -- (delete-account.repo.ts runs DELETE FROM players), and deletion_requests
        -- only logs an email. The clause that stood here referenced that phantom
        -- column, so every one of these jobs would still have failed after the
        -- column fix above. JOIN players already guarantees a live account.
        AND COALESCE(p.training_streak_days, 0) > 0
        AND (
          (SELECT MAX(tc.completed_at) FROM training_completions tc WHERE tc.player_id = p.id) IS NULL
          OR (SELECT MAX(tc.completed_at) FROM training_completions tc WHERE tc.player_id = p.id) < NOW() - INTERVAL '3 days'
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
      // The same wrong column lived here too, behind `catch (_) {}` -- so even
      // with the query above fixed, this would have failed silently and left
      // every message reading "it's been 3 days". An empty catch around a query
      // is how a typo survives: the failure is indistinguishable from no data.
      let daysSince = 3;
      const lastComp = await client.query(
        'SELECT MAX(completed_at) AS max FROM training_completions WHERE player_id = $1',
        [row.player_id]
      );
      if (lastComp.rows[0].max) {
        daysSince = Math.floor((Date.now() - new Date(lastComp.rows[0].max)) / 86400000);
      }

      const message = row.streak_days >= 3
        ? `Your ${row.streak_days}-day streak is still alive. One lesson keeps it going.`
        : `It has been ${daysSince} days since your last lesson.`;

      if (DRY_RUN) { sent.push(row.player_id); continue; }

      await client.query(`
        INSERT INTO training_notifications (player_id, type, title, message)
        VALUES ($1, 'training_reminder', 'Keep your streak going', $2)
      `, [row.player_id, message]);

      sent.push(row.player_id);
    }

    console.log(
      DRY_RUN
        ? `[training-reminder] DRY RUN — nothing written. Would notify ${sent.length} players`
        : `[training-reminder] Notified ${sent.length} players with reminder notifications`
    );
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