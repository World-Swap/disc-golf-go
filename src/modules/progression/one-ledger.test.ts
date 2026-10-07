// src/modules/progression/one-ledger.test.ts
//
// There must be exactly one XP ledger and one audited gold path.
//
// There were two XP ledgers: grants and training wrote xp_transactions, story
// quests and daily challenges wrote xp_log, and training wrote BOTH for the same
// award -- so "how much has this player earned" had two answers and a union
// double-counted. Referrals wrote gold AMOUNTS into xp_log as if they were XP,
// for XP that was never granted. Gold had nine writers, six with no ledger row.
//
// These are source-level assertions because that is where the invariant lives:
// the guarantee is that no module can move XP or gold outside the primitive.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { applyGold } from './grants';

const SRC = join(__dirname, '../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) out.push(p);
  }
  return out;
}
const FILES = walk(SRC);
const rel = (f: string) => f.slice(SRC.length + 1);

test('nothing writes the retired xp_log ledger', () => {
  const offenders = FILES.filter((f) => /INSERT INTO xp_log/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders.map(rel), [], 'xp_transactions is the single XP ledger');
});

test('only the progression primitive increments players.xp', () => {
  const offenders = FILES
    .filter((f) => !f.endsWith('progression/grants.ts'))
    .filter((f) => /UPDATE players[\s\S]{0,40}SET xp = xp \+/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders.map(rel), [], 'XP must move through applyXp, which writes the ledger row');
});

test('only the progression primitive increments players.gold', () => {
  const offenders = FILES
    .filter((f) => !f.endsWith('progression/grants.ts') && !f.endsWith('vault/gold.ts'))
    .filter((f) => /UPDATE players[\s\S]{0,40}SET gold = gold \+/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders.map(rel), [], 'gold must move through applyGold, which writes the ledger row');
});

test('the two spend paths keep their own locked decrement', () => {
  // Spending is deliberately NOT in the primitive: FOR UPDATE + a balance check
  // in the same transaction is what makes a double-spend impossible, and it
  // belongs next to the purchase it guards.
  for (const f of ['modules/shop/shop.repo.ts', 'modules/vault/vault.repo.ts']) {
    const src = readFileSync(join(SRC, f), 'utf8');
    assert.match(src, /SET gold = gold - /, `${f} should still decrement directly`);
    assert.match(src, /INSERT INTO gold_transactions/, `${f} must record the spend`);
  }
  for (const f of ['modules/shop/shop.service.ts', 'modules/vault/vault.service.ts']) {
    const src = readFileSync(join(SRC, f), 'utf8');
    assert.match(src, /lockGold/, `${f} must take the row lock before spending`);
    assert.match(src, /Not enough gold/, `${f} must check the balance`);
  }
});

test('lockGold actually takes a row lock', () => {
  for (const f of ['modules/shop/shop.repo.ts', 'modules/vault/vault.repo.ts']) {
    const src = readFileSync(join(SRC, f), 'utf8');
    assert.match(src, /SELECT gold FROM players WHERE id = \$1 FOR UPDATE/, `${f} lockGold must be FOR UPDATE`);
  }
});

test('applyGold reports the real balance when there is nothing to credit', async () => {
  // The early return used to answer `{ newGold: 0 }`, which grantGold hands
  // straight back to its caller -- so a zero-value event reported an EMPTY
  // wallet rather than an unchanged one, and no ledger row explains the drop
  // because no gold moved.
  const seen: string[] = [];
  const q = {
    async query(sql: string) {
      seen.push(sql.trim().split('\n')[0]!);
      return { rows: [{ gold: 740 }] };
    },
  };
  const { newGold } = await applyGold(q, 1, 0, 'noop_event');
  assert.equal(newGold, 740, 'a no-op credit must still answer the true balance');
  assert.deepEqual(
    seen.filter((s) => /INSERT INTO gold_transactions/.test(s)),
    [],
    'a no-op credit must not write a ledger row'
  );
  assert.deepEqual(
    seen.filter((s) => /UPDATE players/.test(s)),
    [],
    'a no-op credit must not touch the balance'
  );
});
