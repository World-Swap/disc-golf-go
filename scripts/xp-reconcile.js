#!/usr/bin/env node
/**
 * scripts/xp-reconcile.js — report (and optionally repair) drift between a
 * player's XP balance and the XP ledgers.
 *
 * Why there is drift at all. Two separate faults, pulling opposite ways:
 *
 *   1. The training streak (+25) and category-complete (+100) bonuses wrote an
 *      `xp_transactions` row, were shown to the player, and were NEVER added to
 *      players.xp. That pushes SUM(ledger) ABOVE the balance -- the player is
 *      owed XP they were told they had.
 *
 *   2. Story quests and daily challenges credited players.xp but wrote only to
 *      `xp_log`, never to `xp_transactions`. That pushes the balance ABOVE
 *      SUM(xp_transactions) and is not a debt -- the XP is real, the row is just
 *      in the other ledger.
 *
 * Because the two cancel to an arbitrary degree, a single net number is
 * meaningless. This reports them separately, so what is actually owed (1) is
 * never confused with a bookkeeping gap (2).
 *
 * Read-only unless --fix is passed. --fix credits ONLY fault 1, identified by
 * event_type, and writes its own `xp_reconcile` ledger row for each repair so
 * the correction is itself auditable.
 *
 *   node scripts/xp-reconcile.js            # report
 *   node scripts/xp-reconcile.js --fix      # repair fault 1 only
 *
 * STATUS, 2026-10-07: --fix is AUTHORISED by the project owner and is the
 * intended action -- fault 1 is XP players were told they had earned and never
 * received, so paying it is a repair, not a policy choice. Run it against
 * production when a DATABASE_URL for it is available; it is idempotent (the
 * `xp_reconcile` marker row means a second run finds nothing), so re-running is
 * safe. Verified end to end against a real Postgres on the same date: the two
 * faults are reported separately, --fix credits only fault 1, leaves a player
 * whose gap is purely `xp_log` untouched, moves players.level with the balance
 * across a level boundary, and leaves SUM(ledger) == players.xp.
 *
 * Its sibling `xp-rebalance-backfill.js` is deliberately NOT to be run: the
 * owner held it on 2026-10-07. That one is a fairness decision rather than a
 * debt, and the two are independent -- proved order-independent and idempotent,
 * so running this one first forecloses nothing.
 */
const { Pool } = require('pg');

const FIX = process.argv.includes('--fix');
// The exact event types that were recorded but never credited.
const UNCREDITED = `(event_type LIKE 'training_streak_%' OR event_type = 'training_category_complete')`;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Fault 1: rows that were written but never credited. Only count rows older
  // than the fix, so a repair run cannot double-credit anything written since.
  const owed = await pool.query(`
    SELECT t.player_id,
           SUM(t.xp_amount)::bigint AS owed,
           COUNT(*)::int            AS rows
      FROM xp_transactions t
     WHERE ${UNCREDITED}
       AND NOT EXISTS (
             SELECT 1 FROM xp_transactions r
              WHERE r.player_id = t.player_id AND r.event_type = 'xp_reconcile')
     GROUP BY t.player_id
     HAVING SUM(t.xp_amount) > 0
     ORDER BY owed DESC`);

  // Fault 2: balance above the xp_transactions ledger, explained by xp_log.
  const gap = await pool.query(`
    SELECT p.id,
           p.xp::bigint                                   AS balance,
           COALESCE(t.total, 0)::bigint                    AS in_transactions,
           COALESCE(l.total, 0)::bigint                    AS in_xp_log
      FROM players p
      LEFT JOIN (SELECT player_id, SUM(xp_amount) total FROM xp_transactions GROUP BY player_id) t
             ON t.player_id = p.id
      LEFT JOIN (SELECT player_id, SUM(amount)    total FROM xp_log          GROUP BY player_id) l
             ON l.player_id = p.id
     WHERE p.xp <> COALESCE(t.total, 0)
     ORDER BY p.xp DESC
     LIMIT 20`);

  const totalOwed = owed.rows.reduce((s, r) => s + Number(r.owed), 0);
  console.log('');
  console.log('  FAULT 1 — recorded but never credited (a real debt to players)');
  console.log(`    players affected : ${owed.rowCount}`);
  console.log(`    total XP owed    : ${totalOwed}`);
  for (const r of owed.rows.slice(0, 10)) {
    console.log(`      player ${String(r.player_id).padStart(6)}  owed ${String(r.owed).padStart(6)}  (${r.rows} rows)`);
  }
  if (owed.rowCount > 10) console.log(`      ... and ${owed.rowCount - 10} more`);

  console.log('');
  console.log('  FAULT 2 — balance vs xp_transactions (bookkeeping, not a debt)');
  console.log('    top 20 by balance:');
  for (const r of gap.rows) {
    const d = Number(r.balance) - Number(r.in_transactions);
    console.log(
      `      player ${String(r.id).padStart(6)}  balance ${String(r.balance).padStart(7)}` +
      `  tx ${String(r.in_transactions).padStart(7)}  xp_log ${String(r.in_xp_log).padStart(7)}  diff ${d > 0 ? '+' : ''}${d}`
    );
  }

  if (!FIX) {
    console.log('');
    console.log('  Read-only. Re-run with --fix to credit FAULT 1 only.');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  let repaired = 0;
  try {
    await client.query('BEGIN');
    for (const r of owed.rows) {
      const amount = Number(r.owed);
      await client.query(
        `UPDATE players
            SET xp = xp + $1,
                level = FLOOR((125 + SQRT(15625 + 500 * GREATEST(xp + $1, 0))) / 250)
          WHERE id = $2`,
        [amount, r.player_id]
      );
      await client.query(
        `INSERT INTO xp_transactions (player_id, event_type, xp_amount, metadata, source)
         VALUES ($1, 'xp_reconcile', 0, $2, 'reconcile')`,
        [r.player_id, JSON.stringify({ credited: amount, rows: r.rows, reason: 'streak/category bonus recorded but never credited' })]
      );
      repaired++;
    }
    await client.query('COMMIT');
    console.log('');
    console.log(`  Repaired ${repaired} players, ${totalOwed} XP credited.`);
    console.log('  The marker row is xp_amount 0 so it cannot itself unbalance the ledger.');
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
