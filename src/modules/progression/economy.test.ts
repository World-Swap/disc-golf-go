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
import { GAME_CHALLENGES } from '../game/game.catalog';

const X = XP_EVENTS as Record<string, number>;
const DAILY_XP_ROUNDS = 12; // mirrors game.service's cap
const CATEGORY_COMPLETE_BONUS_XP = 500;
const CATEGORIES = 13;

const libraryXp =
  (LESSONS as Array<{ xp_reward: number }>).reduce((s, l) => s + l.xp_reward, 0) +
  CATEGORIES * CATEGORY_COMPLETE_BONUS_XP;

/**
 * The most XP Throw Lab can pay in one day.
 *
 * This USED to count rounds only, and that was wrong in a way that flattered the
 * rebalance: Throw Lab also settles CHALLENGES, and the 2026-10-07 rebalance cut
 * per-round XP 4x (game_round_18 120 -> 30) while leaving the challenge tiers
 * completely untouched at 150 / 350 / 750 / 1500. Measured against production,
 * challenges were 72% of the top player's entire XP and 100% of the second's --
 * so the number this test was built on excluded the game's LARGEST XP source,
 * and the "53x" figure in CLAUDE.md was computed on a day worth 480 when the
 * real figure is 1,130.
 *
 * Daily challenges are earnable every day; the weekly set is amortised across
 * the seven days it takes to earn it. Monthly and lifetime tiers are excluded
 * because they are not a daily rate -- but note a single lifetime challenge pays
 * 1,500 XP, which is fifteen coached lessons, and life_ace has a target of ONE.
 */
const challengeXpPerDay =
  GAME_CHALLENGES.filter((c) => c.period === 'daily').length * X['challenge_easy']! +
  (GAME_CHALLENGES.filter((c) => c.period === 'weekly').length * X['challenge_medium']!) / 7;
const throwLabDay =
  DAILY_XP_ROUNDS * (X['game_round_18']! + X['game_under_par']!) + challengeXpPerDay;

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


test('no single Throw Lab challenge outpays a batch of coached lessons', () => {
  // This is the assertion whose absence let the rebalance miss the challenge
  // tiers entirely. A lifetime challenge pays challenge_legendary; life_ace has
  // target 1, so ONE lucky ace in a client-simulated game is worth this much.
  // The client computes the throw physics, so an ace is not evidence of skill.
  const dearestLesson = Math.max(...(LESSONS as Array<{ xp_reward: number }>).map((l) => l.xp_reward));
  const tiers = ['challenge_easy', 'challenge_medium', 'challenge_hard', 'challenge_legendary'] as const;
  for (const t of tiers) {
    assert.ok(
      X[t]! <= dearestLesson * 10,
      `${t} pays ${X[t]} XP, over 10 of the dearest lesson (${dearestLesson}) — the game is outpaying the library`
    );
  }
});
