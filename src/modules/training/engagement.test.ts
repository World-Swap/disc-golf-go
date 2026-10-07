// src/modules/training/engagement.test.ts — the gate that stops clicking through.
//
// Before this, completeLesson had no gate: an authenticated POST marked a
// lesson done and paid full XP. The whole library is 25,750 XP -> level 14 ->
// 1,000 gold -> coupons redeemable for real merchandise, so the cheapest route
// to real money was a loop.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkEngagement, MIN_DWELL_SECONDS, MAX_COMPLETIONS_PER_HOUR } from './engagement';

test('a lesson never opened cannot be completed', () => {
  const r = checkEngagement({ openedSecondsAgo: null, resourcesOpened: 0 });
  assert.equal(r.ok, false);
  assert.match(r.reason!, /Open the lesson/);
});

test('opening without touching the video or links is not participation', () => {
  // This is the whole point of the feature: the lesson IS the video and the
  // articles, so a completion with neither opened has not happened.
  const r = checkEngagement({ openedSecondsAgo: 9999, resourcesOpened: 0 });
  assert.equal(r.ok, false);
  assert.match(r.reason!, /video or open one of the links/);
});

test('a too-fast completion is refused, and says how long to wait', () => {
  // "Failed" is a bad answer for someone who genuinely read it. The message
  // tells them when they can proceed instead.
  const r = checkEngagement({ openedSecondsAgo: 5, resourcesOpened: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.waitSeconds, MIN_DWELL_SECONDS - 5);
  assert.match(r.reason!, /\d+s/);
});

test('an honest completion passes without the player noticing', () => {
  assert.deepEqual(checkEngagement({ openedSecondsAgo: MIN_DWELL_SECONDS, resourcesOpened: 1 }), { ok: true });
  assert.deepEqual(checkEngagement({ openedSecondsAgo: 600, resourcesOpened: 3 }), { ok: true });
});

test('the gate reads only server-recorded state', () => {
  // checkEngagement is a pure function of two numbers the SERVER measured, so
  // nothing in the request body can influence it. If it ever grows a parameter
  // sourced from the client, that is the bug.
  assert.equal(checkEngagement.length, 1, 'one argument: the server-measured state');
});

test('the thresholds actually cost a script something', () => {
  // 134 lessons at MIN_DWELL_SECONDS is the floor on a scripted run, and the
  // hourly cap is the real bound. Both must stay meaningful.
  const scriptedHours = (134 * MIN_DWELL_SECONDS) / 3600;
  const cappedHours = 134 / MAX_COMPLETIONS_PER_HOUR;
  assert.ok(scriptedHours > 1, `dwell floor is only ${scriptedHours.toFixed(1)}h`);
  assert.ok(cappedHours > 5, `hourly cap only forces ${cappedHours.toFixed(1)}h`);
});
