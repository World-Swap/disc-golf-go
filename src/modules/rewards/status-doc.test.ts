// src/modules/rewards/status-doc.test.ts
//
// REWARDS_STATUS.md states the live constants in a table. A document full of
// numbers is the single most reliable thing in this repo to go stale -- the
// per-state course counts, "13 touring pros", "200+ videos" and the badge-gold
// ceiling all drifted exactly this way -- so the doc's figures are pinned to the
// code rather than trusted.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LESSONS_PER_COUPON, COUPON_VALUE_USD } from './rewards.catalog';
import { MAX_COUPONS_PER_WINDOW, COUPON_WINDOW_DAYS, MAX_COUPONS_PER_VISIT } from './rewards.service';
import { COUPON_VALID_MONTHS } from './coupon-code';
import { CHECKIN_REWARDS_PER_DAY } from '../checkins/checkin-rewards.service';
import { MIN_DWELL_SECONDS, MAX_COMPLETIONS_PER_HOUR } from '../training/engagement';
import { MAX_REWARDED_REFERRALS } from '../referrals/referrals.service';
import { DAILY_CHALLENGE_MAX_GOLD } from '../story/daily-challenge';

const DOC = readFileSync(join(__dirname, '../../../REWARDS_STATUS.md'), 'utf8');

/** The doc must contain this exact string, so a constant change fails loudly. */
const states = (label: string, text: string) =>
  assert.ok(DOC.includes(text), `REWARDS_STATUS.md no longer states ${label} as "${text}"`);

test('the status doc states the live constants', () => {
  states('LESSONS_PER_COUPON', `| **${LESSONS_PER_COUPON}** |`);
  states('COUPON_VALUE_USD', `| **${COUPON_VALUE_USD}** |`);
  states('COUPON_VALID_MONTHS', `| **${COUPON_VALID_MONTHS}** |`);
  states('the issuance cap', `**${MAX_COUPONS_PER_WINDOW}** per ${COUPON_WINDOW_DAYS} days`);
  states('the stacking cap', `**${MAX_COUPONS_PER_VISIT}** (stacking)`);
  states('the check-in cap', `**${CHECKIN_REWARDS_PER_DAY} a day**`);
  states('the dwell gate', `${MIN_DWELL_SECONDS}s dwell`);
  states('the hourly gate', `**${MAX_COMPLETIONS_PER_HOUR}/hour**`);
  states('the referral cap', `**${MAX_REWARDED_REFERRALS} paid**`);
  states('the daily-challenge clamp', `clamped at **${DAILY_CHALLENGE_MAX_GOLD}**`);
});

test('the status doc states the derived figures, which are the ones that misled', () => {
  // These are the numbers that were wrong for most of a day: the cap was quoted
  // as the per-account cost when it is unreachable.
  const perYear = Math.floor(365 / COUPON_WINDOW_DAYS) * MAX_COUPONS_PER_WINDOW;
  states('lessons needed to reach the cap', `${perYear} x ${LESSONS_PER_COUPON} = ${perYear * LESSONS_PER_COUPON}`);
  states('the cap in dollars', `$${perYear * COUPON_VALUE_USD}`);
  states('the cap as unreachable', '**unreachable**');
});

test('the curated library still earns exactly four coupons', async () => {
  const { LESSONS } = await import('../../db/data/lessons');
  const curated = (LESSONS as unknown[]).length;
  assert.equal(Math.floor(curated / LESSONS_PER_COUPON), 4);
  states('the curated count', `Curated library (${curated} lessons)`);
  states('the library value', `**$${Math.floor(curated / LESSONS_PER_COUPON) * COUPON_VALUE_USD}**`);
});

test('the doc says the feature is off, and it is', async () => {
  // If the flag is ever defaulted on, this doc's first line becomes a lie about
  // whether real money can move.
  const cat = readFileSync(join(__dirname, 'rewards.catalog.ts'), 'utf8');
  assert.match(cat, /REWARDS_ENABLED = process\.env\.REWARDS_ENABLED === 'true'/,
    'the flag must stay opt-in');
  states('the off state', '**OFF**');
});
