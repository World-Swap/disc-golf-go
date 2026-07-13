/**
 * daily-challenge-assign.js
 * Assigns today's daily challenge to all active players (runs at midnight UTC).
 * Players who already have today's challenge assigned are skipped.
 * Run via polsia.toml [[crons]] — does NOT need in-process scheduler guard.
 */

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('[daily-challenge] DATABASE_URL not set — exiting');
  process.exit(0);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  idleTimeoutMillis: 15000,
  connectionTimeoutMillis: 10000,
});

async function run() {
  const today = new Date().toISOString().split('T')[0];
  console.log('[daily-challenge] Starting daily assignment for', today);

  // Get all players who don't have today's challenge yet
  const players = await pool.query(`
    SELECT p.id, p.username
    FROM players p
    WHERE NOT EXISTS (
      SELECT 1 FROM player_daily_challenges pdc
      WHERE pdc.player_id = p.id AND pdc.challenge_date = $1
    )
    ORDER BY p.id
    LIMIT 500
  `, [today]);

  if (players.rows.length === 0) {
    console.log('[daily-challenge] All active players already assigned today.');
    await pool.end();
    return;
  }

  console.log(`[daily-challenge] Assigning to ${players.rows.length} players...`);

  // Shuffle the pool once so we don't always give the same challenge to everyone
  const challenges = await pool.query(
    `SELECT * FROM daily_challenge_pool WHERE is_active = TRUE ORDER BY RANDOM()`
  );

  if (!challenges.rows.length) {
    console.error('[daily-challenge] No active challenges in pool — aborting');
    await pool.end();
    return;
  }

  let assigned = 0;
  const client = await pool.connect();
  try {
    for (let i = 0; i < players.rows.length; i++) {
      const player = players.rows[i];
      const challenge = challenges.rows[i % challenges.rows.length]; // round-robin through challenges

      await client.query(`
        INSERT INTO player_daily_challenges
        (player_id, challenge_date, pool_id, title, description, challenge_type,
         target_value, xp_reward, gold_reward, training_slug)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (player_id, challenge_date) DO NOTHING
      `, [
        player.id, today, challenge.id, challenge.title, challenge.description,
        challenge.challenge_type, challenge.target_value, challenge.xp_reward,
        challenge.gold_reward, challenge.training_slug
      ]);
      assigned++;
    }
  } finally {
    client.release();
  }

  console.log(`[daily-challenge] Done. Assigned ${assigned} new challenges.`);
  await pool.end();
}

run().catch(err => {
  console.error('[daily-challenge] Fatal error:', err.message);
  process.exit(1);
});