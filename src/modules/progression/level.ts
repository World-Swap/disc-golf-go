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

// ONE vocabulary, keyed on XP.
//
// There used to be two. SKILL_TIERS called you Pro at 5,000 XP; LEVEL_TITLES
// called you Pro at level 25 = 75,000 XP -- a 15x gap -- and profile.html
// printed both on the same line, so a player on 5,000 XP read "Pro · Amateur".
//
// The bands below keep the OLD SKILL_TIERS thresholds, which are the reachable
// ones, so no existing player is demoted by the merge; Legend and GOAT are new
// headroom above a Pro band that previously ran to 99,999. getTitleForXp now
// derives from this same table, so the two names cannot disagree again.
//
// These thresholds are deliberately NOT retuned here. The XP economy is badly
// scaled (the entire 134-lesson library is worth 1,920 XP, the same as one
// capped day of Throw Lab) and retuning the bands belongs with that rebalance,
// not with a bug fix.
export const SKILL_TIERS: SkillTier[] = [
  { key: 'rookie', title: 'Rookie', minXp: 0, maxXp: 499, icon: '🥏', color: '#6a7a6a', desc: 'New to disc golf' },
  { key: 'player', title: 'Player', minXp: 500, maxXp: 1999, icon: '⛳', color: '#4cdf3c', desc: 'Can play competently' },
  { key: 'advanced', title: 'Advanced', minXp: 2000, maxXp: 4999, icon: '🎯', color: '#ffd050', desc: 'Consistent player' },
  { key: 'pro', title: 'Pro', minXp: 5000, maxXp: 14999, icon: '🥇', color: '#ff7070', desc: 'Tournament-level' },
  { key: 'legend', title: 'Legend', minXp: 15000, maxXp: 49999, icon: '👑', color: '#c9a227', desc: 'Long-haul regular' },
  { key: 'goat', title: 'GOAT', minXp: 50000, maxXp: Number.MAX_SAFE_INTEGER, icon: '🐐', color: '#8a6bd1', desc: 'Been here forever' },
];

/**
 * The player's title. It is a function of XP, NOT of level.
 *
 * Deriving it from the level does not work and the first version of this fix got
 * it wrong: band edges (500, 2,000, 5,000 XP) do not line up with level edges
 * (250, 750, 1,500 XP), so a title taken from the level disagrees with the tier
 * taken from the XP for every player sitting between the two. `vocabulary.test`
 * caught it at xp=500 — level 2, whose start is 250 XP, is still Rookie while
 * the player is already Player.
 */
export function getTitleForXp(xp: number): LevelTitle {
  const t = getSkillTier(xp);
  return { title: t.title, icon: t.icon };
}

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
