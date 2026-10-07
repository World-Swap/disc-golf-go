// src/modules/rewards/rewards.test.ts
//
// A coupon is real money. These tests are about the ways it could become FREE
// money: a guessable code, a double-spend, an unbounded take, a lapsed code
// still working, or someone burning a coupon they do not hold.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCouponCode, normaliseCouponCode, couponExpiryFrom, COUPON_VALID_MONTHS } from './coupon-code';
import { goldOwedForLevel, COUPON_TYPES, couponTypeByKey, LEVEL_UP_GOLD, LESSONS_PER_COUPON } from './rewards.catalog';
import { goldForLevel } from './level-rewards';

test('codes are unguessable and never collide in bulk', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 20_000; i++) seen.add(generateCouponCode());
  assert.equal(seen.size, 20_000, 'every generated code must be distinct');
});

test('codes avoid every lookalike character', () => {
  // These get read aloud across a table and typed by someone else.
  const banned = /[01I LOSB58U]/;
  for (let i = 0; i < 500; i++) {
    const body = generateCouponCode().replace(/^DGG-/, '').replace(/-/g, '');
    assert.ok(!banned.test(body), `code contains a lookalike: ${body}`);
  }
});

test('normalisation is forgiving about shape', () => {
  const c = generateCouponCode();
  assert.equal(normaliseCouponCode(c.toLowerCase()), c);
  assert.equal(normaliseCouponCode(c.replace(/-/g, '')), c);
  assert.equal(normaliseCouponCode('  ' + c + '  '), c);
  assert.equal(normaliseCouponCode(c.replace(/-/g, ' ')), c);
});

test('normalisation is strict about content, and never guesses a lookalike', () => {
  // The tempting feature is mapping O to Q. It must not exist: a substitution
  // that turns one person's typo into somebody ELSE's valid code hands a
  // discount to the wrong person.
  assert.equal(normaliseCouponCode('DGG-OOOO-OOOO-OOOO'), null);
  assert.equal(normaliseCouponCode('DGG-1111-1111-1111'), null);
  assert.equal(normaliseCouponCode('DGG-ABC'), null, 'too short');
  assert.equal(normaliseCouponCode('DGG-AAAA-AAAA-AAAA-AAAA'), null, 'too long');
  assert.equal(normaliseCouponCode(''), null);
});

test('a coupon expires six months out, not six months of guessing', () => {
  const issued = new Date('2026-10-07T12:00:00Z');
  const exp = couponExpiryFrom(issued);
  assert.equal(exp.toISOString().slice(0, 10), '2027-04-07');
  assert.equal(COUPON_VALID_MONTHS, 6);
  // Month-end does not silently roll into the wrong month.
  assert.equal(couponExpiryFrom(new Date('2026-08-31T00:00:00Z')).getMonth(), 1 /* Feb */);
});

test('level gold is a pure function of the level, so it cannot drift', () => {
  // Expressed as a TOTAL on purpose: a player whose grants were interrupted, or
  // who levelled while the feature was off, settles to the right number rather
  // than depending on which events happened to fire.
  assert.equal(goldOwedForLevel(1), 0, 'level 1 is the starting point, not an achievement');
  assert.equal(goldOwedForLevel(2), LEVEL_UP_GOLD);
  assert.equal(goldOwedForLevel(5), goldOwedForLevel(4) + goldForLevel(5));
  for (let n = 2; n < 30; n++) {
    assert.ok(goldOwedForLevel(n + 1) > goldOwedForLevel(n), `level ${n + 1} must pay more in total`);
  }
});

test('a coupon takes real work, not one lesson', () => {
  // The old version of this asserted a coupon cost more than one level-up pays,
  // because coupons were bought with gold. Gold no longer buys them at all --
  // the equivalent worry is a coupon reachable from a handful of lessons, which
  // the engagement gate alone would not make expensive enough.
  for (const c of COUPON_TYPES) {
    assert.ok(c.lessonsRequired >= 20, `${c.key} is too cheap at ${c.lessonsRequired} lessons`);
  }
});

test('the catalogue has no duplicate keys and every key resolves', () => {
  const keys = COUPON_TYPES.map((c) => c.key);
  assert.equal(new Set(keys).size, keys.length, 'a duplicate key would make issuance ambiguous');
  for (const k of keys) assert.ok(couponTypeByKey(k), `${k} must resolve`);
  assert.equal(couponTypeByKey('nope'), undefined);
});

test('every coupon states its terms in words, not just a number', () => {
  // "$10 off" is not honourable at a desk; what it covers has to be written
  // down, and it is what gets printed on the coupon.
  for (const c of COUPON_TYPES) {
    assert.ok(c.terms.length > 20, `${c.key} needs real terms`);
    assert.ok(c.faceValueUsd > 0, `${c.key} needs a face value for liability reporting`);
    assert.ok(['tournament_entry', 'merch'].includes(c.kind), `${c.key} has an unknown kind`);
  }
});

test('finishing the curated library is worth exactly $20, as specified', async () => {
  // The brief: all coupons are $5, and completing the library pays $20. This is
  // much simpler to pin now than it was: the price is in LESSONS, so the chain
  // no longer runs through lesson XP, the level curve and milestone gold -- four
  // numbers that each drifted independently and between them made this test's
  // earlier version a four-step derivation.
  const { LESSONS } = await import('../../db/data/lessons');
  const curated = (LESSONS as unknown[]).length;

  for (const c of COUPON_TYPES) {
    assert.equal(c.faceValueUsd, 5, `${c.key} must be a $5 coupon`);
    assert.equal(c.lessonsRequired, COUPON_TYPES[0]!.lessonsRequired, 'every coupon costs the same');
  }

  const coupons = Math.floor(curated / LESSONS_PER_COUPON);
  assert.equal(coupons, 4, `${curated} curated lessons earn ${coupons} coupons, not 4`);
  assert.equal(coupons * 5, 20, 'the curated library must be worth $20');

  // It must not be able to drift upward on a lesson or two of ordinary progress.
  const leftover = curated - coupons * LESSONS_PER_COUPON;
  assert.ok(leftover < LESSONS_PER_COUPON / 2,
    `${leftover} lessons spare is most of another coupon — ordinary progress would tip this past $20`);
});

test('a growing library cannot outrun the payout, because the cap bounds it', async () => {
  // Generated lessons ADD to the library, so "finish everything" is a moving
  // target and more content does mean more coupons earned. That is fine and is
  // bounded elsewhere: issuance is 1 per 30 days, so 12 a year is the ceiling no
  // matter how many lessons exist. This states the relationship so nobody has to
  // re-derive it the next time the library grows.
  const { MAX_COUPONS_PER_WINDOW, COUPON_WINDOW_DAYS } = await import('./rewards.service');
  const perYear = Math.floor(365 / COUPON_WINDOW_DAYS) * MAX_COUPONS_PER_WINDOW;
  const lessonsForAYearOfCoupons = perYear * LESSONS_PER_COUPON;
  assert.ok(lessonsForAYearOfCoupons > 300,
    `${lessonsForAYearOfCoupons} lessons would exhaust a year's coupons — that is reachable, raise the price`);
  assert.ok(perYear * 5 <= 60, `$${perYear * 5} a year per account`);
});
