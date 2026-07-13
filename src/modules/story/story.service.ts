// src/modules/story/story.service.ts — missions view + daily challenge.

import { AppError } from '../../http/errors';
import type { Database } from '../../db/types';
import { createStoryRepo, type StoryRepo } from './story.repo';
import { getOrCreateDailyChallenge, type DailyChallengeRow } from './daily-challenge';

function toDailyView(d: DailyChallengeRow) {
  return {
    id: d.id,
    title: d.title,
    description: d.description,
    challenge_type: d.challenge_type,
    target_value: d.target_value,
    progress: d.progress || 0,
    xp_reward: d.xp_reward,
    gold_reward: d.gold_reward,
    training_slug: d.training_slug,
    completed: d.completed,
    completed_at: d.completed_at,
  };
}

export function createStoryService(db: Database, repo: StoryRepo = createStoryRepo(db)) {
  return {
    async getMissions(playerId: number) {
      const [daily, player, missions] = await Promise.all([
        getOrCreateDailyChallenge(db, playerId),
        repo.playerStats(playerId),
        repo.missions(playerId),
      ]);

      return {
        playerXp: player.xp || 0,
        playerGold: player.gold || 0,
        totalRounds: player.total_rounds || 0,
        battleWins: player.battle_wins || 0,
        dailyChallenge: daily ? toDailyView(daily) : null,
        missions,
        totalMissions: missions.length,
        completedCount: missions.filter((m) => m.completed).length,
      };
    },

    async getDaily(playerId: number) {
      const challenge = await getOrCreateDailyChallenge(db, playerId);
      if (!challenge) throw new AppError(503, 'No challenges available');
      return { ...toDailyView(challenge), date: challenge.challenge_date };
    },
  };
}

export type StoryService = ReturnType<typeof createStoryService>;
