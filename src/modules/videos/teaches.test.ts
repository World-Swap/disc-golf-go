import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teaches } from './teaches';

// Every title below is a real upload from a channel the app actually pulls.
// The rule was tuned against the whole feed and then reviewed by hand, so
// these are the cases that decided its shape -- not invented examples.

const TEACHES = [
  'How to Throw a Forehand | Complete Disc Golf Guide',
  'How To Actually Throw Farther In Disc Golf (9 steps)',
  'How to Stop Rounding in Disc Golf',
  '4 Ways You’re Losing Backhand Distance',
  'My top 3 tips for a MASSIVE low wobble forehand',
  'Beginner Tips with Sofia Donnecke',
  '3 Keys to a Successful Disc Golf Pre-Round Warmup',
  'Paul McBeth Form Breakdown! What you SHOULDN’T copy!',
  'The Key To Forehand Upshots With Ricky Wysocki!',
  'Getting Snap Every Time is Simple.',
  // These shapes teach without ever saying "how to", and were the whole of
  // the recall gap the first time the rule was measured against real data.
  'Your footwork is killing your backhand - Simplify it.',
  'Is Your Grip Costing You Distance?',
  'You’ve Got a Power Pocket, Why No Power?',
  'Your Grip Should Match Your Form | Grip Deep Dive',
  'There is a huge misunderstanding when it comes to nose angle.',
  'Why Slowing Down Creates More Power | Discussing Counter Rotation',
  'Disc Golf Form Review I Brian',
  'DOES MORE COIL MEAN MORE DISTANCE?  ||  What is COIL in DISC GOLF?',
  'You must do THESE things to throw far in disc golf.',
  'A pro strategy for playing in the wind that every player on the DGPT uses',
];

const DOES_NOT = [
  // Round coverage, which is most of what the big channels post.
  '2026 MVP Open X OTB | MPO FINALB9 | Wysocki, Nybo, Heimburg',
  '2026 GMC Practice Round F9',
  'Champions Cup Practice Round B9',
  'Portland Open Round 1 LIVE!',
  // Entertainment.
  'We Battled at Hornets Nest with Discs Nobody Wanted',
  'The Hottest Sauce We’ve EVER USED for our Hot Ones Disc Golf Challenge',
  '3 Disc Challenge at the #1 Course in America!!',
  'Ricky Wysocki vs. Adam Hammes | Tour Series Bracket Battle',
  // Shopping and gear.
  'The Innova Adventure Pack | Everything You Need, Nothing You Don’t',
  'We Tried Hundreds of Approach Discs These Are Our Favorites!',
  'The BEST Approach Disc You DIDN’T Know About \u{1F94F}',
  'I Tested All My Distance Drivers. Here’s What Made The Bag!',
  'A Lightweight Disc That Handles Real Power | Cavalry First Look',
  '10 Discs That’ll Actually Help Beginners Throw Better and Farther',
  // Channel business and vlogs.
  'Can we beat Gannon’s course record?!',
  'Building my first disc golf green!!',
  '10K SUBSCRIBER AMA AND GIVEAWAY!!!!',
  'Stork Talks PDGA 50 at Pro & Masters Worlds',
  // These two are why the rule is narrower than it looks: the first teaches
  // somebody, but not the viewer; the second is a story about the sport.
  'Teaching Disc Golf to Scouts | Scouting America National Jamboree',
  'What was it like when Innova released disc golf’s first "banded basket." Disc Golf history lesson.',
];

test('the instructional filter', async (t) => {
  await t.test('accepts real lessons', () => {
    const missed = TEACHES.filter((s) => !teaches(s));
    assert.deepEqual(missed, [], 'these are lessons and must be shown');
  });

  await t.test('rejects everything the lounge is for', () => {
    const leaked = DOES_NOT.filter((s) => teaches(s));
    assert.deepEqual(leaked, [], 'these must never sit under "new training videos"');
  });

  await t.test('an empty or junk title is not a lesson', () => {
    for (const s of ['', '   ', null as unknown as string, undefined as unknown as string]) {
      assert.equal(teaches(s), false);
    }
  });

  // The whole point of the filter: the training feed is a promise about what
  // the video is. Being wrong in the safe direction keeps that promise.
  await t.test('a topic word alone is not enough', () => {
    for (const s of ['Putting', 'Forehand', 'My forehand bag', 'Disc golf in Finland']) {
      assert.equal(teaches(s), false, s + ' names a topic, it does not teach one');
    }
  });
});
