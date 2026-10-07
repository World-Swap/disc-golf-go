#!/usr/bin/env node
/**
 * scripts/xp-rebalance-backfill.js — bring XP already earned from training up to
 * the 2026-10-07 rates.
 *
 * The rebalance multiplied lesson XP by 10 (10/15/20 -> 100/150/200), the
 * category-complete bonus by 5 (100 -> 500) and the streak bonus by 2 (25 -> 50).
 * Without this, a player who finished fifty lessons last month sits on a tenth
 * of the XP of someone who finishes the same fifty tomorrow, on a shared
 * leaderboard that is about to decide who gets a coupon. The old XP is not
 * wrong, it is just denominated in the old currency; this redenominates it.
 *
 * Only training XP is touched. Check-in and Throw Lab rates were cut or left
 * alone, and nobody is clawed back -- the rebalance makes the library worth
 * more, it does not make past play worth less.
 *
 * Safe to run twice: each repaired player gets a marker row, and players holding
 * one are skipped.
 *
 *   node scripts/xp-rebalance-backfill.js          # report
 *   node scripts/xp-rebalance-backfill.js --fix    # apply
 *
 * STATUS, 2026-10-07: HELD by the project owner. Do NOT run --fix, and do not
 * assume it goes along with `xp-reconcile.js --fix`, which WAS authorised the
 * same day -- the two were decided separately and on different grounds.
 * Reconcile pays a debt: XP players were told they had earned. This grants XP
 * nobody is owed, to stop early users sitting on a tenth of what a newcomer
 * earns for the same lessons. That is a fairness call about a leaderboard that
 * is about to gate coupons, and it is the owner's to make, not a repair to
 * apply quietly. Ask before running it.
 *
 * Nothing is lost by waiting. Verified against a real Postgres on 2026-10-07:
 * this script and the reconcile are order-independent (both sequences land on
 * the identical balance, matching a hand-computed target) and each is
 * idempotent, so running reconcile first does not change what this would do
 * later, and running this twice cannot double-credit.
 */
const { Pool } = require('pg');

const FIX = process.argv.includes('--fix');

// event_type -> how much MORE to credit, as a multiple of what was recorded.
// A lesson recorded at 15 is now worth 150, so it is owed 15 * 9.
const TOP_UP = [
  { match: `event_type = 'training_completion'`,       factor: 9, label: 'lessons        x10' },
  { match: `event_type = 'training_category_complete'`, factor: 4, label: 'category bonus x5' },
  { match: `event_type LIKE 'training_streak_%'`,       factor: 1, label: 'streak bonus   x2' },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const parts = TOP_UP.map((t) => `SUM(CASE WHEN ${t.match} THEN xp_amount * ${t.factor} ELSE 0 END)`);
  const owed = await pool.query(`
    SELECT player_id,
           ${parts.map((p, i) => `${p}::bigint AS part_${i}`).join(',\n           ')},
           (${parts.join(' + ')})::bigint AS owed
      FROM xp_transactions
     WHERE (${TOP_UP.map((t) => t.match).join(' OR ')})
       AND NOT EXISTS (
             SELECT 1 FROM xp_transactions m
              WHERE m.player_id = xp_transactions.player_id
                AND m.event_type = 'xp_rebalance_backfill')
     GROUP BY player_id
    HAVING (${parts.join(' + ')}) > 0
     ORDER BY owed DESC`);

  const total = owed.rows.reduce((s, r) => s + Number(r.owed), 0);
  console.log('');
  console.log('  TRAINING XP TO REDENOMINATE');
  TOP_UP.forEach((t, i) => {
    const sum = owed.rows.reduce((s, r) => s + Number(r[`part_${i}`]), 0);
    console.log(`    ${t.label.padEnd(20)} ${String(sum).padStart(10)} XP`);
  });
  console.log(`    ${'players affected'.padEnd(20)} ${String(owed.rowCount).padStart(10)}`);
  console.log(`    ${'TOTAL'.padEnd(20)} ${String(total).padStart(10)} XP`);
  for (const r of owed.rows.slice(0, 10)) {
    console.log(`      player ${String(r.player_id).padStart(6)}  +${r.owed}`);
  }
  if (owed.rowCount > 10) console.log(`      ... and ${owed.rowCount - 10} more`);

  if (!FIX) {
    console.log('');
    console.log('  Read-only. Re-run with --fix to apply.');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of owed.rows) {
      const amount = Number(r.owed);
      // Same single-statement level update applyXp uses, so level cannot drift.
      await client.query(
        `UPDATE players
            SET xp = xp + $1,
                level = FLOOR((125 + SQRT(15625 + 500 * GREATEST(xp + $1, 0))) / 250)
          WHERE id = $2`,
        [amount, r.player_id]
      );
      await client.query(
        `INSERT INTO xp_transactions (player_id, event_type, xp_amount, metadata, source)
         VALUES ($1, 'xp_rebalance_backfill', $2, $3, 'rebalance')`,
        [r.player_id, amount, JSON.stringify({ reason: 'training XP redenominated to the 2026-10-07 rates' })]
      );
    }
    await client.query('COMMIT');
    console.log('');
    console.log(`  Credited ${total} XP across ${owed.rowCount} players.`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('  FAILED, rolled back:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
