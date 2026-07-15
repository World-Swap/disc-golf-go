// src/modules/players/players.view.ts — shape player data into API payloads.

import {
  getLevelFromXp,
  getLevelProgress,
  getLevelTitle,
  getSkillTier,
  getSkillTierProgress,
  BADGE_DEFINITIONS,
  BADGE_TIERS,
  TIER_COLORS,
  type BadgeCategory,
} from '../progression';
import type { PlayerFullRow } from './players.repo';
import type { LoginXpGrant } from './login-streak.service';

interface TrainingSummary {
  lessons_completed: number;
  total_lessons: number;
  training_streak_days: number;
  categories_mastered: number;
}

export function toMeResponse(
  p: PlayerFullRow,
  loginXp: LoginXpGrant | null,
  checkins: { total_checkins: number; unique_courses: number },
  training: TrainingSummary,
  badgeCount: number,
  recentCheckins: unknown[]
) {
  const level = getLevelFromXp(p.xp);
  const levelTitle = getLevelTitle(level);

  return {
    id: p.id,
    display_name: p.display_name,
    username: p.username,
    email: p.email,
    profile_photo_url: p.profile_photo_url,
    xp: p.xp,
    level,
    level_title: levelTitle.title,
    level_title_icon: levelTitle.icon,
    level_progress: getLevelProgress(p.xp),
    skill_tier: getSkillTier(p.xp),
    skill_tier_progress: getSkillTierProgress(p.xp),
    gold: p.gold ?? 0,
    login_streak: p.login_streak,
    best_streak: p.best_streak,
    battle_wins: p.battle_wins ?? 0,
    battle_losses: p.battle_losses ?? 0,
    win_streak: p.win_streak ?? 0,
    total_rounds: p.total_rounds ?? 0,
    created_at: p.created_at,
    login_xp: loginXp,
    badge_count: badgeCount,
    training_stats: training,
    stats: {
      total_checkins: checkins.total_checkins,
      unique_courses: checkins.unique_courses,
      total_rounds: p.total_rounds ?? 0,
      battle_wins: p.battle_wins ?? 0,
      total_birdies: p.total_birdies ?? 0,
      total_aces: p.total_aces ?? 0,
      login_streak: p.login_streak,
      best_streak: p.best_streak,
      lessons_completed: training.lessons_completed,
      training_streak_days: training.training_streak_days,
      categories_mastered: training.categories_mastered,
    },
    recent_checkins: recentCheckins,
  };
}

export function toBadgesResponse(earned: Array<{ category: string; tier: string; earned_at: Date }>) {
  const earnedMap = new Map<string, Date>();
  for (const row of earned) earnedMap.set(`${row.category}:${row.tier}`, row.earned_at);

  const categories = (Object.keys(BADGE_DEFINITIONS) as BadgeCategory[]).map((category) => {
    const def = BADGE_DEFINITIONS[category];
    return {
      category,
      name: def.name,
      icon: def.icon,
      description: def.description,
      tiers: BADGE_TIERS.map((tier) => {
        const key = `${category}:${tier}`;
        return {
          tier,
          ...def.tiers[tier],
          earned: earnedMap.has(key),
          earned_at: earnedMap.get(key) ?? null,
          colors: TIER_COLORS[tier],
        };
      }),
    };
  });

  return { categories };
}

export function toProfileResponse(p: {
  id: number;
  display_name: string;
  username: string | null;
  email: string | null;
  profile_photo_url: string | null;
  xp: number;
}) {
  const level = getLevelFromXp(p.xp);
  return {
    id: p.id,
    display_name: p.display_name,
    username: p.username,
    email: p.email,
    profile_photo_url: p.profile_photo_url,
    xp: p.xp,
    level,
    level_progress: getLevelProgress(p.xp),
    level_title: getLevelTitle(level).title,
  };
}
