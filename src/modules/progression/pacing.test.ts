// src/modules/progression/pacing.test.ts
//
// Gold pacing. Each of these bounds a path that was UNCAPPED and was measured,
// against the live database, as either the largest recurring source or the most
// farmable one. They assert the bound still bites, not the exact number, so the
// values can be tuned without the ceiling quietly disappearing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { XP_EVENTS, GOLD_EVENTS } from './events';
import { DAILY_CHALLENGE_MAX_GOLD } from '../story/daily-challenge';
import { MAX_REWARDED_REFERRALS } from '../referrals/referrals.service';
import { COUPON_VALUE_USD } from '../rewards/rewards.catalog';
import { LESSONS } from '../../db/data/lessons';

const X = XP_EVENTS as Record<string, number>;
const G = GOLD_EVENTS as Record<string, number>;

test('the training daily challenge gold is clamped in CODE, not just in the seed', () => {
  // The pool is editable data and player_daily_challenges DENORMALISES
  // gold_reward at assignment time, so rows already assigned at the old rates
  // are still out there. Lowering the seed alone would not bound those.
  const src = readFileSync(join(__dirname, '../story/daily-challenge.ts'), 'utf8');
  assert.match(src, /Math\.min\(\s*updated\.gold_reward,\s*DAILY_CHALLENGE_MAX_GOLD\s*\)/,
    'the grant must clamp, not trust the row');
  // ~6,000 a year was the largest recurring source in the app. Keep it near one
  // ordinary daily action.
  const perYear = DAILY_CHALLENGE_MAX_GOLD * 365;
  assert.ok(perYear <= 2600, `daily challenge tops out at ${perYear} gold a year`);
  assert.ok(DAILY_CHALLENGE_MAX_GOLD <= G.checkin_new_course * 2,
    'one daily challenge should not outpay two new-course check-ins');
});

test('the seeded pool stays under the clamp, so the clamp is a backstop not the rule', () => {
  const seed = readFileSync(join(__dirname, '../../db/seed.ts'), 'utf8');
  const block = seed.slice(seed.indexOf('INSERT INTO daily_challenge_pool'));
  const rows = [...block.slice(0, block.indexOf(';')).matchAll(/\d+, (\d+)\)/g)].map((m) => Number(m[1]));
  assert.ok(rows.length >= 10, `expected the pool rows, found ${rows.length}`);
  for (const gold of rows) {
    assert.ok(gold <= DAILY_CHALLENGE_MAX_GOLD,
      `a pool row pays ${gold}, above the clamp of ${DAILY_CHALLENGE_MAX_GOLD} — lower the seed too`);
  }
});

test('referral gold is capped per account, and the friend bonus is not', () => {
  const src = readFileSync(join(__dirname, '../referrals/referrals.service.ts'), 'utf8');
  assert.match(src, /already < MAX_REWARDED_REFERRALS/, 'the referrer payment must be gated');
  // Read inside the loop, per referrer: one friend can carry activations for
  // more than one code.
  const loopAt = src.indexOf('for (const a of activations)');
  assert.ok(src.indexOf('rewardedCount(a.referrer_id)') > loopAt,
    'the count must be read per referrer inside the loop, not once outside');
  // The new player must still get their joining bonus past the cap.
  const bonusAt = src.indexOf('grantGold(friendId, FRIEND_BONUS_GOLD)');
  assert.ok(bonusAt > loopAt && !/payReferrer[\s\S]{0,120}grantGold\(friendId/.test(src),
    'the friend bonus must not be behind the referrer cap');
  // No longer expressed in dollars: referral gold cannot buy a coupon, so its
  // ceiling is a shop-and-vault number now, not a liability.
  const ceiling = MAX_REWARDED_REFERRALS * 200;
  assert.ok(ceiling <= 2500, `referrals top out at ${ceiling} gold`);
});

test('a referral past the cap is still recorded, so it cannot be re-paid later', () => {
  const src = readFileSync(join(__dirname, '../referrals/referrals.service.ts'), 'utf8');
  assert.match(src, /markRewarded\(a\.id, payReferrer \? REWARD_GOLD : 0\)/,
    'an uncapped-out referral must still be marked, with 0 recorded');
});

test('no Throw Lab challenge tier outpays a coached lesson by much', () => {
  // The rebalance cut per-round XP 4x and left these at 150/350/750/1500 --
  // 72% of the top player's entire ledger. life_ace has a target of ONE.
  const dearest = Math.max(...(LESSONS as Array<{ xp_reward: number }>).map((l) => l.xp_reward));
  for (const t of ['challenge_easy', 'challenge_medium', 'challenge_hard', 'challenge_legendary']) {
    assert.ok(X[t]! <= dearest * 2,
      `${t} pays ${X[t]} XP against a ${dearest} XP lesson — the game is outpaying the library`);
  }
});
