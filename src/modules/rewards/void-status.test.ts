// src/modules/rewards/void-status.test.ts — a cancelled coupon is not an
// expired one.
//
// `void` is the one status the app reads but never writes: both gates exclude
// it (countIssuedEver, countRecent), so setting it by hand is the designed way
// to cancel a coupon and give the entitlement back. Nothing displayed it,
// though, so a cancelled coupon read as "Expired" in the console and as the
// literal word "void" on the player's own page.
//
// The sharper half was not the label: the per-player bucket swept void into
// `expired` via an `else`, while the summary counted it as neither -- so one
// page showed two numbers that disagreed about the same coupon.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRewardsService } from './rewards.service';

const DAY = 86_400_000;
const future = new Date(Date.now() + 30 * DAY);
const past = new Date(Date.now() - DAY);

function coupon(over: Record<string, unknown> = {}) {
  return {
    id: 1, code: 'DGG-AAAA-AAAA', player_id: 7, type_key: 'merch_5', kind: 'merch',
    title: '$5 off merchandise', terms: 't', face_value_usd: 5, gold_spent: 0,
    lessons_at_issue: 33, status: 'issued', issued_at: new Date(),
    expires_at: future, redeemed_at: null, username: 'ana', email: 'a@example.com',
    ...over,
  };
}

const fakeDb = { async query() { return { rows: [] }; }, async connect() { return { query: async () => ({ rows: [] }), release: () => {} } as never; } } as never;

const svc = (coupons: unknown[]) => createRewardsService({
  db: fakeDb,
  repo: { async adminAllCoupons() { return coupons; }, async adminLessonCounts() { return []; } } as never,
  sendEmail: async () => {},
  enabled: true,
});

test('a voided coupon is counted apart from an expired one', async () => {
  const out = await svc([
    coupon({ code: 'DGG-LIVE' }),
    coupon({ code: 'DGG-GONE', expires_at: past }),              // lapsed
    coupon({ code: 'DGG-VOID', status: 'void' }),                // cancelled
    coupon({ code: 'DGG-USED', status: 'redeemed', redeemed_at: new Date() }),
  ]).adminOverview();

  assert.equal(out.summary.available, 1);
  assert.equal(out.summary.used, 1);
  assert.equal(out.summary.expired, 1, 'only the lapsed one is expired');
  assert.equal(out.summary.voided, 1, 'the cancelled one is its own bucket');

  const p = out.players.find((x) => x.player_id === 7)!;
  assert.equal(p.expired, 1, 'the per-player column must NOT count the void');
  assert.equal(p.voided, 1);
});

test('the buckets account for every coupon, with none counted twice', async () => {
  // The invariant that would have caught the original bug: the four buckets
  // must sum to the issued total. Before the fix a void was in `expired`
  // per-player and in nothing at all in the summary, so this could not hold.
  const rows = [
    coupon({ code: 'A' }), coupon({ code: 'B', expires_at: past }),
    coupon({ code: 'C', status: 'void' }), coupon({ code: 'D', status: 'void' }),
    coupon({ code: 'E', status: 'redeemed', redeemed_at: new Date() }),
    coupon({ code: 'F', player_id: 9, username: 'bo', status: 'void' }),
  ];
  const out = await svc(rows).adminOverview();
  const s = out.summary;
  assert.equal(s.available + s.used + s.expired + s.voided, s.issued,
    'every coupon lands in exactly one bucket');
  for (const p of out.players) {
    assert.equal(p.available + p.used + p.expired + p.voided, p.issued,
      `player ${p.player_id} buckets must sum to their issued count`);
  }
});

test('a voided coupon does not read as money still outstanding', async () => {
  const out = await svc([coupon({ status: 'void' })]).adminOverview();
  assert.equal(out.summary.value_available_usd, 0);
  assert.equal(out.summary.holders, 0, 'nobody is holding a cancelled coupon');
});

test('the console labels it Void, not Expired', () => {
  const page = readFileSync('web/admin.html', 'utf8');
  assert.match(page, /'void':\s*\{ cls: 'void', label: 'Void' \}/);
  assert.ok(!/label = st === 'issued' \? 'Available' : st === 'redeemed' \? 'Used' : 'Expired'/.test(page),
    'the old "everything else is expired" mapping must be gone');
  assert.match(page, /data-cfilter="void"/, 'and it must be filterable');
  // An unknown status must print itself rather than claim to be expired.
  assert.match(page, /String\(st \|\| 'Unknown'\)/);
});

test('the player is told "cancelled", not the database word "void"', () => {
  const page = readFileSync('web/rewards.html', 'utf8');
  assert.match(page, /c\.status === 'void' \? 'cancelled'/,
    'the badge must not print the raw column value');
  assert.match(page, /c\.status === 'void' \? 'Cancelled'/,
    'and the meta line must say so too');
  assert.ok(!/Used &amp; expired/.test(page),
    'the heading must cover cancelled coupons as well');
});
