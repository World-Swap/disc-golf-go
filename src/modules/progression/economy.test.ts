// src/modules/progression/economy.test.ts
//
// The standing rule in CLAUDE.md is that the training library leads. Before the
// 2026-10-07 rebalance the economy said the opposite: the whole 134-lesson
// library paid 1,920 XP, which was EXACTLY one capped day of Throw Lab (1.00x)
// and 3.5 new-course check-ins. The app paid least for the thing it sells and
// most for the two paths easiest to script or spoof.
//
// These assert the shape of the economy, not the exact numbers, so the values
// can be tuned but the ordering cannot quietly invert again.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { XP_EVENTS } from './events';
import { LESSONS } from '../../db/data/lessons';

const X = XP_EVENTS as Record<string, number>;
const DAILY_XP_ROUNDS = 12; // mirrors game.service's cap
const CATEGORY_COMPLETE_BONUS_XP = 500;
const CATEGORIES = 13;

const libraryXp =
  (LESSONS as Array<{ xp_reward: number }>).reduce((s, l) => s + l.xp_reward, 0) +
  CATEGORIES * CATEGORY_COMPLETE_BONUS_XP;

/** The most XP Throw Lab can pay in one day: the cap, all 18-hole, all under par. */
const throwLabDay = DAILY_XP_ROUNDS * (X['game_round_18']! + X['game_under_par']!);

test('the training library is worth many days of perfect Throw Lab grinding', () => {
  const days = libraryXp / throwLabDay;
  assert.ok(
    days >= 20,
    `the library should take 20+ capped days of Throw Lab to match; it takes ${days.toFixed(1)}`
  );
});

test('a single lesson outpays a single Throw Lab round', () => {
  const cheapestLesson = Math.min(...(LESSONS as Array<{ xp_reward: number }>).map((l) => l.xp_reward));
  const bestRound = X['game_round_18']! + X['game_under_par']!;
  assert.ok(
    cheapestLesson > bestRound,
    `the cheapest lesson (${cheapestLesson}) must beat the best single round (${bestRound})`
  );
});

test('the library is worth many new-course check-ins, not a handful', () => {
  const perCheckin = X['checkin_new_course']! + X['daily_first_checkin']! + X['round_complete']!;
  const checkins = libraryXp / perCheckin;
  assert.ok(
    checkins >= 20,
    `the library should be worth 20+ check-ins; it is worth ${checkins.toFixed(1)}`
  );
});

test('Throw Lab round XP rises with length and never pays more than a lesson', () => {
  assert.ok(X['game_round_3']! < X['game_round_6']!);
  assert.ok(X['game_round_6']! < X['game_round_9']!);
  assert.ok(X['game_round_9']! < X['game_round_18']!);
});
