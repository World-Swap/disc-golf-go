// src/modules/rewards/purse-progress.test.ts — the line that says where a
// player stands against the next coupon.
//
// Written because the owner, who built the feature, read the bare count as a
// balance: claim a coupon, see "33" sit unchanged, conclude nothing happened.
// Lessons are an ENTITLEMENT and only ever go up; what moves is the threshold.
//
// This evaluates the function out of the shipped page rather than a copy, so the
// arithmetic under test is the arithmetic that renders.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LESSONS_PER_COUPON } from './rewards.catalog';

const page = readFileSync('web/rewards.html', 'utf8');

/** Pull `function progress() {...}` out of the page and make it callable. */
function loadProgress() {
  const start = page.indexOf('function progress()');
  assert.ok(start > -1, 'progress() must exist in the page');
  // Balance braces from the function's opening { to find its real end.
  let i = page.indexOf('{', start), depth = 0, end = -1;
  for (let j = i; j < page.length; j++) {
    if (page[j] === '{') depth++;
    else if (page[j] === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  assert.ok(end > -1, 'progress() must be brace-balanced');
  const src = page.slice(start, end);
  // `state` is the page's own variable; inject it.
  return (prog: Record<string, number> | null) =>
    new Function('state', src + '; return progress();')({ prog });
}

const progress = loadProgress();

/** What the server really returns for a player, per rewards.service.mine(). */
function serverProgress(lessons: number, issued: number) {
  const earned = Math.floor(lessons / LESSONS_PER_COUPON);
  return {
    lessons_completed: lessons,
    lessons_per_coupon: LESSONS_PER_COUPON,
    coupons_earned: earned,
    coupons_issued: issued,
    available: Math.max(earned - issued, 0),
    next_at: (earned + 1) * LESSONS_PER_COUPON,
  };
}

test('the case that prompted this: 25 lessons reads 25 / 33 with the gap named', () => {
  const html = progress(serverProgress(25, 0));
  assert.match(html, /25 \/ 33/);
  assert.match(html, /8 more lessons to your next coupon/);
});

test('claiming moves the TARGET, not the count — which is the whole confusion', () => {
  // Before: 33 lessons, nothing claimed -> one is ready.
  assert.match(progress(serverProgress(33, 0)), /1 coupon ready to claim/);

  // After: the same 33 lessons, one claimed. The count is unchanged and that is
  // correct; what must visibly change is the threshold, 33 -> 66.
  const after = progress(serverProgress(33, 1));
  assert.match(after, /33 \/ 66/);
  assert.match(after, /33 more lessons to your next coupon/);
  assert.ok(!/ready to claim/.test(after), 'nothing is claimable at this point');
});

test('the bar measures the current stretch, not the distance from zero', () => {
  // At 33 of 66 the player has just started a new stretch of 33, so the bar
  // must read 0% -- measured from zero it would sit at 50% the instant a coupon
  // was claimed, showing progress nobody earned.
  assert.match(progress(serverProgress(33, 1)), /width:0%/);
  // 40 lessons is 7 into this stretch of 33.
  assert.match(progress(serverProgress(40, 1)), /width:21%/);
  // 25 of a first 33 is 76%.
  assert.match(progress(serverProgress(25, 0)), /width:76%/);
  // A fresh account.
  assert.match(progress(serverProgress(0, 0)), /width:0%/);
});

test('an available coupon outranks progress toward the next', () => {
  // Two earned, none claimed: say so rather than talking about the third.
  const html = progress(serverProgress(66, 0));
  assert.match(html, /2 coupons ready to claim/);
  assert.ok(!/more lessons/.test(html), 'do not bury the claimable ones under a goal');
});

test('it says lesson, not lessons, when one is left', () => {
  // The player closest to a reward is the one who reads this most carefully --
  // the same pluralisation slip already shipped twice on this feature.
  assert.match(progress(serverProgress(LESSONS_PER_COUPON - 1, 0)), /1 more lesson to/);
  assert.ok(!/1 more lessons/.test(progress(serverProgress(LESSONS_PER_COUPON - 1, 0))));
});

test('it renders nothing rather than NaN when progress is missing', () => {
  // mine() 404s when signed out and the page catches it, leaving prog null.
  assert.equal(progress(null), '');
});

test('the percentage can never leave 0..100', () => {
  // Defensive: next_at comes from the server, and a future change there must not
  // be able to render a bar wider than its track or a negative width.
  for (const [lessons, issued] of [[0, 0], [1, 0], [32, 0], [33, 1], [100, 3], [1000, 30], [33, 5]]) {
    const html = progress(serverProgress(lessons, issued));
    const m = html.match(/width:(-?\d+)%/);
    if (!m) continue;                      // the "ready to claim" branch has no bar
    const pct = Number(m[1]);
    assert.ok(pct >= 0 && pct <= 100, `${lessons} lessons / ${issued} issued gave ${pct}%`);
  }
});
