// src/modules/rewards/test-hatch.test.ts — opening the rewards path for one
// account without opening it for everyone.
//
// REWARDS_ENABLED is global and does TWO things: it opens coupon claiming to
// every account that has the lessons, and it ungates level-up gold -- which is
// self-healing, so on their next XP award every existing player is back-paid for
// every level they ever reached. That is a one-way change across the whole
// player base, and it is not what "let me test it on my account" should mean.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRewardsService } from './rewards.service';
import { COUPON_TYPES, LESSONS_PER_COUPON, rewardsEnabledFor, REWARDS_ENABLED } from './rewards.catalog';

const ANY = COUPON_TYPES[0]!;
const ME = 12;
const SOMEONE_ELSE = 99;

function stubRepo() {
  return {
    async lockPlayer() { return true; },
    async lessonsCompleted() { return LESSONS_PER_COUPON; },
    async countIssuedEver() { return 0; },
    async countRecent() { return 0; },
    async insertCoupon(_c: unknown, c: any) {
      return { id: 1, ...c, status: 'issued', issued_at: new Date(), redeemed_at: null };
    },
    async markEmailed() {},
    async listForPlayer() { return []; },
    async findByCode() { return null; },
    async markRedeemed() { return null; },
    async playerEmail() { return { email: 'p@example.com', username: 'me' }; },
    async adminAllCoupons() { return []; },
    async adminLessonCounts() { return []; },
  };
}

const fakeDb = {
  async query() { return { rows: [] }; },
  async connect() { return { query: async () => ({ rows: [] }), release: () => {} } as never; },
} as never;

const svc = (testIds: number[]) => createRewardsService({
  db: fakeDb,
  repo: stubRepo() as never,
  sendEmail: async () => {},
  enabled: false,                       // the global flag stays OFF
  testPlayerIds: new Set(testIds),
});

test('the hatch opens the path for the listed account only', async () => {
  const out = await svc([ME]).redeem(ME, ANY.key);
  assert.equal(out.success, true, 'the test account can claim');
  assert.match(out.coupon.code, /^DGG-/);
});

test('every other account is still refused while the global flag is off', async () => {
  // The whole point: a test must not open the money path to 141 accounts.
  await assert.rejects(
    () => svc([ME]).redeem(SOMEONE_ELSE, ANY.key),
    (e: any) => e.statusCode === 503 && /not open yet/.test(e.message)
  );
});

test('an empty hatch refuses everyone, including id 0 and NaN', async () => {
  for (const id of [ME, SOMEONE_ELSE, 0, Number.NaN]) {
    await assert.rejects(() => svc([]).redeem(id, ANY.key), (e: any) => e.statusCode === 503);
  }
});

test('a typo in the id list is dropped, never guessed at', async () => {
  // Parsing is in the catalog and runs on an env string. A non-numeric entry
  // must narrow to nothing rather than widen who can take real money out.
  const parse = (v: string) => new Set(
    v.split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0)
  );
  assert.deepEqual([...parse('12')], [12]);
  assert.deepEqual([...parse('12, 13')], [12, 13]);
  assert.deepEqual([...parse('')], []);
  assert.deepEqual([...parse('twelve')], [], 'a word is not an id');
  assert.deepEqual([...parse('12abc')], [], 'a half-numeric entry is not an id');
  assert.deepEqual([...parse('-1,0,1.5')], [], 'negative, zero and fractional are not ids');
  assert.deepEqual([...parse('12,oops')], [12], 'one bad entry does not take the good one with it');
});

test('the public catalogue never says who is on the hatch', async () => {
  // catalogue() is unauthenticated -- the page shows it before anyone signs in.
  // Which accounts can take money out is not something to hand to a stranger.
  const cat = svc([ME]).catalogue() as Record<string, unknown>;
  assert.equal(cat.enabled, false, 'it reports the GLOBAL state, not the hatch');
  assert.ok(!('test_player_ids' in cat), 'the public catalogue must not carry the id list');
  assert.ok(!JSON.stringify(cat).includes(String(ME)), 'nor the id anywhere in its body');
});

test('the admin overview DOES say, so the console cannot look live when it is not', async () => {
  const out = await svc([ME]).adminOverview();
  assert.equal(out.enabled, false);
  assert.deepEqual(out.test_player_ids, [ME]);
});

test('level gold is gated per player too, so a test does not back-pay everyone', async () => {
  // grantLevelRewards is self-healing: it settles every unpaid level at or below
  // the current one. Under the global flag that fires for all 141 accounts on
  // their next XP award. Per-player keeps the retroactive settle to the tester.
  const src = await import('node:fs').then((fs) =>
    fs.readFileSync('src/modules/rewards/level-rewards.ts', 'utf8'));
  assert.match(src, /rewardsEnabledFor\(playerId\)/,
    'level rewards must consult the per-player check, not the bare global flag');
  assert.ok(!/!REWARDS_ENABLED \|\| level < 2/.test(src),
    'the bare global check must be gone');
});

test('the hatch is additive: a true global flag still opens it for everyone', async () => {
  // Turning the programme on for real must not require emptying the id list.
  const open = createRewardsService({
    db: fakeDb, repo: stubRepo() as never, sendEmail: async () => {},
    enabled: true, testPlayerIds: new Set<number>(),
  });
  const out = await open.redeem(SOMEONE_ELSE, ANY.key);
  assert.equal(out.success, true);

  // And the helper agrees with that reading.
  assert.equal(rewardsEnabledFor(1), REWARDS_ENABLED,
    'with no env hatch set, the helper is exactly the global flag');
});
