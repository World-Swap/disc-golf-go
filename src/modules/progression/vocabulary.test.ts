// src/modules/progression/vocabulary.test.ts
//
// There must be exactly ONE word for a given amount of XP.
//
// There were two: skill tier Pro began at 5,000 XP, level title Pro at level 25
// = 75,000 XP, and profile.html printed both on one line -- so a player on 5,000
// XP read "Pro · Amateur". getLevelTitle now derives from SKILL_TIERS, and these
// tests are what stop a second table growing back.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKILL_TIERS, getSkillTier, getTitleForXp, totalXpForLevel } from './level';

test('level title and skill tier never disagree, at any XP', () => {
  for (let xp = 0; xp <= 300_000; xp += 311) {
    const tier = getSkillTier(xp).title;
    const title = getTitleForXp(xp).title;
    assert.equal(title, tier, `xp=${xp}: title "${title}" vs tier "${tier}"`);
  }
});

test('they agree on each band edge, where an off-by-one would hide', () => {
  for (const t of SKILL_TIERS) {
    for (const xp of [t.minXp, t.minXp + 1, Math.min(t.maxXp, 10 ** 7)]) {
      const tier = getSkillTier(xp).title;
      const title = getTitleForXp(xp).title;
      assert.equal(title, tier, `xp=${xp} on band ${t.key}`);
    }
  }
});

test('the bands are contiguous and ascending, with no gap to fall through', () => {
  for (let i = 1; i < SKILL_TIERS.length; i++) {
    const prev = SKILL_TIERS[i - 1]!;
    const cur = SKILL_TIERS[i]!;
    assert.equal(cur.minXp, prev.maxXp + 1, `gap between ${prev.key} and ${cur.key}`);
  }
  assert.equal(SKILL_TIERS[0]!.minXp, 0, 'the first band must start at 0 XP');
});

test('the merge demotes nobody: the old tier thresholds still hold', () => {
  // the four bands that existed before, at the XP where each used to begin
  assert.equal(getSkillTier(0).key, 'rookie');
  assert.equal(getSkillTier(500).key, 'player');
  assert.equal(getSkillTier(2000).key, 'advanced');
  assert.equal(getSkillTier(5000).key, 'pro');
  // and the old Pro ceiling is now headroom rather than a demotion
  assert.equal(getSkillTier(99_999).key, 'goat');
});

test('a title exists at every level threshold the curve can reach', () => {
  for (let lvl = 1; lvl <= 120; lvl++) {
    const xp = totalXpForLevel(lvl);
    const t = getTitleForXp(xp);
    assert.ok(t.title && t.icon, `level ${lvl} (${xp} XP) has no title`);
    assert.equal(t.title, getSkillTier(xp).title);
  }
});
