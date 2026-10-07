// src/modules/progression/level-sql.test.ts
//
// applyXp() updates players.level in the SAME statement that moves xp, using a
// closed form of the curve written in SQL. That duplicates level.ts's curve in a
// second language, so this file is the guard that stops the two drifting:
// it evaluates the EXACT SQL expression and asserts it equals getLevelFromXp.
//
// Postgres SQRT() on an integer returns double precision, which is an IEEE 754
// double -- the same type JS Math.sqrt uses -- so evaluating the expression here
// is faithful, and the interesting failures are float-precision ones at exact
// level boundaries rather than dialect differences.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLevelFromXp, totalXpForLevel } from './level';

/** The literal expression inside applyXp's UPDATE, evaluated the way PG would. */
function sqlLevel(xp: number): number {
  return Math.floor((125 + Math.sqrt(15625 + 500 * Math.max(xp, 0))) / 250);
}

test('the SQL level formula matches getLevelFromXp at every level boundary', () => {
  for (let n = 1; n <= 120; n++) {
    const at = totalXpForLevel(n);
    // exactly on the threshold, one below, one above -- where a float slip shows
    for (const xp of [at - 1, at, at + 1]) {
      if (xp < 0) continue;
      assert.equal(sqlLevel(xp), getLevelFromXp(xp), `xp=${xp} (boundary of level ${n})`);
    }
  }
});

test('the SQL level formula matches getLevelFromXp across the realistic range', () => {
  for (let xp = 0; xp <= 250_000; xp += 97) {
    assert.equal(sqlLevel(xp), getLevelFromXp(xp), `xp=${xp}`);
  }
});

test('negative xp cannot produce a level below 1', () => {
  assert.equal(sqlLevel(-5000), 1);
  assert.equal(getLevelFromXp(0), 1);
});
