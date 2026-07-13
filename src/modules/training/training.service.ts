// src/modules/training/training.service.ts — training library + completion
// system. completeLesson runs the full XP/streak/category/milestone pipeline in
// a transaction. Story-mission triggers are an injected optional hook (no-op
// until the story module exists).

import { notFound, badRequest, forbidden } from '../../http/errors';
import { withTransaction } from '../../db/pool';
import type { Database } from '../../db/types';
import { getLevelFromXp, totalXpForLevel, getSkillTier, getSkillTierProgress } from '../progression';
import { createTrainingRepo, type TrainingRepo, type SkillLevel } from './training.repo';

const TIER_MESSAGES: Record<string, Array<{ type: string; title: string; body: string }>> = {
  rookie: [
    { type: 'tip', title: 'Start with the basics', body: 'Form & Technique covers grip, stance, and follow-through — the foundation of every great throw.' },
    { type: 'tip', title: 'Choose your first disc', body: 'Start with a putter or midrange. Fairway drivers come later.' },
    { type: 'action', title: 'Complete 3 lessons this week', body: 'Build a daily habit. Each lesson unlocks 10–15 XP.' },
  ],
  player: [
    { type: 'tip', title: 'Fill in the gaps', body: 'Finish all lessons in your least-completed category before moving on.' },
    { type: 'tip', title: 'Apply what you learn', body: 'Your Form & Technique training shows on the course — track your round scores to see progress.' },
    { type: 'action', title: 'Challenge: 3 lessons in 7 days', body: 'A week of consistent training pushes you to Advanced tier.' },
  ],
  advanced: [
    { type: 'tip', title: 'Master the details', body: 'You know the basics. Now focus on consistency under pressure.' },
    { type: 'tip', title: 'Track your weak spots', body: 'Review your round stats to find which hole types cost you strokes — then revisit that lesson.' },
    { type: 'action', title: 'Share your knowledge', body: 'Help a buddy who is just starting out. Teaching reinforces learning.' },
  ],
  pro: [
    { type: 'tip', title: 'Fine-tune your game', body: 'Review your tournament rounds. Which situations cost you the most strokes?' },
    { type: 'tip', title: 'Stay sharp', body: 'Even at Pro level, daily practice keeps your form locked in. One lesson a day maintains your edge.' },
    { type: 'action', title: 'Compete in crew wars', body: 'Test your skills in crew battles. The pressure of competition reveals what to work on.' },
  ],
};

const VALID_LEVELS: SkillLevel[] = ['beginner', 'intermediate', 'advanced', 'all_levels'];
const STREAK_BONUS_XP = 25;
const CATEGORY_COMPLETE_BONUS_XP = 100;
const SHARE_BONUS_XP = 10;

export const MILESTONE_DEFS = [
  { key: 'first_lesson', title: 'First Lesson', desc: 'Completed your first training lesson', trigger: 1, gold: 0 },
  { key: 'getting_started', title: 'Getting Started', desc: 'Completed 5 lessons — way to go!', trigger: 5, gold: 25 },
  { key: 'half_way_there', title: 'Half Way There', desc: 'Completed 10 lessons — serious commitment', trigger: 10, gold: 50 },
  { key: 'training_machine', title: 'Training Machine', desc: 'Completed 25 lessons — unstoppable!', trigger: 25, gold: 100 },
  { key: 'legend', title: 'Legend', desc: 'Completed 50 lessons — disc golf scholar', trigger: 50, gold: 250 },
] as const;

// Hook fired (fire-and-forget) after a brand-new lesson completion commits.
export type LessonCompletedHook = (playerId: number, lesson: { lesson_id: number; category_slug: string | null; xp_reward: number }) => void;

function toDateStr(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0]!;
  return String(val).slice(0, 10);
}
const dayStr = (ms: number) => new Date(ms).toISOString().split('T')[0]!;

export interface TrainingServiceDeps {
  db: Database;
  repo?: TrainingRepo;
  onLessonCompleted?: LessonCompletedHook;
}

export function createTrainingService({ db, repo = createTrainingRepo(db), onLessonCompleted }: TrainingServiceDeps) {
  function levelParam(raw: unknown): SkillLevel | null {
    return typeof raw === 'string' && VALID_LEVELS.includes(raw as SkillLevel) ? (raw as SkillLevel) : null;
  }

  return {
    async listCategories(playerId: number | null, levelRaw: unknown) {
      const level = levelParam(levelRaw);
      const rows = await repo.categories(level);
      const completions = playerId ? await repo.categoryCompletionCounts(playerId) : new Map<number, number>();
      return {
        categories: rows.map((c) => ({ ...c, lesson_count: parseInt(c.lesson_count, 10), completed_count: completions.get(c.id) ?? 0 })),
      };
    },

    async listLessons(playerId: number | null, slug: string, levelRaw: unknown) {
      const category = await repo.categoryBySlug(slug);
      if (!category) throw notFound('Category not found');
      const level = levelParam(levelRaw);
      const lessons = await repo.lessonsInCategory(category.id, level);
      const completed = playerId ? await repo.completedLessonIdsAmong(playerId, lessons.map((l) => l.id)) : new Set<number>();
      return {
        category,
        lessons: lessons.map((l) => ({ ...l, completed: completed.has(l.id) })),
        level_filter: level,
      };
    },

    async getLesson(playerId: number | null, lessonId: number) {
      const lesson = await repo.lessonDetail(lessonId);
      if (!lesson) throw notFound('Lesson not found');
      const is_completed = playerId ? await repo.isCompleted(playerId, lessonId) : false;
      const next_lesson = await repo.nextLesson(lesson.category_id, lesson.sort_order);
      return { ...lesson, is_completed, next_lesson };
    },

    getResources(lessonId: number) {
      return repo.lessonResources(lessonId);
    },

    async completeLesson(playerId: number, lessonId: number) {
      const result = await withTransaction(db, async (client) => {
        const lesson = await repo.loadLessonForCompletion(client, lessonId);
        if (!lesson) throw notFound('Lesson not found');

        const xpReward = Number(lesson.xp_reward);
        const alreadyCompleted = await repo.completionExists(client, playerId, lessonId);

        let awardedXp = 0;
        let bonusXp = 0;
        let bonusReason: string | null = null;
        let streakDays = 0;
        let categoryCompleteBonus = 0;

        if (!alreadyCompleted) {
          await repo.insertCompletion(client, playerId, lessonId);
          awardedXp = xpReward;

          // Streak update (savepoint-guarded so a failure can't abort the completion).
          const today = dayStr(Date.now());
          const yesterday = dayStr(Date.now() - 86_400_000);
          await client.query('SAVEPOINT streak_update');
          try {
            const row = await repo.lockStreakRow(client, playerId);
            let newStreak = 1;
            if (row) {
              const lastDate = toDateStr(row.last_date);
              if (lastDate === yesterday) newStreak = (row.streak_days || 0) + 1;
              else if (lastDate === today) newStreak = row.streak_days || 1;
            }
            await repo.upsertStreak(client, playerId, newStreak, today);
            streakDays = newStreak;
            await client.query('RELEASE SAVEPOINT streak_update');
          } catch {
            await client.query('ROLLBACK TO SAVEPOINT streak_update');
          }

          // Streak bonus (3+ days). NOTE: like the legacy engine, bonus XP is
          // recorded in xp_transactions but NOT added to players.xp — only the
          // base lesson XP moves the player's total. Preserved intentionally;
          // flag for review if the intent was to also credit the bonus.
          if (streakDays >= 3) {
            bonusXp += STREAK_BONUS_XP;
            bonusReason = (bonusReason ? bonusReason + ', ' : '') + 'streak_' + streakDays;
            await repo.addXpTransactionOnly(client, playerId, 'training_streak_' + streakDays, STREAK_BONUS_XP, { streak_days: streakDays }, 'training_streak');
          }

          // Base lesson XP (credited to players.xp).
          await repo.addXp(client, playerId, xpReward, 'training_completion', { lesson_id: lessonId, lesson_title: lesson.title }, 'training');
          await repo.addXpLog(client, playerId, 'training_completion', xpReward, { lesson_id: lessonId, lesson_title: lesson.title });

          // Category completion bonus (savepoint-guarded).
          await client.query('SAVEPOINT cat_check');
          try {
            const total = await repo.categoryLessonCount(client, lesson.category_id);
            const done = await repo.categoryCompletedCount(client, playerId, lesson.category_id);
            if (done === total && total > 0) {
              categoryCompleteBonus = CATEGORY_COMPLETE_BONUS_XP;
              bonusXp += categoryCompleteBonus;
              await repo.addXpTransactionOnly(client, playerId, 'training_category_complete', categoryCompleteBonus, { category_id: lesson.category_id }, 'training');
            }
            await client.query('RELEASE SAVEPOINT cat_check');
          } catch {
            await client.query('ROLLBACK TO SAVEPOINT cat_check');
          }

          // Milestone check (savepoint-guarded).
          await client.query('SAVEPOINT milestone_check');
          try {
            const total = await repo.totalCompleted(client, playerId);
            for (const def of MILESTONE_DEFS) {
              if (total === def.trigger) {
                const inserted = await repo.insertMilestone(client, playerId, def.key, def.gold);
                if (inserted && def.gold > 0) await repo.addGold(client, playerId, def.gold);
              }
            }
            for (const c of await repo.categoryCompletionRows(client, playerId)) {
              if (parseInt(c.completed, 10) === parseInt(c.total_lessons, 10) && parseInt(c.total_lessons, 10) > 0) {
                const inserted = await repo.insertMilestone(client, playerId, 'cat_complete_' + c.slug, 50);
                if (inserted) await repo.addGold(client, playerId, 50);
              }
            }
            await client.query('RELEASE SAVEPOINT milestone_check');
          } catch {
            await client.query('ROLLBACK TO SAVEPOINT milestone_check');
          }
        }

        const current_xp = await repo.playerXp(client, playerId);
        return { alreadyCompleted, awardedXp, bonusXp, bonusReason, streakDays, categoryCompleteBonus, current_xp, lesson };
      });

      if (!result.alreadyCompleted && onLessonCompleted) {
        onLessonCompleted(playerId, { lesson_id: lessonId, category_slug: result.lesson.category_slug ?? null, xp_reward: Number(result.lesson.xp_reward) });
      }

      return {
        success: true,
        already_completed: result.alreadyCompleted,
        xp_awarded: result.awardedXp,
        bonus_xp: result.bonusXp,
        bonus_reason: result.bonusReason,
        streak_days: result.streakDays,
        category_complete_bonus: result.categoryCompleteBonus,
        current_xp: result.current_xp,
        lesson_title: result.lesson.title,
      };
    },

    async shareCompletion(playerId: number, lessonId: number) {
      if (!lessonId) throw badRequest('Invalid lesson ID');
      const title = await repo.lessonTitle(lessonId);
      if (!title) throw notFound('Lesson not found');
      if (!(await repo.isCompleted(playerId, lessonId))) throw forbidden('Lesson not yet completed');
      if (await repo.shareAlreadyAwarded(playerId, lessonId)) return { shared: false, already_shared: true };
      await repo.awardShare(playerId, lessonId, title, SHARE_BONUS_XP);
      return { shared: true, xp_bonus: SHARE_BONUS_XP };
    },

    async getProgress(playerId: number) {
      const [rows, t] = await Promise.all([repo.progressByCategory(playerId), repo.progressTotals(playerId)]);
      const totalLessons = parseInt(t.total_lessons, 10);
      return {
        categories: rows.map((r) => ({
          ...r,
          total_lessons: parseInt(r.total_lessons!, 10),
          completed_lessons: parseInt(r.completed_lessons!, 10),
          xp_earned: parseInt(r.xp_earned!, 10),
          pct_complete: r.pct_complete ? parseInt(r.pct_complete, 10) : 0,
        })),
        overall: {
          total_lessons: totalLessons,
          completed_lessons: parseInt(t.completed_lessons, 10),
          total_xp_earned: parseInt(t.total_xp_earned, 10),
          pct_complete: totalLessons > 0 ? Math.round((parseInt(t.completed_lessons, 10) / totalLessons) * 100) : 0,
        },
      };
    },

    async getStreak(playerId: number) {
      const today = dayStr(Date.now());
      const yesterday = dayStr(Date.now() - 86_400_000);

      let streak = await repo.streakRow(playerId);
      if (!streak) {
        const dates = await repo.completionDatesDesc(playerId);
        if (dates.length > 0) {
          let currentStreak = 0;
          let expected = new Date(today);
          for (const row of dates) {
            const dayString = toDateStr(row.d);
            const expStr = expected.toISOString().split('T')[0];
            if (dayString === expStr || dayString === yesterday) {
              currentStreak++;
              expected = new Date(expected.getTime() - 86_400_000);
            } else break;
          }
          await repo.seedStreak(playerId, currentStreak, dates.length, dates[0]!.d);
          streak = await repo.streakRow(playerId);
        }
      }

      const s = streak ?? { streak_days: 0, longest_streak: 0, last_date: null, streak_frozen: false };
      const daysUntilBonus = s.streak_days < 3 ? 3 - s.streak_days : 0;
      const lastDateStr = toDateStr(s.last_date);
      return {
        current_streak: s.streak_days,
        longest_streak: s.longest_streak,
        last_training_date: s.last_date,
        streak_frozen: s.streak_frozen,
        is_active_today: lastDateStr === today,
        is_active: lastDateStr === today || lastDateStr === yesterday,
        days_until_bonus: daysUntilBonus,
        bonus_description: daysUntilBonus === 0 ? 'Streak bonus active! +25 XP per lesson' : `Train ${daysUntilBonus} more day${daysUntilBonus > 1 ? 's' : ''} for streak bonus (+25 XP)`,
      };
    },

    async getMilestones(playerId: number) {
      const [totalCompleted, earnedRows, catRows] = await Promise.all([
        repo.totalCompleted(db, playerId),
        repo.earnedMilestones(playerId),
        repo.categoryCompletionRows(db, playerId),
      ]);
      const earnedMap = new Map(earnedRows.map((r) => [r.milestone_key, r]));

      const milestones = MILESTONE_DEFS.map((def) => ({
        ...def,
        earned: earnedMap.has(def.key),
        reward_gold: earnedMap.has(def.key) ? def.gold : 0,
        earned_at: earnedMap.get(def.key)?.earned_at ?? null,
        next_trigger: null,
        progress: def.trigger > totalCompleted ? totalCompleted : def.trigger,
        total: def.trigger,
      }));

      const categoryMilestones = catRows
        .filter((c) => parseInt(c.total_lessons, 10) > 0)
        .map((c) => {
          const key = 'cat_complete_' + c.slug;
          return {
            key,
            title: c.name + ' Master',
            desc: 'Completed all ' + c.total_lessons + ' lessons in ' + c.name,
            trigger: parseInt(c.total_lessons, 10),
            gold: 50,
            earned: earnedMap.has(key),
            earned_at: earnedMap.get(key)?.earned_at ?? null,
            progress: parseInt(c.completed, 10),
            total: parseInt(c.total_lessons, 10),
            icon: c.icon,
          };
        });

      return {
        total_lessons_completed: totalCompleted,
        milestones: [...milestones, ...categoryMilestones],
        total_milestones: MILESTONE_DEFS.length + catRows.filter((c) => parseInt(c.total_lessons, 10) > 0).length,
        earned_count: earnedMap.size,
      };
    },

    async checkMilestones(playerId: number) {
      return withTransaction(db, async (client) => {
        const total = await repo.totalCompleted(client, playerId);
        const newMilestones: Array<{ milestone_key: string; title: string; reward_gold: number; earned_at: Date }> = [];

        for (const def of MILESTONE_DEFS) {
          if (total === def.trigger) {
            const row = await repo.insertMilestone(client, playerId, def.key, def.gold);
            if (row) {
              if (row.reward_gold > 0) await repo.addGold(client, playerId, row.reward_gold);
              newMilestones.push({ milestone_key: row.milestone_key, title: def.title, reward_gold: row.reward_gold, earned_at: row.earned_at });
            }
          }
        }
        for (const c of await repo.categoryCompletionRows(client, playerId)) {
          if (parseInt(c.completed, 10) === parseInt(c.total_lessons, 10) && parseInt(c.total_lessons, 10) > 0) {
            const row = await repo.insertMilestone(client, playerId, 'cat_complete_' + c.slug, 50);
            if (row) {
              await repo.addGold(client, playerId, 50);
              newMilestones.push({ milestone_key: row.milestone_key, title: c.name + ' Master', reward_gold: 50, earned_at: row.earned_at });
            }
          }
        }
        return { new_milestones: newMilestones, total_completed: total };
      });
    },

    async getRecommendations(playerId: number) {
      const player = await repo.playerXpAndStreak(playerId);
      if (!player) throw notFound('Player not found');
      const xp = player.xp;
      const tier = getSkillTier(xp);
      const catProgress = await repo.categoryProgressRanked(playerId);

      const incompletePerCategory: Array<{ category_id: number; category_name: string; category_slug: string; category_icon: string | null; pct_complete: number; next_lesson: unknown }> = [];
      for (const cat of catProgress) {
        if ((cat.pct_complete ?? 0) >= 100) continue;
        const next = await repo.nextIncompleteInCategory(playerId, cat.id);
        if (next) {
          incompletePerCategory.push({
            category_id: cat.id,
            category_name: cat.name as unknown as string,
            category_slug: cat.slug as unknown as string,
            category_icon: (cat.icon as unknown as string) ?? null,
            pct_complete: cat.pct_complete ?? 0,
            next_lesson: next,
          });
        }
      }

      const recommendations: unknown[] = [];
      const top = await repo.topRecommendedLesson(playerId);
      if (top) recommendations.push({ reason: 'Start here', priority: 1, type: 'lesson', lesson: top });

      const focus = incompletePerCategory.find((c) => c.pct_complete < 100);
      if (focus) {
        recommendations.push({
          reason: 'Keep momentum going',
          priority: 2,
          type: 'category_focus',
          category: { id: focus.category_id, name: focus.category_name, slug: focus.category_slug, icon: focus.category_icon, pct_complete: focus.pct_complete },
          next_lesson: focus.next_lesson,
        });
      }

      if (tier.key === 'advanced' || tier.key === 'pro') {
        const adv = await repo.advancedLesson(playerId);
        if (adv) recommendations.push({ reason: 'Time for advanced content', priority: 3, type: 'lesson', lesson: adv });
      }

      return {
        skill_tier: tier.key,
        skill_tier_icon: tier.icon,
        streak_days: player.training_streak_days ?? 0,
        recommendations,
        tier_messages: TIER_MESSAGES[tier.key] ?? TIER_MESSAGES.rookie,
        categories: catProgress.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          icon: c.icon,
          description: c.description,
          total_lessons: parseInt(c.total_lessons!, 10),
          completed_lessons: parseInt(c.completed_lessons!, 10),
          pct_complete: c.pct_complete ?? 0,
          next_incomplete: incompletePerCategory.find((ic) => ic.category_id === c.id)?.next_lesson ?? null,
        })),
      };
    },

    async getHomeState(playerId: number | null) {
      if (!playerId) return { authenticated: false };

      const player = await repo.homePlayer(playerId);
      if (!player) throw notFound('Player not found');

      const [catRows, totals, nextLesson, streakDays, recentRounds] = await Promise.all([
        repo.progressByCategory(playerId),
        repo.progressTotals(playerId),
        repo.nextIncompleteLesson(playerId),
        repo.homeStreakDays(playerId),
        repo.recentRounds(playerId),
      ]);

      const xp = player.xp;
      const totalLessons = parseInt(totals.total_lessons, 10);
      const level = getLevelFromXp(xp);

      return {
        authenticated: true,
        player: {
          id: player.id,
          username: player.username,
          xp,
          level,
          experience_level: player.experience_level,
          total_distance_m: parseFloat(player.total_distance_m as unknown as string),
          total_rounds: parseInt(player.total_rounds as unknown as string, 10),
          total_courses_visited: parseInt(player.total_courses_visited as unknown as string, 10),
          gold_balance: parseInt(player.gold_balance as unknown as string, 10),
          total_checkins: parseInt(player.total_checkins as unknown as string, 10),
          total_birdies: parseInt(player.total_birdies as unknown as string, 10),
          total_aces: parseInt(player.total_aces as unknown as string, 10),
          skill_tier: getSkillTier(xp).key,
          skill_tier_progress: getSkillTierProgress(xp).pct,
          training_streak_days: streakDays,
        },
        training: {
          overall: {
            total_lessons: totalLessons,
            completed_lessons: parseInt(totals.completed_lessons, 10),
            pct_complete: totalLessons > 0 ? Math.round((parseInt(totals.completed_lessons, 10) / totalLessons) * 100) : 0,
          },
          categories: catRows.map((r) => ({
            category_id: (r as Record<string, string>).category_id,
            name: r.name,
            slug: r.slug,
            icon: r.icon,
            total_lessons: parseInt(r.total_lessons!, 10),
            completed_lessons: parseInt(r.completed_lessons!, 10),
            pct_complete: r.pct_complete ? parseInt(r.pct_complete, 10) : 0,
          })),
          next_lesson: nextLesson,
        },
        recent_rounds: recentRounds,
        next_level_xp: totalXpForLevel(level + 1),
      };
    },
  };
}

export type TrainingService = ReturnType<typeof createTrainingService>;
