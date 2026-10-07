// src/modules/rewards/rewards.service.test.ts — the money paths.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRewardsService, MAX_COUPONS_PER_WINDOW, COUPON_WINDOW_DAYS } from './rewards.service';
import { COUPON_TYPES, LESSONS_PER_COUPON } from './rewards.catalog';

const ANY = COUPON_TYPES[0]!;

/** A repo stub recording what the service asked it to do. */
function stubRepo(over: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const base = {
    calls,
    async lockPlayer() { calls.push('lockPlayer'); return true; },
    // Enough lessons for one coupon, none issued yet.
    async lessonsCompleted() { calls.push('lessonsCompleted'); return LESSONS_PER_COUPON; },
    async countIssuedEver() { calls.push('countIssuedEver'); return 0; },
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

test('the row lock is taken BEFORE the entitlement is read', async () => {
  // This is what makes two simultaneous taps safe. Reading the entitlement first
  // and locking afterwards lets both taps see the same unspent entitlement --
  // the same shape of bug as a double-spend, and the reason the lock survived
  // the move off gold even though there is no balance left to protect.
  const repo = stubRepo();
  await svc(repo).redeem(1, ANY.key).catch(() => {});
  const lock = repo.calls.indexOf('lockPlayer');
  const read = repo.calls.indexOf('lessonsCompleted');
  assert.ok(lock > -1, 'must lock the player row');
  assert.ok(read > lock, 'the entitlement must be read under the lock');
});

test('a player short of lessons gets nothing, and is told how many are left', async () => {
  const repo = stubRepo({ async lessonsCompleted() { return LESSONS_PER_COUPON - 4; } });
  await assert.rejects(
    () => svc(repo).redeem(1, ANY.key),
    (e: any) => e.statusCode === 400 && /4 more lessons/.test(e.message)
  );
  assert.ok(!repo.calls.includes('insertCoupon'), 'no coupon may be issued');
});

test('lessons already claimed cannot pay a second time', async () => {
  // The entitlement is floor(lessons / N) MINUS coupons already issued, counted
  // over all time. Without the subtraction a player who completed 33 lessons
  // could take a coupon every month forever.
  const repo = stubRepo({
    async lessonsCompleted() { return LESSONS_PER_COUPON; },
    async countIssuedEver() { return 1; },
  });
  await assert.rejects(() => svc(repo).redeem(1, ANY.key), /more lessons/);
  assert.ok(!repo.calls.includes('insertCoupon'));
});

test('gold is not touched at all on the coupon path', async () => {
  // The whole point of pricing in lessons: check-in gold, Throw Lab gold,
  // level gold and referral gold now reach this path not at all. The stub has
  // no gold methods, so a reintroduced call would crash rather than pass.
  const repo = stubRepo();
  const r = await svc(repo).redeem(1, ANY.key);
  assert.equal(r.success, true);
  assert.ok(!repo.calls.some((c) => /gold/i.test(c)), `gold was touched: ${repo.calls.join(', ')}`);
});

test('the redemption cap bounds what one account can take out', async () => {
  // Gold EARNING is not trustworthy enough to be the only limit: check-in gold
  // is uncapped across 1,532 courses, so a spoofed GPS track is worth ~38,300
  // gold. Capping the take bounds the liability wherever the gold came from.
  const repo = stubRepo({ async countRecent() { return MAX_COUPONS_PER_WINDOW; } });
  await assert.rejects(
    () => svc(repo).redeem(1, ANY.key),
    (e: any) => e.statusCode === 429 && String(e.message).includes(String(COUPON_WINDOW_DAYS))
  );
  assert.ok(!repo.calls.includes('insertCoupon'), 'a capped request must not issue a coupon');
});

test('an unknown coupon key is refused before anything is read', async () => {
  const repo = stubRepo();
  await assert.rejects(() => svc(repo).redeem(1, 'free_everything'), /Unknown coupon/);
  assert.deepEqual(repo.calls, [], 'nothing should have been touched');
});

test('a failed email does not cost the player their coupon', async () => {
  // The coupon is already earned. Rolling it back because Resend had a bad
  // minute would consume the entitlement and hand over nothing.
  const repo = stubRepo();
  const service = createRewardsService({
    db: fakeDb,
    repo: repo as never,
    sendEmail: async () => { throw new Error('resend exploded'); },
    enabled: true,
  });
  const r = await service.redeem(1, ANY.key);
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
  // The flag is the safety catch while the lesson price and discount values are
  // still awaiting sign-off.
  const repo = stubRepo();
  const service = createRewardsService({ db: fakeDb, repo: repo as never, enabled: false });
  await assert.rejects(() => service.redeem(1, ANY.key), (e: any) => e.statusCode === 503);
  assert.deepEqual(repo.calls, [], 'nothing may be locked, read or issued');
});
