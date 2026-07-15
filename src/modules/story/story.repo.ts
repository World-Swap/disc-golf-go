// src/modules/story/story.repo.ts — read queries for the missions view.

import type { Queryable } from '../../db/types';

export function createStoryRepo(db: Queryable) {
  return {
    async playerStats(playerId: number) {
      const r = await db.query<{ xp: number; gold: number; total_rounds: number; battle_wins: number }>(
        'SELECT xp, gold, total_rounds, battle_wins FROM players WHERE id = $1',
        [playerId]
      );
      return r.rows[0] ?? { xp: 0, gold: 0, total_rounds: 0, battle_wins: 0 };
    },

    // Missions: all mission-type quests + main quests up to the unlocked chapter.
    async missions(playerId: number) {
      const r = await db.query(
        `SELECT sq.id, sq.quest_key, sq.title, sq.description, sq.objective,
                sq.target_value, sq.trigger_event, sq.reward_xp, sq.reward_gold,
                sq.reward_badge_key, sq.reward_item_key, sq.mission_type,
                sq.training_link, sq.is_daily, sq.sort_order,
                COALESCE(qp.progress, 0) as progress,
                COALESCE(qp.completed, FALSE) as completed,
                qp.completed_at
         FROM story_quests sq
         LEFT JOIN quest_progression qp ON qp.quest_id = sq.id AND qp.player_id = $1
         WHERE sq.mission_type IS NOT NULL
            OR sq.chapter_number <= (
                SELECT COALESCE(MAX(sq2.chapter_number), 1)
                FROM quest_progression qp2
                JOIN story_quests sq2 ON sq2.id = qp2.quest_id
                WHERE qp2.player_id = $1 AND qp2.completed = TRUE AND sq2.quest_type = 'main'
            ) + 1
         ORDER BY sq.mission_type NULLS LAST, sq.sort_order`,
        [playerId]
      );
      return r.rows as Array<Record<string, unknown> & { completed: boolean }>;
    },
  };
}

export type StoryRepo = ReturnType<typeof createStoryRepo>;
