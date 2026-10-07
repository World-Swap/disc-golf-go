// src/modules/rewards/stacking.test.ts
//
// Two different limits that are easy to conflate, so they are tested as two
// different things:
//   ISSUANCE  -- how many coupons an account can be given in a window (1/month).
//                This is what bounds the cost of the programme.
//   STACKING  -- how many held coupons may be presented on one purchase (2).
//                This bounds a single discount, not the programme.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_COUPONS_PER_WINDOW,
  COUPON_WINDOW_DAYS,
  MAX_COUPONS_PER_VISIT,
} from './rewards.service';
import { COUPON_TYPES, COUPON_GOLD_COST, COUPON_VALUE_USD } from './rewards.catalog';

const SRC = readFileSync(join(__dirname, 'rewards.service.ts'), 'utf8');

test('issuance is one a month, which is what bounds the programme', () => {
  assert.equal(MAX_COUPONS_PER_WINDOW, 1);
  assert.equal(COUPON_WINDOW_DAYS, 30);
  const perYear = Math.floor(365 / COUPON_WINDOW_DAYS) * MAX_COUPONS_PER_WINDOW;
  assert.equal(perYear, 12);
  assert.ok(perYear * COUPON_VALUE_USD <= 60,
    `a single account can take $${perYear * COUPON_VALUE_USD} a year`);
});

test('the refusal reads as English at a cap of one', () => {
  // "You can redeem 1 coupons every 30 days" reads like a bug to the player
  // who hits it, and hitting it is the normal case now.
  assert.match(SRC, /MAX_COUPONS_PER_WINDOW === 1 \? 'coupon' : 'coupons'/);
});

test('stacking is bounded, and is a DIFFERENT limit from issuance', () => {
  assert.equal(MAX_COUPONS_PER_VISIT, 2);
  assert.match(SRC, /list\.length > MAX_COUPONS_PER_VISIT/, 'the batch must refuse an over-long stack');
  // The two must not be collapsed into one constant: they answer different
  // questions and will be tuned independently.
  assert.notEqual(MAX_COUPONS_PER_VISIT, MAX_COUPONS_PER_WINDOW);
  // Worth stating in a test because it is the thing a counter would get wrong:
  // stacking two at 1-a-month issuance means saving two months.
  assert.ok(MAX_COUPONS_PER_VISIT * COUPON_VALUE_USD === 10);
});

test('a stack cannot be the same coupon twice, or two different kinds', () => {
  assert.match(SRC, /new Set\(codes\)\.size !== codes\.length/,
    'scanning one coupon twice must not read as two discounts');
  assert.match(SRC, /kinds\.size > 1/,
    '$5 off merch and $5 off an entry do not both apply to one merch purchase');
  // There is more than one kind in the catalogue, so that rule is reachable.
  assert.ok(new Set(COUPON_TYPES.map((c) => c.kind)).size > 1);
});

test('a stack is all-or-nothing, inside one transaction', () => {
  // A half-applied stack at a busy desk is worse than a refusal, and the
  // rollback is only real if both reads and both writes share a client.
  const fn = SRC.slice(SRC.indexOf('async redeemTogether'), SRC.indexOf('/** Staff-side: mark it used'));
  assert.match(fn, /withTransaction\(db, async \(client\) =>/);
  assert.match(fn, /repo\.findByCode\(code, client\)/, 'the reads must be on the transaction');
  // Not [^,]+ for the note argument: it is String(note ?? '').slice(0, 500),
  // which contains a comma, so that pattern failed against correct code.
  assert.match(fn, /repo\.markRedeemed\(\s*code,[\s\S]*?,\s*client\s*\)/,
    'the writes must be on the transaction');
});

test('both rules are on the coupon itself, because that is all a player holds', () => {
  // The coupon row denormalises terms at issue time, so the text has to carry
  // the stacking rule -- a printed coupon is the only thing at the counter.
  for (const c of COUPON_TYPES) {
    assert.match(c.terms, new RegExp(`up to ${MAX_COUPONS_PER_VISIT}`, 'i'),
      `${c.key} terms do not state the stacking rule`);
  }
});

test('gold earned now dwarfs gold spendable, so the cap does the work', () => {
  // Not a failure, a statement of where the limit lives: at 12 coupons a year
  // the price per coupon barely matters, because the window runs out long
  // before the balance does.
  const spendableYr = 12 * COUPON_GOLD_COST;
  assert.ok(spendableYr <= 4200, `${spendableYr} gold a year is redeemable`);
});
