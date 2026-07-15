// src/modules/story/quest-engine.ts — the career-quest engine. Other modules
// (rounds, battles, checkins, training) call checkQuestCompletion after game
// events; it advances matching quests and awards rewards in a transaction.

import type { PoolClient } from 'pg';
import type { Database } from '../../db/types';
import { withTransaction } from '../../db/pool';

export interface QuestEventData {
  playerId?: number;
  scoreVsPar?: number;
  battleType?: string;
  streak?: number;
  holesLogged?: number;
  birdies?: number;
  completedAt?: string | Date;
  goldEarned?: number;
  doublesPlus?: number;
  bogeys?: number;
  roundsInWindow?: number;
  courseVisitCount?: number;
  statesVisitedCount?: number;
  newStateReached?: boolean;
  category_slug?: string;
  quiz_correct?: number;
  courseId?: number;
}

interface QuestRow {
  id: number;
  quest_key: string;
  title: string;
  trigger_event: string;
  trigger_conditions: Record<string, unknown> | null;
  target_value: number;
  reward_xp: number;
  reward_gold: number;
  reward_badge_key: string | null;
  reward_item_key: string | null;
  progress_id: number | null;
  progress: number | null;
  completed: boolean | null;
}

/** Pure: does this event satisfy the quest's trigger conditions? */
export function evaluateQuestConditions(quest: QuestRow, e: QuestEventData): boolean {
  const c = quest.trigger_conditions ?? {};
  switch (quest.trigger_event) {
    case 'BATTLE_WIN':
    case 'BATTLE_COMPLETE':
      return !c.battle_type || e.battleType === c.battle_type;
    case 'ROUND_UNDER_PAR':
      return typeof e.scoreVsPar === 'number' && e.scoreVsPar < 0;
    case 'ROUND_AT_PAR':
      return typeof e.scoreVsPar === 'number' && e.scoreVsPar === 0;
    case 'ROUND_18_HOLES':
      return (e.holesLogged ?? 0) >= 18;
    case 'HOLES_LOGGED':
      return (e.holesLogged ?? 0) >= ((c.min_holes as number) ?? 1);
    case 'ROUND_BIRDIE_COUNT':
      return (e.birdies ?? 0) >= ((c.min_birdies as number) ?? 1);
    case 'ROUND_WEEKEND': {
      if (!e.completedAt) return false;
      const dow = new Date(e.completedAt).getDay();
      return dow === 0 || dow === 6;
    }
    case 'ROUND_TIME_MORNING':
      return !!e.completedAt && new Date(e.completedAt).getHours() < 12;
    case 'ROUND_TIME_EARLY':
      return !!e.completedAt && new Date(e.completedAt).getHours() < 8;
    case 'ROUND_TIME_LATE':
      return !!e.completedAt && new Date(e.completedAt).getHours() >= 19;
    case 'BATTLE_WIN_STREAK':
      return (e.streak ?? 0) >= ((c.streak as number) ?? 1);
    case 'GOLD_EARNED':
      return (e.goldEarned ?? 0) >= ((c.min_gold as number) ?? 1);
    case 'COURSE_REPEAT':
      return true; // handled via checkCourseRepeatQuest
    case 'ROUND_CLEAN':
      if (!e.doublesPlus && !e.bogeys) return false;
      return (e.doublesPlus ?? 0) === 0 && (e.bogeys ?? 0) === 0;
    case 'ROUNDS_IN_WINDOW':
      return (e.roundsInWindow ?? 0) >= quest.target_value;
    case 'COURSE_VISITED':
      return (e.courseVisitCount ?? 0) >= quest.target_value;
    case 'STATES_VISITED':
      return (e.statesVisitedCount ?? 0) >= quest.target_value;
    case 'NEW_STATE':
      return e.newStateReached === true;
    case 'ALL_MAIN_COMPLETE':
      return true;
    case 'TRAINING_COMPLETE':
      if (c.category_slug && e.category_slug !== c.category_slug) return false;
      if (c.quiz_correct && (e.quiz_correct ?? 0) < (c.quiz_correct as number)) return false;
      return true;
    default:
      return true;
  }
}

async function awardQuestRewards(client: PoolClient, playerId: number, quest: QuestRow) {
  if (quest.reward_xp > 0) {
    await client.query('UPDATE players SET xp = xp + $1 WHERE id = $2', [quest.reward_xp, playerId]);
    await client.query('INSERT INTO xp_log (player_id, source, amount, context) VALUES ($1, $2, $3, $4)', [playerId, `story_quest_${quest.quest_key}`, quest.reward_xp, quest.title]);
  }
  if (quest.reward_gold > 0) {
    await client.query('UPDATE players SET gold = gold + $1 WHERE id = $2', [quest.reward_gold, playerId]);
  }
  if (quest.reward_badge_key) {
    await client.query(
      `INSERT INTO player_badges (player_id, category, tier, earned_at) VALUES ($1, $2, 'gold', NOW()) ON CONFLICT (player_id, category, tier) DO NOTHING`,
      [playerId, quest.reward_badge_key]
    );
  }
  if (quest.reward_item_key) {
    const item = await client.query<{ id: number }>('SELECT id FROM vault_items WHERE name = $1 LIMIT 1', [quest.reward_item_key]);
    if (item.rows[0]) {
      await client.query(
        `INSERT INTO player_inventory (player_id, item_id, acquired_via, acquired_at) VALUES ($1, $2, 'story_quest', NOW())
         ON CONFLICT (player_id, item_id) DO UPDATE SET quantity = player_inventory.quantity + 1`,
        [playerId, item.rows[0].id]
      );
    }
  }
}

async function loadOpenQuests(client: PoolClient, playerId: number, triggerEvent: string, orderBy: string): Promise<QuestRow[]> {
  const r = await client.query<QuestRow>(
    `SELECT sq.*, qp.id as progress_id, qp.progress, qp.completed
     FROM story_quests sq
     LEFT JOIN quest_progression qp ON qp.quest_id = sq.id AND qp.player_id = $1
     WHERE sq.trigger_event = $2 AND (qp.completed IS FALSE OR qp.id IS NULL)
     ORDER BY ${orderBy}`,
    [playerId, triggerEvent]
  );
  return r.rows;
}

async function upsertProgress(client: PoolClient, playerId: number, quest: QuestRow, progress: number, isComplete: boolean) {
  if (quest.progress_id) {
    await client.query(
      `UPDATE quest_progression SET progress = $1, completed = $2, completed_at = CASE WHEN $2 THEN NOW() ELSE completed_at END WHERE id = $3`,
      [progress, isComplete, quest.progress_id]
    );
  } else {
    await client.query(
      `INSERT INTO quest_progression (player_id, quest_id, progress, completed, completed_at) VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN NOW() ELSE NULL END)`,
      [playerId, quest.id, progress, isComplete]
    );
  }
}

async function advanceMatchingQuests(client: PoolClient, playerId: number, quests: QuestRow[], e: QuestEventData): Promise<QuestRow[]> {
  const newlyCompleted: QuestRow[] = [];
  for (const quest of quests) {
    if (quest.completed) continue;
    if (!evaluateQuestConditions(quest, e)) continue;
    const newProgress = (quest.progress ?? 0) + 1;
    const isComplete = newProgress >= quest.target_value;
    await upsertProgress(client, playerId, quest, newProgress, isComplete);
    if (isComplete) {
      newlyCompleted.push(quest);
      await awardQuestRewards(client, playerId, quest);
    }
  }
  return newlyCompleted;
}

async function checkCourseRepeatQuest(client: PoolClient, playerId: number, courseId: number) {
  const countRes = await client.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM rounds WHERE player_id = $1 AND course_id = $2 AND status = 'completed'`,
    [playerId, courseId]
  );
  const count = parseInt(countRes.rows[0]!.cnt, 10);
  const quests = await loadOpenQuests(client, playerId, 'COURSE_REPEAT', 'sq.chapter_number, sq.sort_order');
  for (const quest of quests) {
    if (quest.completed || count < quest.target_value) continue;
    await upsertProgress(client, playerId, quest, count, true);
    await awardQuestRewards(client, playerId, quest);
  }
}

/** Advance quests for an event. Manages its own transaction. */
export async function checkQuestCompletion(db: Database, playerId: number, eventType: string, eventData: QuestEventData = {}): Promise<QuestRow[]> {
  return withTransaction(db, async (client) => {
    const quests = await loadOpenQuests(client, playerId, eventType, 'sq.chapter_number, sq.sort_order');
    const newlyCompleted = await advanceMatchingQuests(client, playerId, quests, eventData);
    if (eventData.courseId) await checkCourseRepeatQuest(client, playerId, eventData.courseId);
    return newlyCompleted;
  });
}

/** Advance TRAINING_COMPLETE quests when a lesson is completed. Own transaction. */
export async function checkMissionsFromTraining(db: Database, playerId: number, lessonData: { category_slug?: string | null; quiz_correct?: number }): Promise<QuestRow[]> {
  return withTransaction(db, async (client) => {
    const quests = await loadOpenQuests(client, playerId, 'TRAINING_COMPLETE', 'sq.sort_order');
    return advanceMatchingQuests(client, playerId, quests, {
      category_slug: lessonData.category_slug ?? undefined,
      quiz_correct: lessonData.quiz_correct,
    });
  });
}
