// src/modules/leaderboard/leaderboard.service.ts — ranking logic. Resolves the
// current player (via req.player.id), builds ranked lists, and appends the
// player's own row when they fall outside the top slice.

import { getSkillTier } from '../progression';
import { createLeaderboardRepo, type LeaderboardRepo, type SortCol, type Interval } from './leaderboard.repo';
import type { Queryable } from '../../db/types';

const TABS = ['overall', 'lessons', 'streak', 'challenges'] as const;
const PERIODS = ['alltime', 'week', 'month'] as const;
type Tab = (typeof TABS)[number];
type Period = (typeof PERIODS)[number];

const SORT_COL: Record<Tab, SortCol> = {
  overall: 'total_xp',
  lessons: 'lessons_completed',
  streak: 'current_streak',
  challenges: 'challenges_won',
};

function rankTier(rank: number): 'gold' | 'silver' | 'bronze' | null {
  if (rank <= 3) return 'gold';
  if (rank <= 10) return 'silver';
  if (rank <= 30) return 'bronze';
  return null;
}

export function createLeaderboardService(db: Queryable, repo: LeaderboardRepo = createLeaderboardRepo(db)) {
  return {
    async top5(currentPlayerId: number | null) {
      const rows = await repo.top5();
      const players = rows.map((p, i) => {
        const tier = getSkillTier(Number(p.xp) || 0);
        return {
          rank: i + 1,
          id: p.id,
          display_name: p.display_name || p.username || 'Player',
          username: p.username,
          xp: Number(p.xp) || 0,
          level: p.level,
          skill_tier: tier.key,
          skill_tier_icon: tier.icon,
          skill_tier_color: tier.color,
          is_me: currentPlayerId != null && Number(p.id) === Number(currentPlayerId),
        };
      });

      let my_rank = null;
      if (currentPlayerId && !players.some((p) => p.is_me)) {
        const me = await repo.playerById(currentPlayerId);
        if (me) {
          my_rank = {
            rank: await repo.rankByXp(me.xp),
            id: me.id,
            display_name: me.display_name || me.username || 'You',
            username: me.username,
            xp: Number(me.xp) || 0,
            level: me.level,
            skill_tier: getSkillTier(Number(me.xp) || 0).key,
            is_me: true,
          };
        }
      }
      return { players, my_rank };
    },

    async leaderboard(tabRaw: unknown, periodRaw: unknown, currentPlayerId: number | null) {
      const tab: Tab = TABS.includes(tabRaw as Tab) ? (tabRaw as Tab) : 'overall';
      const period: Period = PERIODS.includes(periodRaw as Period) ? (periodRaw as Period) : 'alltime';
      const sortCol = SORT_COL[tab];
      const interval: Interval = period === 'week' ? '7 days' : '30 days';

      const rows = period === 'alltime' ? await repo.alltimeEntries(sortCol) : await repo.periodEntries(interval, sortCol);

      const ranked = rows.map((r, i) => ({
        ...r,
        rank: i + 1,
        rank_tier: rankTier(i + 1),
        is_me: currentPlayerId != null && Number(r.id) === Number(currentPlayerId),
      }));

      if (currentPlayerId && !ranked.some((r) => r.is_me)) {
        const myRow =
          period === 'alltime'
            ? await repo.alltimePlayerEntry(currentPlayerId, sortCol)
            : await repo.periodPlayerEntry(currentPlayerId, interval, sortCol);
        if (myRow) {
          const rank = period === 'alltime' ? await repo.alltimeRank(sortCol, myRow.stat_value || 0) : ranked.length + 1;
          ranked.push({ ...myRow, rank, rank_tier: rankTier(rank), is_me: true, out_of_top: true } as (typeof ranked)[number]);
        }
      }

      return { tab, period, players: ranked };
    },

    async crewsTraining(currentPlayerId: number | null) {
      const rows = await repo.crewsTraining();
      const ranked = rows.map((c, i) => ({
        rank: i + 1,
        id: c.id,
        name: c.name,
        logo_url: c.logo_url,
        member_count: c.member_count,
        training_xp: c.training_xp,
        lessons_completed: c.lessons_completed,
        is_me: false,
      }));

      if (currentPlayerId) {
        const myCrewId = await repo.myCrewId(currentPlayerId);
        if (myCrewId != null) {
          const idx = ranked.findIndex((c) => c.id === myCrewId);
          if (idx !== -1) ranked[idx]!.is_me = true;
        }
      }

      return { category: 'crew_training', crews: ranked };
    },
  };
}

export type LeaderboardService = ReturnType<typeof createLeaderboardService>;
