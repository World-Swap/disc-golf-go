// src/modules/progression/level.ts — player leveling + skill-tier math.
// Pure functions, no DB. Ported from the legacy xp-engine leveling curve:
//   TOTAL_XP_FOR_LEVEL(n) = 125 * n * (n - 1)   (level 1 = 0, level 4 = 1,500)

export interface LevelProgress {
  level: number;
  progress: number;
  needed: number;
  percent: number;
}

export interface LevelTitle {
  title: string;
  icon: string;
}

export interface SkillTier {
  key: string;
  title: string;
  minXp: number;
  maxXp: number;
  icon: string;
  color: string;
  desc: string;
}

export interface SkillTierProgress extends SkillTier {
  currentXp: number;
  tierXp: number;
  tierXpNeeded: number;
  pct: number;
}

export function totalXpForLevel(n: number): number {
  if (n <= 1) return 0;
  return 125 * n * (n - 1);
}

export function getLevelFromXp(xp: number): number {
  let low = 1;
  let high = 500;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (totalXpForLevel(mid) <= xp) low = mid;
    else high = mid - 1;
  }
  return low;
}

export function getLevelProgress(xp: number): LevelProgress {
  const level = getLevelFromXp(xp);
  const currentLevelXp = totalXpForLevel(level);
  const nextLevelXp = totalXpForLevel(level + 1);
  const progress = xp - currentLevelXp;
  const needed = nextLevelXp - currentLevelXp;
  return { level, progress, needed, percent: Math.min(100, Math.round((progress / needed) * 100)) };
}

const LEVEL_TITLES: Array<LevelTitle & { minLevel: number; maxLevel: number }> = [
  { minLevel: 1, maxLevel: 4, title: 'Rookie', icon: '🥏' },
  { minLevel: 5, maxLevel: 9, title: 'Amateur', icon: '⛳' },
  { minLevel: 10, maxLevel: 14, title: 'Intermediate', icon: '🎯' },
  { minLevel: 15, maxLevel: 24, title: 'Advanced', icon: '🏅' },
  { minLevel: 25, maxLevel: 39, title: 'Pro', icon: '🥇' },
  { minLevel: 40, maxLevel: 59, title: 'Legend', icon: '👑' },
  { minLevel: 60, maxLevel: 999, title: 'GOAT', icon: '🐐' },
];

export function getLevelTitle(level: number): LevelTitle {
  const t = LEVEL_TITLES.find((x) => level >= x.minLevel && level <= x.maxLevel) ?? LEVEL_TITLES[0]!;
  return { title: t.title, icon: t.icon };
}

export const SKILL_TIERS: SkillTier[] = [
  { key: 'rookie', title: 'Rookie', minXp: 0, maxXp: 499, icon: '🥏', color: '#6a7a6a', desc: 'New to disc golf' },
  { key: 'player', title: 'Player', minXp: 500, maxXp: 1999, icon: '⛳', color: '#4cdf3c', desc: 'Can play competently' },
  { key: 'advanced', title: 'Advanced', minXp: 2000, maxXp: 4999, icon: '🎯', color: '#ffd050', desc: 'Consistent player' },
  { key: 'pro', title: 'Pro', minXp: 5000, maxXp: 99999, icon: '🥇', color: '#ff7070', desc: 'Tournament-level' },
];

export function getSkillTier(xp: number): SkillTier {
  for (let i = SKILL_TIERS.length - 1; i >= 0; i--) {
    if (xp >= SKILL_TIERS[i]!.minXp) return SKILL_TIERS[i]!;
  }
  return SKILL_TIERS[0]!;
}

export function getSkillTierProgress(xp: number): SkillTierProgress {
  const tier = getSkillTier(xp);
  const base = tier.minXp;
  const range = tier.maxXp - tier.minXp + 1;
  const progress = Math.min(xp - base, range);
  return {
    ...tier,
    currentXp: xp,
    tierXp: progress,
    tierXpNeeded: range,
    pct: Math.min(100, Math.round((progress / range) * 100)),
  };
}
