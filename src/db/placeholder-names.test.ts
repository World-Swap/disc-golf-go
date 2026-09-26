import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPlaceholderCourseName } from './data/placeholder-names';
import { COURSES } from './data/courses';

// The entries the OSM import left in the picker — hole designations, bare
// categories, and a course that hasn't been built yet.
const PLACEHOLDERS = [
  'Tee 2 - Long', 'Tee 6 - Short', 'Tee 1', 'Tee2', 'Tee13',
  'Hole 1 - Gray', 'Hole 10 - White', 'Hole 2 Par 3', 'Hole2', 'hole 2', 'Hole 1 of Disc Golf Course',
  'Basket 1', 'Basket4', 'Basket #14', '7 Basket', '7 Tee',
  'Disc Golf', 'Disc Golf Course', 'Disc Gulf', 'Disk Golf Course', 'Disc Golf Area',
  'Disc Golf Basket #9', 'Disc Golf Tee #3', 'Disc golf hole 18', 'Disc Golf Hole 1',
  'Frisbee Golf', 'frisbee golf course', '9-Hole Disc Golf Course',
  'Course 1', 'Practice', 'Practice Basket', 'Practice hole',
  '7', '11', '7A', '7B', '1st', '9th', '12 - 14',
  '(PLANNED) Westerman Trails Disc Golf Course (No infrastructure yet exists)',
  '', '   ',
];

// Real courses whose names brush up against those patterns. A rule that eats any
// of these costs the app a course players actually check in at.
const REAL = [
  'Hole in the Wall DGC', 'Beavers Hole DGC', 'Tee Time Park', 'Basket Case DGC',
  '7 Acre Park DGC', '501 Disc Golf', '5&20 Disc Golf Course', '65th Infantry Disc Golf Course',
  '9 Mile Run DGC', 'Flying Ace 18 Hole Disc Golf Course', 'Bartholomew Park DGC (15-hole layout)',
  "Chain's Edge - Blue", 'Jack Brooks Park - Cedar Hills', 'Comanche Trail Park - Mountain DGC',
  'Practical Park DGC', 'Teetertown Preserve DGC', 'Disc Golf Ranch at Cedar Creek',
  '"The Grove" Disc Golf Course', 'Brock Park DGC',
];

test('flags tee/basket/hole rows and unbuilt courses', () => {
  for (const n of PLACEHOLDERS) {
    assert.equal(isPlaceholderCourseName(n), true, `should be flagged: ${JSON.stringify(n)}`);
  }
  assert.equal(isPlaceholderCourseName(null), true);
  assert.equal(isPlaceholderCourseName(undefined), true);
});

test('keeps real course names', () => {
  for (const n of REAL) {
    assert.equal(isPlaceholderCourseName(n), false, `should be kept: ${JSON.stringify(n)}`);
  }
});

// Guards the seed itself: if a regenerated courses.ts reintroduces these, the
// filter in seedDatabase() still has to leave a course list worth shipping.
test('seed still carries the real course set once filtered', () => {
  const kept = COURSES.filter((c) => !isPlaceholderCourseName(c.name));
  assert.ok(kept.length > 1500, `expected >1500 real courses, got ${kept.length}`);
  assert.ok(COURSES.length - kept.length > 0, 'expected the seed to contain placeholder rows');
  // Nothing kept may be a bare hole number, the shape the picker screenshots showed.
  assert.equal(kept.filter((c) => /^(tee|hole|basket)\s*#?\s*\d+/i.test(c.name.trim())).length, 0);
});
