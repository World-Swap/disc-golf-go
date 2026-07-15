// src/modules/players/login-streak.service.ts — daily login-streak update +
// streak badge grants, run inside GET /players/me's transaction. Mutates the
// passed player row (login_streak/best_streak/xp) and returns any streak XP.

import type { PoolClient } from 'pg';
import { grantXp, grantGold, evaluateBadges, type BadgeStats, type XpEvent } from '../progression';
import type { PlayersRepo, PlayerFullRow } from './players.repo';

const STREAK_EVENTS: Record<number, XpEvent> = {
  3: 'login_streak_3',
  7: 'login_streak_7',
  14: 'login_streak_14',
  30: 'login_streak_30',
};

const ZERO_BADGE_STATS: BadgeStats = {
  battleWins: 0, bestStreak: 0, challengesCompleted: 0, completedCities: 0, completedStates: 0,
  maxSameCourseVisits: 0, morningCheckins: 0, nightCheckins: 0, seasonsPlayed: 0, totalRounds: 0,
  trailblazerCourses: 0, uniqueCourses: 0, uniqueOpponents: 0, uniqueStates: 0, weatherCheckins: 0, weekendRounds: 0,
};

export interface LoginXpGrant {
  event: XpEvent;
  amount: number;
  newXp: number;
  streak: number;
}

function dayString(d: Date): string {
  return d.toISOString().split('T')[0]!;
}

export async function applyLoginStreak(
  client: PoolClient,
  repo: PlayersRepo,
  p: PlayerFullRow
): Promise<LoginXpGrant | null> {
  const today = dayString(new Date());
  const lastLogin = p.last_login_date ? dayString(new Date(p.last_login_date)) : null;
  if (lastLogin === today) return null;

  const yesterday = dayString(new Date(Date.now() - 86_400_000));
  const newStreak = lastLogin === yesterday ? (p.login_streak ?? 0) + 1 : 1;
  const newBest = Math.max(newStreak, p.best_streak ?? 0);

  await repo.updateLoginStreak(client, p.id, today, newStreak, newBest);
  p.login_streak = newStreak;
  p.best_streak = newBest;

  const event = STREAK_EVENTS[newStreak];
  if (!event) return null;

  const grant = await grantXp(client, p.id, event, { streak: newStreak });
  p.xp = grant.newXp;

  // Streak badges — non-fatal; a badge/gold failure must not break login.
  try {
    const stats: BadgeStats = {
      ...ZERO_BADGE_STATS,
      totalRounds: p.total_rounds ?? 0,
      battleWins: p.battle_wins ?? 0,
      bestStreak: newBest,
    };
    const existing = await repo.earnedBadgeKeys(client, p.id);
    for (const badge of evaluateBadges(stats, existing)) {
      await repo.insertBadge(client, p.id, badge.category, badge.tier);
      try {
        await client.query('SAVEPOINT badge_gold');
        await grantGold(client, p.id, 'badge_unlock', { category: badge.category, tier: badge.tier });
        await client.query('RELEASE SAVEPOINT badge_gold');
      } catch {
        try {
          await client.query('ROLLBACK TO SAVEPOINT badge_gold');
        } catch {
          /* ignore */
        }
      }
    }
  } catch (err) {
    console.error('[login-streak] badge evaluation error:', (err as Error).message);
  }

  return { event, amount: grant.amount, newXp: grant.newXp, streak: newStreak };
}
