// src/modules/training/xp-ledger.test.ts
//
// The invariant: every xp_transactions row a lesson completion writes must have
// a matching credit to players.xp. It did not hold -- the streak (+25) and
// category-complete (+100) bonuses wrote a row, were shown to the player, and
// were never added -- so SUM(xp_transactions) drifted below players.xp forever.
//
// Driven through a fake client that records the SQL the completion actually
// runs, so it tests the service's real statements rather than a copy of them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTrainingRepo } from './training.repo';

interface Seen { credited: number; recorded: number }

/** A client that totals XP credited to players vs XP recorded in the ledger. */
function fakeClient(seen: Seen) {
  return {
    async query(sql: string, params: any[] = []) {
      if (/UPDATE players[\s\S]*SET xp = xp \+/.test(sql)) {
        seen.credited += Number(params[0]);
        return { rows: [{ xp: seen.credited, level: 1 }] };
      }
      if (/INSERT INTO xp_transactions/.test(sql)) {
        seen.recorded += Number(params[2]);
        return { rows: [] };
      }
      return { rows: [] };
    },
  } as any;
}

test('addXp credits players.xp for exactly what it records in the ledger', async () => {
  const seen: Seen = { credited: 0, recorded: 0 };
  const client = fakeClient(seen);
  const repo = createTrainingRepo({ query: async () => ({ rows: [] }) } as any);

  await repo.addXp(client, 1, 15, 'training_completion', {}, 'training');
  await repo.addXp(client, 1, 25, 'training_streak_3', {}, 'training_streak');
  await repo.addXp(client, 1, 100, 'training_category_complete', {}, 'training');

  assert.equal(seen.recorded, 140, 'ledger should record 15 + 25 + 100');
  assert.equal(seen.credited, 140, 'balance must match the ledger');
  assert.equal(seen.credited, seen.recorded, 'ledger and balance must reconcile');
});

test('the repo offers no way to record XP without crediting it', () => {
  const repo = createTrainingRepo({ query: async () => ({ rows: [] }) } as any);
  assert.equal(
    (repo as Record<string, unknown>).addXpTransactionOnly,
    undefined,
    'addXpTransactionOnly wrote a ledger row with no matching credit and must stay gone'
  );
});
