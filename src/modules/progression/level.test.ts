import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  totalXpForLevel,
  getLevelFromXp,
  getLevelProgress,
  getTitleForXp,
  getSkillTier,
  getSkillTierProgress,
} from './level';

test('totalXpForLevel follows 125*n*(n-1)', () => {
  assert.equal(totalXpForLevel(1), 0);
  assert.equal(totalXpForLevel(2), 250);
  assert.equal(totalXpForLevel(3), 750);
  assert.equal(totalXpForLevel(4), 1500);
  assert.equal(totalXpForLevel(20), 47500);
});

test('getLevelFromXp maps XP to level', () => {
  assert.equal(getLevelFromXp(0), 1);
  assert.equal(getLevelFromXp(249), 1);
  assert.equal(getLevelFromXp(250), 2);
  assert.equal(getLevelFromXp(1499), 3);
  assert.equal(getLevelFromXp(1500), 4);
});

test('getLevelProgress reports within-level progress', () => {
  const p = getLevelProgress(1500);
  assert.equal(p.level, 4);
  assert.equal(p.progress, 0);
  assert.equal(p.needed, 1000); // total(5) - total(4) = 2500 - 1500
  assert.equal(p.percent, 0);

  const mid = getLevelProgress(2000); // halfway from 1500 to 2500
  assert.equal(mid.level, 4);
  assert.equal(mid.progress, 500);
  assert.equal(mid.percent, 50);
});

test('level titles by band', () => {
  // The title is a function of XP, not level, and 'Amateur'/'Intermediate' are
  // gone: they belonged to the second vocabulary that contradicted skill tiers.
  assert.equal(getTitleForXp(0).title, 'Rookie');
  assert.equal(getTitleForXp(500).title, 'Player');
  assert.equal(getTitleForXp(2_000).title, 'Advanced');
  assert.equal(getTitleForXp(5_000).title, 'Pro');
  assert.equal(getTitleForXp(15_000).title, 'Legend');
  assert.equal(getTitleForXp(50_000).title, 'GOAT');
});

test('skill tiers by total XP', () => {
  assert.equal(getSkillTier(0).key, 'rookie');
  assert.equal(getSkillTier(499).key, 'rookie');
  assert.equal(getSkillTier(500).key, 'player');
  assert.equal(getSkillTier(2000).key, 'advanced');
  assert.equal(getSkillTier(5000).key, 'pro');
  assert.equal(getSkillTierProgress(500).pct, 0);
});
