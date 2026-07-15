// src/modules/challenges/challenges.service.ts — challenge board, claiming,
// permanent progress sync, and leaderboard.

import { notFound, badRequest } from '../../http/errors';
import { withTransaction } from '../../db/pool';
import type { Database } from '../../db/types';
import { grantXp, grantGold, evaluateBadges, type BadgeStats, type XpEvent, type GoldEvent } from '../progression';
import { getActiveBoosts, awardGold, addToInventory, GOLD_EVENTS } from '../vault/gold';
import { createChallengesRepo, type ChallengesRepo, type PeriodBounds } from './challenges.repo';

const CADENCE_SLOTS: Array<{ name: string; count: number }> = [
  { name: 'daily', count: 3 },
  { name: 'weekly', count: 4 },
  { name: 'monthly', count: 3 },
];

const DIFFICULTY_XP: Record<string, XpEvent> = {
  easy: 'challenge_easy',
  medium: 'challenge_medium',
  hard: 'challenge_hard',
  legendary: 'challenge_legendary',
};

const CADENCE_GOLD: Record<string, GoldEvent> = {
  daily: 'challenge_daily',
  weekly: 'challenge_weekly',
  monthly: 'challenge_monthly',
};

function zeroBadgeStats(challengesCompleted: number): BadgeStats {
  return {
    uniqueCourses: 0, totalRounds: 0, challengesCompleted,
    battleWins: 0, bestStreak: 0, uniqueOpponents: 0, uniqueStates: 0,
    maxSameCourseVisits: 0, weekendRounds: 0, nightCheckins: 0, morningCheckins: 0,
    weatherCheckins: 0, trailblazerCourses: 0, seasonsPlayed: 0, completedCities: 0, completedStates: 0,
  };
}

function getPeriodBounds(cadence: string): PeriodBounds {
  const now = new Date();
  if (cadence === 'daily') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return { start, end: new Date(start.getTime() + 86_400_000) };
  }
  if (cadence === 'weekly') {
    const daysSinceMonday = (now.getUTCDay() + 6) % 7;
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday));
    return { start: monday, end: new Date(monday.getTime() + 7 * 86_400_000) };
  }
  if (cadence === 'monthly') {
    return { start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) };
  }
  throw new Error(`Unknown cadence: ${cadence}`);
}

function rollItemRarity(cadence: string): string | null {
  if (cadence === 'daily') return 'common';
  if (cadence === 'weekly') return 'uncommon';
  if (cadence === 'monthly') return Math.random() < 0.1 ? 'epic' : 'rare';
  return null;
}

export function createChallengesService(db: Database, repo: ChallengesRepo = createChallengesRepo(db)) {
  async function ensureActiveSlots() {
    for (const { name, count } of CADENCE_SLOTS) {
      const { start, end } = getPeriodBounds(name);
      if ((await repo.slotCountForPeriod(name, start)) >= count) continue;
      const pool = await repo.poolChallenges(name, count);
      for (const ch of pool) await repo.insertSlot(ch.id, name, start, end);
    }
  }

  return {
    async getBoard(playerId: number) {
      await ensureActiveSlots();
      const now = new Date();
      const slots = await repo.activeSlots(playerId, now);

      for (const slot of slots) {
        const progress = await repo.computeRotatingProgress(db, playerId, slot);
        const completed = progress >= slot.target_value;
        slot.progress = progress;
        slot.completed = completed;
        await repo.upsertSlotProgress(playerId, slot.slot_id, progress, completed);
      }

      const byGroup: Record<string, unknown[]> = { daily: [], weekly: [], monthly: [] };
      for (const slot of slots) byGroup[slot.cadence]?.push(slot);

      return {
        daily: byGroup.daily,
        weekly: byGroup.weekly,
        monthly: byGroup.monthly,
        permanent: await repo.permanentChallenges(playerId, now.toISOString().split('T')[0]!),
      };
    },

    listPermanent(playerId: number) {
      return repo.listPermanent(playerId, new Date().toISOString().split('T')[0]!).then((challenges) => ({ challenges }));
    },

    leaderboard() {
      return repo.leaderboard().then((leaderboard) => ({ leaderboard }));
    },

    async claimSlot(playerId: number, slotId: number) {
      const result = await withTransaction(db, async (client) => {
        const slot = await repo.loadSlot(client, slotId);
        if (!slot) throw notFound('Slot not found');

        const progress = await repo.slotProgress(client, playerId, slotId);
        if (!progress || !progress.completed) throw badRequest('Challenge not completed yet');
        if (progress.claimed) throw badRequest('Already claimed');

        const boosts = await getActiveBoosts(client, playerId);
        const event = DIFFICULTY_XP[slot.difficulty] ?? 'challenge_medium';
        const xp = await grantXp(client, playerId, event, { slot_id: slotId, cadence: slot.cadence, challenge_slug: slot.slug }, boosts);

        let gold: { finalAmount: number; newBalance: number | null } | null = null;
        const goldEvent = CADENCE_GOLD[slot.cadence];
        if (goldEvent) {
          const gr = await grantGold(client, playerId, goldEvent, { slot_id: slotId });
          gold = { finalAmount: gr.amount, newBalance: gr.newGold };
        }

        let itemReward: { name: string; icon: string | null; rarity: string; description: string | null } | null = null;
        const rarity = rollItemRarity(slot.cadence);
        if (rarity) {
          const item = await repo.randomItemByRarity(rarity);
          if (item) {
            await addToInventory(client, playerId, item.id, 'challenge');
            itemReward = { name: item.name, icon: item.icon, rarity: item.rarity, description: item.description };
          }
        }

        await repo.markSlotClaimed(client, playerId, slotId);

        const newBadges = evaluateBadges(zeroBadgeStats(await repo.totalCompletedForBadges(client, playerId)), await repo.earnedBadgeKeys(client, playerId));
        for (const b of newBadges) await repo.insertBadge(client, playerId, b.category, b.tier);

        return { xp, gold, itemReward, newBadges, newGold: await repo.playerGold(client, playerId) };
      });

      return {
        claimed: true,
        xp_granted: result.xp.amount,
        xp_base: result.xp.baseAmount,
        xp_boost_percent: result.xp.boostPercent,
        new_xp: result.xp.newXp,
        new_level: result.xp.newLevel,
        gold_earned: result.gold?.finalAmount ?? 0,
        new_gold_balance: result.gold?.newBalance ?? null,
        new_badges: result.newBadges.map((b) => ({ category: b.category, tier: b.tier })),
        item_reward: result.itemReward,
      };
    },

    async syncProgress(playerId: number, challengeId: number) {
      return withTransaction(db, async (client) => {
        const challenge = await repo.loadChallenge(client, challengeId);
        if (!challenge) throw notFound('Challenge not found');

        const progress = await repo.computePermanentProgress(client, playerId, challenge);
        const existing = await repo.playerChallenge(client, playerId, challengeId);
        const wasCompleted = existing?.completed ?? false;
        const nowCompleted = progress >= challenge.target_value;

        if (!existing) await repo.insertPlayerChallenge(client, playerId, challengeId, progress, nowCompleted);
        else await repo.updatePlayerChallenge(client, playerId, challengeId, progress, nowCompleted);

        let xpGranted: number | null = null;
        let goldGranted: number | null = null;
        if (nowCompleted && !wasCompleted) {
          const eventKey = `challenge_${challenge.difficulty}`;
          const event = (DIFFICULTY_XP[challenge.difficulty] ?? 'challenge_medium') as XpEvent;
          const boosts = await getActiveBoosts(client, playerId);
          const xp = await grantXp(client, playerId, event, { challenge_id: challengeId, challenge_slug: challenge.slug }, boosts);
          xpGranted = xp.amount;
          const gr = await awardGold(client, playerId, eventKey, GOLD_EVENTS[eventKey] ?? 25, boosts, { challenge_id: challengeId });
          goldGranted = gr.finalAmount;

          await repo.markPlayerChallengeClaimed(client, playerId, challengeId);

          const newBadges = evaluateBadges(zeroBadgeStats(await repo.permanentCompletedCount(client, playerId)), await repo.earnedBadgeKeys(client, playerId));
          for (const b of newBadges) await repo.insertBadge(client, playerId, b.category, b.tier);
        }

        return {
          challenge_id: challengeId,
          progress,
          target: challenge.target_value,
          completed: nowCompleted,
          newly_completed: nowCompleted && !wasCompleted,
          xp_granted: xpGranted,
          gold_earned: goldGranted ?? 0,
        };
      });
    },
  };
}

export type ChallengesService = ReturnType<typeof createChallengesService>;
