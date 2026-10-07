// src/modules/rewards/admin-overview.test.ts — what the admin console's Coupons
// tab reports.
//
// This is the only staff surface for coupons: whoever honours one at an event
// reads these buckets. Two things it must not get wrong, and both have a test
// here because both are easy to get wrong in a way nobody notices:
//
//  1. An EXPIRED coupon must never count as available. The rule lives in
//     couponStatus and nowhere else, which is why the summary is computed in JS
//     over the rows rather than counted in SQL -- a second copy of the rule
//     would be free to disagree with the codes printed beside it.
//  2. "Unclaimed" (an entitlement crossed but not taken) and "available" (a
//     coupon that exists and can be presented) are different things, and only
//     the second is money that can walk up to a counter.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRewardsService, couponStatus } from './rewards.service';
import { LESSONS_PER_COUPON } from './rewards.catalog';

const DAY = 86_400_000;
const future = new Date(Date.now() + 30 * DAY);
const past = new Date(Date.now() - DAY);

function coupon(over: Record<string, unknown> = {}) {
  return {
    id: 1, code: 'DGG-AAAA-AAAA', player_id: 1, type_key: 'merch_5', kind: 'merch',
    title: '$5 off merchandise', terms: 'terms', face_value_usd: 5, gold_spent: 0,
    lessons_at_issue: LESSONS_PER_COUPON, status: 'issued',
    issued_at: new Date(), expires_at: future, redeemed_at: null,
    username: 'bob', email: 'bob@example.com',
    ...over,
  };
}

const fakeDb = { async query() { return { rows: [] }; }, async connect() { return { query: async () => ({ rows: [] }), release: () => {} } as never; } } as never;

function svc(coupons: unknown[], lessons: unknown[]) {
  return createRewardsService({
    db: fakeDb,
    repo: {
      async adminAllCoupons() { return coupons; },
      async adminLessonCounts() { return lessons; },
    } as never,
    sendEmail: async () => {},
    enabled: true,
  });
}

test('an expired coupon is never counted as available', async () => {
  // The whole reason the summary is derived rather than counted in SQL: the
  // status COLUMN still reads 'issued' on a lapsed coupon, because expiry is
  // decided on read. Counting the column would overstate what is outstanding
  // and promise money that cannot be presented.
  const rows = [
    coupon({ code: 'DGG-AAAA-AAAA', expires_at: future }),
    coupon({ code: 'DGG-BBBB-BBBB', expires_at: past }),      // status column: 'issued'
    coupon({ code: 'DGG-CCCC-CCCC', status: 'redeemed', redeemed_at: new Date() }),
  ];
  const out = await svc(rows, []).adminOverview();

  assert.equal(out.summary.issued, 3);
  assert.equal(out.summary.available, 1, 'only the unexpired, unused one is available');
  assert.equal(out.summary.used, 1);
  assert.equal(out.summary.expired, 1);
  assert.equal(out.summary.value_available_usd, 5, 'an expired coupon is not outstanding money');
  assert.equal(out.summary.value_used_usd, 5);

  // And the row the page prints agrees with the bucket it was counted in.
  const byCode = new Map(out.coupons.map((c) => [c.code, c.status]));
  assert.equal(byCode.get('DGG-BBBB-BBBB'), 'expired');
  assert.equal(byCode.get('DGG-AAAA-AAAA'), 'issued');
});

test('the page and the counter use ONE definition of expired', () => {
  // couponStatus is shared by view() (what a counter lookup reports) and
  // adminOverview (what the tab counts). Pin both directions so a change to one
  // cannot quietly diverge from the other.
  assert.equal(couponStatus({ status: 'issued', expires_at: future }), 'issued');
  assert.equal(couponStatus({ status: 'issued', expires_at: past }), 'expired');
  assert.equal(couponStatus({ status: 'redeemed', expires_at: past }), 'redeemed',
    'a coupon already honoured stays honoured after its date passes');
});

test('unclaimed entitlement is reported separately from coupons in hand', async () => {
  // A player on two coupons' worth of lessons who has claimed one holds one
  // coupon and is owed one more. Collapsing those into a single number would
  // either overstate what can be presented today or hide what is coming.
  const out = await svc(
    [coupon({ player_id: 7, username: 'ana', lessons_at_issue: LESSONS_PER_COUPON })],
    [{ player_id: 7, username: 'ana', email: 'ana@example.com', lessons: LESSONS_PER_COUPON * 2 }]
  ).adminOverview();

  const ana = out.players.find((p) => p.player_id === 7)!;
  assert.equal(ana.lessons, LESSONS_PER_COUPON * 2);
  assert.equal(ana.coupons_earned, 2);
  assert.equal(ana.issued, 1);
  assert.equal(ana.available, 1, 'one coupon in hand');
  assert.equal(ana.unclaimed, 1, 'one more earned but not taken');
  assert.equal(out.summary.unclaimed, 1);
  assert.equal(out.summary.holders, 1);
});

test('a player with lessons and no coupon is still listed', async () => {
  // They are the ones about to claim, so they are exactly who the tab is for.
  const out = await svc([], [
    { player_id: 3, username: 'cal', email: null, lessons: LESSONS_PER_COUPON },
    { player_id: 4, username: 'dee', email: null, lessons: 1 },
  ]).adminOverview();

  assert.equal(out.players.length, 2);
  assert.equal(out.players[0]!.username, 'cal', 'whoever is owed something sorts first');
  assert.equal(out.players[0]!.unclaimed, 1);
  assert.equal(out.players[1]!.unclaimed, 0);
  assert.equal(out.summary.issued, 0);
});

test('a coupon whose account is gone still appears, with its code', async () => {
  // coupons.player_id carries no foreign key, so deleting an account leaves the
  // coupon behind. It can still be presented on paper, so it must still be
  // findable here -- the join is LEFT for exactly this.
  const out = await svc([coupon({ player_id: 99, username: null, email: null })], []).adminOverview();
  assert.equal(out.coupons.length, 1);
  assert.equal(out.coupons[0]!.code, 'DGG-AAAA-AAAA');
  assert.equal(out.coupons[0]!.username, null);
  assert.equal(out.summary.available, 1);
});

test('the limits the tab prints come from the service, not the page', async () => {
  // The page used to be free to write "2 per visit" in its own copy. If these
  // ever stop being served, the staff-facing rules can drift from the ones the
  // server enforces, and someone at a counter learns the real rule from a refusal.
  const out = await svc([], []).adminOverview();
  const { MAX_COUPONS_PER_WINDOW, COUPON_WINDOW_DAYS, MAX_COUPONS_PER_VISIT } =
    await import('./rewards.service');
  assert.equal(out.lessons_per_coupon, LESSONS_PER_COUPON);
  assert.equal(out.max_per_window, MAX_COUPONS_PER_WINDOW);
  assert.equal(out.window_days, COUPON_WINDOW_DAYS);
  assert.equal(out.max_per_visit, MAX_COUPONS_PER_VISIT);
});

test('nothing promises a checkout that does not exist', async () => {
  // Coupons are honoured IN PERSON: shown to the TD when registering for a
  // listed event on Disc Golf Scene, or over the counter for merchandise. There
  // is no online store and no checkout to type a code into, so neither the
  // terms nor the email may say there is.
  //
  // This matters more than ordinary copy because a coupon's terms are
  // DENORMALISED onto the row at issue time: a coupon promising online
  // redemption keeps promising it for six months after the claim stops being
  // false-by-accident and starts being false-by-record. When the store opens,
  // update the terms and delete this test in the same change.
  const { COUPON_TYPES } = await import('./rewards.catalog');
  const { couponEmail } = await import('./coupon-email');

  const sample = {
    id: 1, code: 'DGG-AAAA-AAAA', player_id: 1, type_key: 'merch_5', kind: 'merch',
    title: 'x', terms: 'x', face_value_usd: 5, gold_spent: 0, lessons_at_issue: 33,
    status: 'issued', issued_at: new Date(), expires_at: new Date(Date.now() + DAY), redeemed_at: null,
  };
  const email = couponEmail(sample as never, 'ana');

  const forbidden = [/at checkout/i, /\bonline\b/i];
  for (const re of forbidden) {
    for (const t of COUPON_TYPES) {
      assert.ok(!re.test(t.terms), `${t.key} terms must not match ${re}: ${t.terms}`);
    }
    assert.ok(!re.test(email.text), `email text must not match ${re}`);
    assert.ok(!re.test(email.html), `email html must not match ${re}`);
  }

  // And the email must not quote a gold price: coupons are earned from lessons,
  // so gold_spent is 0 on every row and "you redeemed 0 gold" was what it said.
  assert.ok(!/\bgold\b/i.test(email.text), 'the email must not mention gold');
  assert.match(email.text, /33 training lessons/);
});
