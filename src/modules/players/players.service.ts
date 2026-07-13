// src/modules/players/players.service.ts — players business logic. Orchestrates
// the repo, login-streak service, and views; owns transactions via the injected db.

import { notFound, conflict } from '../../http/errors';
import { withTransaction } from '../../db/pool';
import type { Database } from '../../db/types';
import { getSkillTierProgress } from '../progression';
import { createPlayersRepo, RESETTABLE_TABLES, type PlayersRepo } from './players.repo';
import { applyLoginStreak } from './login-streak.service';
import { toMeResponse, toBadgesResponse, toProfileResponse } from './players.view';
import type { ProfileUpdate } from './players.validation';

export interface PlayersServiceDeps {
  db: Database;
  repo?: PlayersRepo;
}

function pct(visited: number, total: number): number {
  return total > 0 ? Math.round((visited / total) * 100) : 0;
}

export function createPlayersService({ db, repo = createPlayersRepo(db) }: PlayersServiceDeps) {
  return {
    async getMe(playerId: number) {
      const player = await repo.findFullById(playerId);
      if (!player) throw notFound('Player not found');

      const loginXp = await withTransaction(db, (client) => applyLoginStreak(client, repo, player));

      const [checkins, badgeCount, recentCheckins, training] = await Promise.all([
        repo.checkinStats(playerId),
        repo.badgeCount(playerId),
        repo.recentCheckins(playerId),
        repo.trainingSummary(playerId),
      ]);

      return toMeResponse(player, loginXp, checkins, training, badgeCount, recentCheckins);
    },

    async getBadges(playerId: number) {
      return toBadgesResponse(await repo.listEarnedBadges(playerId));
    },

    async getProgress(playerId: number) {
      const rows = await repo.progressByState(playerId);
      const states = rows.map((r) => {
        const visited = parseInt(r.visited, 10);
        const total = parseInt(r.total, 10);
        return { state: r.state, country: r.country, visited, total, pct: pct(visited, total) };
      });

      const countryMap = new Map<string, { country: string; visited: number; total: number }>();
      for (const s of states) {
        const c = countryMap.get(s.country) ?? { country: s.country, visited: 0, total: 0 };
        c.visited += s.visited;
        c.total += s.total;
        countryMap.set(s.country, c);
      }
      const countries = [...countryMap.values()]
        .map((c) => ({ ...c, pct: pct(c.visited, c.total) }))
        .sort((a, b) => b.visited - a.visited);

      const completed_states = states.filter((s) => s.total > 0 && s.visited === s.total).map((s) => s.state);
      const totalVisited = states.reduce((sum, s) => sum + s.visited, 0);
      const totalCourses = states.reduce((sum, s) => sum + s.total, 0);

      return {
        states,
        countries,
        completed_states,
        totals: { visited: totalVisited, total: totalCourses, pct: pct(totalVisited, totalCourses) },
        badges: await repo.explorationBadges(playerId),
      };
    },

    async getXpHistory(playerId: number, limit: number) {
      const [transactions, breakdown, trainingStreak, trainingStats, milestones] = await Promise.all([
        repo.xpTransactions(playerId, limit),
        repo.xpBreakdown(playerId),
        repo.trainingStreakRow(playerId),
        repo.trainingXpStats(playerId),
        repo.xpMilestones(playerId),
      ]);

      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const [weekly_xp, xp] = await Promise.all([repo.weeklyXp(playerId, weekStart.toISOString()), repo.playerXp(playerId)]);

      return {
        transactions,
        breakdown,
        training_streak: trainingStreak,
        training_stats: trainingStats,
        milestones,
        weekly_xp,
        skill_progress: getSkillTierProgress(xp),
      };
    },

    async updateProfile(playerId: number, input: ProfileUpdate) {
      const sets: string[] = [];
      const values: unknown[] = [];

      if (input.display_name !== undefined) {
        values.push(input.display_name);
        sets.push(`display_name = $${values.length}`);
      }
      if (input.username !== undefined) {
        if (await repo.usernameTaken(playerId, input.username)) {
          throw conflict('That username is already taken');
        }
        values.push(input.username);
        sets.push(`username = $${values.length}`);
      }

      return toProfileResponse(await repo.updateProfile(playerId, sets, values));
    },

    async resetProgress(playerId: number) {
      return withTransaction(db, async (client) => {
        for (const table of RESETTABLE_TABLES) {
          await repo.deleteFromTable(client, table, playerId);
        }
        await repo.resetPlayerStats(client, playerId);

        const verification: Record<string, number> = {};
        for (const table of RESETTABLE_TABLES) {
          verification[table] = await repo.countTable(client, table, playerId);
        }

        return {
          success: true,
          message: 'Progress reset complete',
          verification: { ...verification, player: { xp: 0, gold: 0, level: 1 } },
        };
      });
    },
  };
}

export type PlayersService = ReturnType<typeof createPlayersService>;
