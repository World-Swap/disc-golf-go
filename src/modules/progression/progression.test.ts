import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import { evaluateBadges, type BadgeStats } from './badges';
import { getCheckinMilestone, getCourseMilestone, getStateMilestone, getRoundMilestone } from './milestones';
import { grantXp, grantGold } from './grants';

const zeroStats: BadgeStats = {
  battleWins: 0, bestStreak: 0, challengesCompleted: 0, completedCities: 0, completedStates: 0,
  maxSameCourseVisits: 0, morningCheckins: 0, nightCheckins: 0, seasonsPlayed: 0, totalRounds: 0,
  trailblazerCourses: 0, uniqueCourses: 0, uniqueOpponents: 0, uniqueStates: 0, weatherCheckins: 0, weekendRounds: 0,
};

test('evaluateBadges awards crossed tiers, skips earned', () => {
  const stats: BadgeStats = { ...zeroStats, uniqueCourses: 5 };
  const earned = evaluateBadges(stats, new Set());
  // explorer bronze (1) + silver (5) should be earned
  const explorer = earned.filter((b) => b.category === 'explorer').map((b) => b.tier);
  assert.deepEqual(explorer.sort(), ['bronze', 'silver']);

  // With bronze already earned, only silver is new
  const earned2 = evaluateBadges(stats, new Set(['explorer:bronze']));
  const explorer2 = earned2.filter((b) => b.category === 'explorer').map((b) => b.tier);
  assert.deepEqual(explorer2, ['silver']);
});

test('milestones fire on exact counts only', () => {
  assert.equal(getCheckinMilestone(10), 'milestone_checkins_10');
  assert.equal(getCheckinMilestone(11), null);
  assert.equal(getCourseMilestone(25), 'milestone_courses_25');
  assert.equal(getStateMilestone(1), 'milestone_state_champion');
  assert.equal(getStateMilestone(2), null);
  assert.equal(getRoundMilestone(50), 'milestone_rounds_50');
  assert.equal(getRoundMilestone(3), null);
});

// Minimal fake transaction client that records writes and returns canned rows.
function fakeClient(overrides: { xp?: number; gold?: number; boostXpPct?: number; goldBoostPct?: number } = {}) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      if (/boost_type = 'boost_xp'/.test(sql)) {
        return { rows: overrides.boostXpPct ? [{ boost_type: 'boost_xp', effect_value: overrides.boostXpPct }] : [] };
      }
      if (/boost_type = 'boost_gold'/.test(sql)) {
        return { rows: overrides.goldBoostPct ? [{ effect_value: overrides.goldBoostPct }] : [] };
      }
      if (/UPDATE players SET xp/.test(sql)) return { rows: [{ xp: overrides.xp ?? 0 }] };
      if (/UPDATE players SET gold/.test(sql)) return { rows: [{ gold: overrides.gold ?? 0 }] };
      return { rows: [] };
    },
  } as unknown as PoolClient;
  return { client, calls };
}

test('grantXp inserts audit row, updates xp + level, no boost', async () => {
  const { client, calls } = fakeClient({ xp: 1500 });
  const g = await grantXp(client, 7, 'round_complete');
  assert.equal(g.baseAmount, 200);
  assert.equal(g.amount, 200);
  assert.equal(g.boostPercent, 0);
  assert.equal(g.newXp, 1500);
  assert.equal(g.newLevel, 4);
  assert.ok(calls.some((c) => /INSERT INTO xp_transactions/.test(c.sql)));
  assert.ok(calls.some((c) => /UPDATE players SET level/.test(c.sql)));
});

test('grantXp applies active XP boost', async () => {
  const { client } = fakeClient({ xp: 300, boostXpPct: 50 });
  const g = await grantXp(client, 7, 'round_complete'); // 200 * 1.5 = 300
  assert.equal(g.amount, 300);
  assert.equal(g.boostPercent, 50);
  assert.match(g.boostLabel ?? '', /50% XP boost/);
});

test('grantGold applies multiplier; zero events are no-ops', async () => {
  const { client } = fakeClient({ gold: 60, goldBoostPct: 20 });
  const g = await grantGold(client, 7, 'checkin_new_course'); // base 25 * 1.2 = 30
  assert.equal(g.base, 25);
  assert.equal(g.amount, 30);
  assert.equal(g.newGold, 60);

  const { client: c2 } = fakeClient();
  const none = await grantGold(c2, 7, 'checkin_new_course', {}, 0); // override 0 -> no-op
  assert.equal(none.amount, 0);
  assert.equal(none.newGold, null);
});
