// src/modules/checkins/checkin-cap.test.ts
//
// Check-in rewards were the biggest hole in the economy once gold became
// redeemable: GPS is the easiest signal in the app to fake, and it paid the
// most. Uncapped across 1,532 courses a spoofed track was worth 459,600 XP
// (level 61) plus 38,300 gold directly -- about 43,900 gold all in, or roughly
// $730 of merchandise at coupon prices.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHECKIN_REWARDS_PER_DAY } from './checkin-rewards.service';
import { goldOwedForLevel, COUPON_TYPES } from '../rewards/rewards.catalog';
import { getLevelFromXp } from '../progression/level';
import { XP_EVENTS, GOLD_EVENTS } from '../progression/events';

const SRC = readFileSync(join(__dirname, 'checkin-rewards.service.ts'), 'utf8');

test('the cap is low enough to matter and high enough for real play', () => {
  assert.ok(CHECKIN_REWARDS_PER_DAY >= 1, 'a real player must be able to check in');
  assert.ok(CHECKIN_REWARDS_PER_DAY <= 5, 'more than a handful a day is not real play');
});

test('the cap actually bounds the spoofing payoff', () => {
  const perDay = CHECKIN_REWARDS_PER_DAY * (GOLD_EVENTS.checkin_new_course as number);
  const uncapped = 1532 * (GOLD_EVENTS.checkin_new_course as number);
  const daysToFarmIt = Math.ceil(uncapped / perDay);
  assert.ok(daysToFarmIt > 365, `still farmable in ${daysToFarmIt} days`);
});

test('every XP and gold grant on this path is behind the cap', () => {
  // A new reward added here without `rewarded` would silently reopen the hole,
  // so the guard is structural rather than a list of known events.
  const lines = SRC.split('\n');
  const offenders: string[] = [];
  let guardDepth: number | null = null;
  let depth = 0;
  for (const line of lines) {
    if (/if \(rewarded/.test(line) && guardDepth === null) guardDepth = depth;
    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;
    if (/await grant(Xp|Gold)\(/.test(line)) {
      const insideGuard = guardDepth !== null && depth > guardDepth;
      const onGuardedLine = /rewarded/.test(line);
      // badge_unlock is bounded by the badge tiers themselves, not by volume.
      if (!insideGuard && !onGuardedLine && !/badge_unlock/.test(line)) {
        offenders.push(line.trim().slice(0, 72));
      }
    }
    depth += opens - closes;
    if (guardDepth !== null && depth <= guardDepth) guardDepth = null;
  }
  assert.deepEqual(offenders, [], 'these reward grants are not behind the daily cap');
});

test('level-up gold is NOT granted here — applyXp owns it', () => {
  // Moving level gold into applyXp while leaving this call in place would pay
  // twice for one level, and the second payment would bypass the
  // player_level_rewards UNIQUE that makes it exactly-once.
  assert.ok(
    !/grantGold\([^)]*'level_up'/.test(SRC),
    'check-in must not grant level_up gold; grantLevelRewards does'
  );
});

test('the unrewarded check-in still counts for everything else', () => {
  // The round happened. Only the payment stops.
  assert.match(SRC, /incrementTotalRounds/, 'rounds must still be counted');
  const roundBlock = SRC.slice(SRC.indexOf('if (isRoundComplete)'), SRC.indexOf('// Milestones'));
  assert.ok(
    roundBlock.indexOf('incrementTotalRounds') > roundBlock.indexOf('}'),
    'incrementTotalRounds must sit outside the rewarded branch'
  );
});

test('the XP path was the bigger half, which is why both are capped', () => {
  // Capping gold alone would have left check-in XP -> level -> level gold open.
  const xp = 1532 * (XP_EVENTS.checkin_new_course as number);
  assert.ok(goldOwedForLevel(getLevelFromXp(xp)) > Math.min(...COUPON_TYPES.map((c) => c.goldCost)),
    'uncapped check-in XP alone must still be worth more than a coupon, or this test is pointless');
});

test('badge gold stays a one-off ceiling, which is why it is exempt from the cap', async () => {
  // The exemption rests on badges being earn-once. If the catalogue grew, or
  // badge_unlock got more valuable, that reasoning would quietly stop holding
  // and check-ins would have a farmable path again.
  const { BADGE_DEFINITIONS } = await import('../progression/badges');
  const defs = BADGE_DEFINITIONS as unknown;
  const all = Array.isArray(defs) ? defs : Object.values(defs as Record<string, unknown[]>).flat();
  const lifetimeMax = all.length * (GOLD_EVENTS.badge_unlock as number);
  const cheapest = Math.min(...COUPON_TYPES.map((c) => c.goldCost));
  assert.ok(
    lifetimeMax <= cheapest * 2,
    `badge gold now tops out at ${lifetimeMax}, more than two coupons — put it behind the cap`
  );
});
