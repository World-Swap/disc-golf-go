// src/modules/videos/classify.test.ts
//
// This classifier publishes WITHOUT human review, so its failures land in the
// library the app is sold on. The 2026-09-29 audit is the cautionary tale:
// lessons were found leading with a USGA ruling and two ball-golf channels,
// all of which passed a plausible-title check.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyVideo, MIN_SCORE } from './classify';

test('an unambiguous title lands in the right category', () => {
  const cases: Array<[string, string]> = [
    ['How To Putt: Spin vs Push Putting Explained', 'putting'],
    ['Add 50 Feet To Your Drives With This X-Step Fix', 'driving'],
    ['Forehand Fundamentals: How To Throw A Clean Sidearm', 'forehand'],
    ['Dialing In Your Approach Shots Inside The Circle', 'approach'],
    ['What Disc Should A Beginner Throw? Flight Numbers Explained', 'disc-selection'],
    ['Warm Up Routine Before Your Round: Stretching That Works', 'fitness-warmup'],
    ['Disc Golf Rules: Casual Water And Relief', 'rules-etiquette'],
    ['Your First Tournament: What To Expect', 'tournament-competition'],
    ['Three Putting Drills For Field Work', 'practice'],
  ];
  for (const [title, want] of cases) {
    const got = classifyVideo(title);
    assert.ok(got, `"${title}" should classify`);
    assert.equal(got.categorySlug, want, `"${title}" -> ${got.categorySlug}, wanted ${want}`);
  }
});

test('it REFUSES rather than guesses, which is the whole design', () => {
  // A video that does not name a category simply never becomes a lesson.
  // Missing a good one costs nothing; publishing a mis-filed one costs the
  // credibility of the library, which is the product.
  for (const title of [
    'MVP Open Round 1 | Front 9 | Jomez',
    'We Played The Hardest Course In Texas',
    'Unboxing The New Discraft Stock',
    'Vlog: Building A Course In My Backyard',
    '',
    'Highlights',
  ]) {
    assert.equal(classifyVideo(title), null, `"${title}" must NOT become a lesson`);
  }
});

test('a title that names two categories equally is refused, not coin-flipped', () => {
  // This is precisely where a guess files it wrongly, and nobody is reviewing.
  const r = classifyVideo('Putting And Driving');
  assert.equal(r, null, 'an even tie must refuse');
});

test('a named shot beats the generic how-to-throw categories', () => {
  // "Forehand Basics: Grip and Release" scores 5 for Form & Technique on
  // grip+release, above forehand's 4 -- because "grip" and "release" are shared
  // vocabulary that appears in forehand, putting and driving videos alike. The
  // title says what it is about in its first word, so the specific shot wins.
  assert.equal(classifyVideo('Forehand Basics: Grip and Release')?.categorySlug, 'forehand');
});

test('a generic category REFUSES rather than absorb a shot it cannot score', () => {
  // Here the title names a shot ("tomahawk", 2) too weakly to stand up, while
  // grip+footwork clears the bar for Form & Technique. Filing an overhand video
  // under Form & Technique is the one answer we already know is wrong, so with
  // nobody reviewing, publishing nothing beats publishing that.
  assert.equal(classifyVideo('Tomahawk Grip And Footwork'), null);
});

test('one weak hint is never enough on its own', () => {
  // "routine" alone hints at mental game and nothing else. It must not clear
  // the bar, or half the feed becomes Mental Game lessons.
  const r = classifyVideo('My Routine');
  assert.ok(r === null || r.score >= MIN_SCORE, 'a single weak hint must not publish');
  assert.equal(r, null);
});

test('repetition decides which of two plausible categories it is about', () => {
  // These two titles each name putting AND something else, and they resolve in
  // opposite directions on signal strength rather than on word order:
  //   "Three Putting Drills For Field Work"  -> practice (drills + field work)
  //   "Putting Practice ... If You Three Putt" -> putting ("putting" AND "putt")
  // That second one only works because \bputt\b does not match inside
  // "putting", so a title using both scores twice.
  assert.equal(classifyVideo('Three Putting Drills For Field Work')?.categorySlug, 'practice');
  assert.equal(
    classifyVideo('Putting Practice: Why Your Drive Does Not Matter If You Three Putt')?.categorySlug,
    'putting'
  );
});

test('the strongest signal wins, not the most keywords', () => {
  // A putting video that mentions driving once belongs in Putting.
  const r = classifyVideo('Putting Practice: Why Your Drive Does Not Matter If You Three Putt');
  assert.ok(r);
  assert.equal(r.categorySlug, 'putting');
});

test('every category it can emit is a real one', async () => {
  const { CATEGORIES } = await import('../../db/data/lessons');
  const real = new Set((CATEGORIES as ReadonlyArray<{ slug: string }>).map((c) => c.slug));
  const titles = [
    'How To Putt', 'Add Distance To Your Drive', 'Forehand Grip', 'Approach Shots',
    'What Disc For Beginners', 'Course Management Tips', 'Mental Game Under Pressure',
    'Warm Up Stretching', 'Disc Golf Etiquette', 'First Tournament Tips',
    'Putting Drills Field Work', 'Backhand Form And Grip', 'New To Disc Golf First Round',
  ];
  for (const t of titles) {
    const r = classifyVideo(t);
    if (r) assert.ok(real.has(r.categorySlug), `${r.categorySlug} is not a real category`);
  }
});
