// src/modules/rewards/rewards.service.test.ts — the money paths.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRewardsService, MAX_COUPONS_PER_WINDOW, COUPON_WINDOW_DAYS } from './rewards.service';
import { COUPON_TYPES } from './rewards.catalog';

const CHEAPEST = [...COUPON_TYPES].sort((a, b) => a.goldCost - b.goldCost)[0]!;

/** A repo stub recording what the service asked it to do. */
function stubRepo(over: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const base = {
    calls,
    async lockGold() { calls.push('lockGold'); return 10_000; },
    async spendGold() { calls.push('spendGold'); },
    async countRecent() { calls.push('countRecent'); return 0; },
    async insertCoupon(_c: unknown, c: any) {
      calls.push('insertCoupon');
      return { id: 1, ...c, status: 'issued', issued_at: new Date(), redeemed_at: null };
    },
    async markEmailed() { calls.push('markEmailed'); },
    async listForPlayer() { return []; },
    async findByCode() { return null; },
    async markRedeemed() { return null; },
    async playerEmail() { return { email: 'p@example.com', username: 'bob' }; },
  };
  return Object.assign(base, over);
}

const fakeDb = {
  async query() { return { rows: [] }; },
  async connect() {
    return {
      query: async () => ({ rows: [] }),
      release: () => {},
    } as never;
  },
} as never;

function svc(repo: ReturnType<typeof stubRepo>, sent: unknown[] = []) {
  return createRewardsService({
    db: fakeDb,
    repo: repo as never,
    sendEmail: async (m) => { sent.push(m); },
    enabled: true,
  });
}

test('the gold lock is taken BEFORE the balance is checked or spent', async () => {
  // This is what makes two simultaneous taps safe. Checking the balance first
  // and locking afterwards is the classic double-spend.
  const repo = stubRepo();
  await svc(repo).redeem(1, CHEAPEST.key).catch(() => {});
  const i = repo.calls.indexOf('lockGold');
  const j = repo.calls.indexOf('spendGold');
  assert.ok(i > -1, 'must lock');
  assert.ok(j === -1 || i < j, 'the lock must come before the spend');
});

test('a player short of gold gets nothing, and nothing is spent', async () => {
  const repo = stubRepo({ async lockGold() { return CHEAPEST.goldCost - 1; } });
  await assert.rejects(() => svc(repo).redeem(1, CHEAPEST.key), /Not enough gold/);
  assert.ok(!repo.calls.includes('spendGold'), 'gold must not move');
  assert.ok(!repo.calls.includes('insertCoupon'), 'no coupon may be issued');
});

test('the redemption cap bounds what one account can take out', async () => {
  // Gold EARNING is not trustworthy enough to be the only limit: check-in gold
  // is uncapped across 1,532 courses, so a spoofed GPS track is worth ~38,300
  // gold. Capping the take bounds the liability wherever the gold came from.
  const repo = stubRepo({ async countRecent() { return MAX_COUPONS_PER_WINDOW; } });
  await assert.rejects(
    () => svc(repo).redeem(1, CHEAPEST.key),
    (e: any) => e.statusCode === 429 && String(e.message).includes(String(COUPON_WINDOW_DAYS))
  );
  assert.ok(!repo.calls.includes('spendGold'), 'a capped request must not spend gold');
});

test('an unknown coupon key is refused before any gold moves', async () => {
  const repo = stubRepo();
  await assert.rejects(() => svc(repo).redeem(1, 'free_everything'), /Unknown coupon/);
  assert.deepEqual(repo.calls, [], 'nothing should have been touched');
});

test('a failed email does not cost the player their coupon', async () => {
  // The coupon is already paid for. Rolling it back because Resend had a bad
  // minute would take money and give nothing.
  const repo = stubRepo();
  const service = createRewardsService({
    db: fakeDb,
    repo: repo as never,
    sendEmail: async () => { throw new Error('resend exploded'); },
    enabled: true,
  });
  const r = await service.redeem(1, CHEAPEST.key);
  assert.equal(r.success, true);
  assert.ok(r.coupon.code.startsWith('DGG-'), 'the coupon is still issued');
});

test('redeeming at the desk refuses an expired code, and says so', async () => {
  const past = new Date(Date.now() - 86_400_000);
  const repo = stubRepo({
    async markRedeemed() { return null; },          // the SQL guard rejected it
    async findByCode() {
      return { code: 'DGG-AAAA-AAAA-AAAA', status: 'issued', expires_at: past, redeemed_at: null };
    },
  });
  await assert.rejects(() => svc(repo).markRedeemed('DGG-AAAA-AAAA-AAAA', ''), (e: any) => e.statusCode === 410);
});

test('a code cannot be redeemed twice', async () => {
  const repo = stubRepo({
    async markRedeemed() { return null; },
    async findByCode() {
      return { code: 'DGG-AAAA-AAAA-AAAA', status: 'redeemed', expires_at: new Date(Date.now() + 1e9), redeemed_at: new Date() };
    },
  });
  await assert.rejects(() => svc(repo).markRedeemed('DGG-AAAA-AAAA-AAAA', ''), (e: any) => e.statusCode === 409);
});

test('a malformed code never reaches the database', async () => {
  const repo = stubRepo({ async findByCode() { throw new Error('should not be called'); } });
  await assert.rejects(() => svc(repo).lookup('not-a-code'), /not a valid coupon code/);
});

test('with the feature off, redemption refuses and touches nothing', async () => {
  // The flag is the safety catch while the gold costs and discount values are
  // still placeholders awaiting sign-off.
  const repo = stubRepo();
  const service = createRewardsService({ db: fakeDb, repo: repo as never, enabled: false });
  await assert.rejects(() => service.redeem(1, CHEAPEST.key), (e: any) => e.statusCode === 503);
  assert.deepEqual(repo.calls, [], 'nothing may be locked, spent or issued');
});
