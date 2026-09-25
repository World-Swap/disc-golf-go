// src/modules/game/game.service.ts — submitting a Throw Lab round: validate
// what the client claims, record it, pay XP through the existing progression
// system, and settle any challenge the round just finished.
//
// The client simulates the physics, so nothing it sends can be trusted on its
// own. Two defences: the shape of a round is validated hole by hole (a score
// has to be internally consistent and humanly possible), and only the first
// DAILY_XP_ROUNDS rounds each day pay XP, which bounds what a scripted client
// could ever earn.

import type { PoolClient } from 'pg';
import { withTransaction } from '../../db/pool';
import { badRequest } from '../../http/errors';
import type { Database } from '../../db/types';
import { grantXp, grantGold, evaluateBadges, type EarnedBadge, type XpEvent, type GoldEvent } from '../progression';
import { GAME_CHALLENGES, PERIOD_REWARD, periodKey, periodStart, type Period, type GameChallenge } from './game.catalog';
import type { GameRepo, PeriodMetrics } from './game.repo';

export const VALID_HOLES = [3, 6, 9, 18];
export const DAILY_XP_ROUNDS = 12;
const MAX_STROKES_PER_HOLE = 20;

export interface HoleResult { par: number; strokes: number }

export interface SubmitInput {
  mode: 'quick' | 'course';
  courseId: number | null;
  holes: HoleResult[];
}

const PERIODS: Period[] = ['daily', 'weekly', 'monthly', 'lifetime'];

// Per-round XP by length, so an 18-hole round is worth more than six 3-hole ones.
const ROUND_XP_EVENT: Record<number, XpEvent> = {
  3: 'game_round_3', 6: 'game_round_6', 9: 'game_round_9', 18: 'game_round_18',
};

export interface GameDeps {
  db: Database;
  repo: GameRepo;
  badgeStats: (client: PoolClient, playerId: number) => Promise<Record<string, number>>;
  existingBadges: (client: PoolClient, playerId: number) => Promise<Set<string>>;
  saveBadge: (client: PoolClient, playerId: number, badge: EarnedBadge) => Promise<void>;
}

export function createGameService(deps: GameDeps) {
  const { db, repo } = deps;

  /** Reject anything that isn't a shape a real round could have. */
  function parse(input: SubmitInput) {
    const holes = Array.isArray(input.holes) ? input.holes : [];
    if (!VALID_HOLES.includes(holes.length)) {
      throw badRequest('A round must be ' + VALID_HOLES.join(', ') + ' holes');
    }
    let par = 0, strokes = 0, birdies = 0, eagles = 0, aces = 0;
    for (const h of holes) {
      const p = Math.round(Number(h?.par));
      const s = Math.round(Number(h?.strokes));
      if (!Number.isFinite(p) || p < 2 || p > 6) throw badRequest('Each hole must be par 2 to 6');
      if (!Number.isFinite(s) || s < 1 || s > MAX_STROKES_PER_HOLE) {
        throw badRequest('Each hole must be 1 to ' + MAX_STROKES_PER_HOLE + ' throws');
      }
      par += p; strokes += s;
      const diff = s - p;
      if (s === 1) aces++;
      if (diff <= -2) eagles++;
      else if (diff === -1) birdies++;
    }
    const mode: 'quick' | 'course' = input.mode === 'course' ? 'course' : 'quick';
    // Number(null) is 0, so a missing course_id would otherwise pass as
    // course zero and land a round against a course that doesn't exist.
    const raw = input.courseId == null ? NaN : Math.round(Number(input.courseId));
    const courseId = Number.isFinite(raw) && raw > 0 ? raw : null;
    if (mode === 'course' && courseId === null) throw badRequest('A course round needs a course_id');
    return { mode, courseId, holes: holes.length, par, strokes, vsPar: strokes - par, birdies, eagles, aces };
  }

  function progressFor(c: GameChallenge, m: PeriodMetrics): number {
    if (c.metric === 'best_round') return m.best_round != null && m.best_round <= -c.target ? 1 : 0;
    return m[c.metric] ?? 0;
  }

  return {
    async submit(playerId: number, input: SubmitInput) {
      const round = parse(input);

      return withTransaction(db, async (client) => {
        // XP is capped per day; beyond the cap a round still counts towards
        // challenges and the record, it just stops paying.
        const paidToday = await repo.xpRoundsToday(client, playerId);
        const payXp = paidToday < DAILY_XP_ROUNDS;

        const xpBreakdown: Array<{ event: string; amount: number; label: string }> = [];
        let totalXp = 0;
        let newLevel = 0;
        let leveledUp = false;

        if (payXp) {
          const ev = ROUND_XP_EVENT[round.holes]!;
          const before = await grantXp(client, playerId, ev, { holes: round.holes, vs_par: round.vsPar });
          totalXp += before.amount; newLevel = before.newLevel;
          xpBreakdown.push({ event: ev, amount: before.amount, label: `${round.holes}-hole round` });

          if (round.vsPar < 0) {
            const bonus = await grantXp(client, playerId, 'game_under_par', { vs_par: round.vsPar });
            totalXp += bonus.amount; newLevel = bonus.newLevel;
            xpBreakdown.push({ event: 'game_under_par', amount: bonus.amount, label: 'Under par' });
          }
        }

        const saved = await repo.insertRound(client, playerId, round, totalXp);

        // Challenges settle after the round is recorded, so the round counts
        // towards the very challenge it completes.
        const completed = await settleChallenges(client, playerId);
        for (const c of completed) { totalXp += c.xp; newLevel = c.newLevel || newLevel; }

        const badges = await awardBadges(client, playerId);

        return {
          round: { id: saved.id, ...round, created_at: saved.created_at },
          xp_earned: totalXp,
          xp_breakdown: xpBreakdown,
          xp_capped: !payXp,
          daily_xp_rounds_left: Math.max(0, DAILY_XP_ROUNDS - paidToday - (payXp ? 1 : 0)),
          level: newLevel || undefined,
          leveled_up: leveledUp,
          challenges_completed: completed.map((c) => ({ key: c.key, title: c.title, period: c.period, xp: c.xp, gold: c.gold })),
          new_badges: badges,
        };
      });
    },

    /** Every challenge with its live progress, grouped by period. */
    async challenges(playerId: number) {
      const now = new Date();
      const metrics: Partial<Record<Period, PeriodMetrics>> = {};
      for (const p of PERIODS) metrics[p] = await repo.metrics(db, playerId, periodStart(p, now));
      const keys = PERIODS.map((p) => periodKey(p, now));
      const done = await repo.completedKeys(db, playerId, keys);

      const out: Record<string, unknown[]> = { daily: [], weekly: [], monthly: [], lifetime: [] };
      for (const c of GAME_CHALLENGES) {
        const pk = periodKey(c.period, now);
        const progress = progressFor(c, metrics[c.period]!);
        out[c.period]!.push({
          key: c.key, title: c.title, description: c.description, period: c.period,
          target: c.target,
          progress: Math.min(progress, c.target),
          completed: done.has(`${c.key}:${pk}`) || progress >= c.target,
          reward_xp: XP_AMOUNT(PERIOD_REWARD[c.period].xp),
          reward_gold: GOLD_AMOUNT(PERIOD_REWARD[c.period].gold),
        });
      }
      return out;
    },

    async stats(playerId: number) {
      const now = new Date();
      const [lifetime, daily] = await Promise.all([
        repo.metrics(db, playerId, null),
        repo.metrics(db, playerId, periodStart('daily', now)),
      ]);
      return {
        lifetime,
        today: daily,
        challenges_completed: await repo.completedCount(playerId),
        recent: await repo.recentRounds(playerId, 5),
        daily_xp_rounds_left: Math.max(0, DAILY_XP_ROUNDS - (await xpRoundsTodayRead(playerId))),
      };
    },

    async leaderboard(periodRaw: unknown, limit = 25) {
      const period: Period = PERIODS.includes(periodRaw as Period) ? (periodRaw as Period) : 'weekly';
      const rows = await repo.leaderboard(periodStart(period, new Date()), Math.min(Math.max(limit, 1), 100));
      return {
        board: 'game',
        period,
        players: rows.map((r, i) => ({ rank: i + 1, ...(r as Record<string, unknown>) })),
      };
    },
  };

  // Read-only variant of the daily count, outside a transaction.
  async function xpRoundsTodayRead(playerId: number): Promise<number> {
    const r = await db.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM game_rounds
       WHERE player_id = $1 AND xp_awarded > 0 AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')`,
      [playerId]
    );
    return parseInt(r.rows[0]?.cnt ?? '0', 10);
  }

  /** Pay out every challenge whose target the player has now reached. */
  async function settleChallenges(client: PoolClient, playerId: number) {
    const now = new Date();
    const out: Array<{ key: string; title: string; period: Period; xp: number; gold: number; newLevel: number }> = [];

    for (const period of PERIODS) {
      const m = await repo.metrics(client, playerId, periodStart(period, now));
      const pk = periodKey(period, now);
      for (const c of GAME_CHALLENGES) {
        if (c.period !== period) continue;
        if (progressFor(c, m) < c.target) continue;

        const reward = PERIOD_REWARD[period];
        const xpAmount = XP_AMOUNT(reward.xp);
        const goldAmount = GOLD_AMOUNT(reward.gold);
        // The unique index makes this the single point of truth for "already paid".
        if (!(await repo.claim(client, playerId, c.key, period, pk, xpAmount, goldAmount))) continue;

        const xp = await grantXp(client, playerId, reward.xp as XpEvent, { challenge: c.key });
        await grantGold(client, playerId, reward.gold as GoldEvent, { challenge: c.key });
        out.push({ key: c.key, title: c.title, period, xp: xp.amount, gold: goldAmount, newLevel: xp.newLevel });
      }
    }
    return out;
  }

  async function awardBadges(client: PoolClient, playerId: number): Promise<EarnedBadge[]> {
    const stats = await deps.badgeStats(client, playerId);
    const existing = await deps.existingBadges(client, playerId);
    const earned = evaluateBadges(stats as never, existing);
    for (const b of earned) await deps.saveBadge(client, playerId, b);
    return earned;
  }
}

// The frozen reward tables, read through helpers so the amounts live in one place.
import { XP_EVENTS, GOLD_EVENTS } from '../progression/events';
function XP_AMOUNT(e: string): number { return (XP_EVENTS as Record<string, number>)[e] ?? 0; }
function GOLD_AMOUNT(e: string): number { return (GOLD_EVENTS as Record<string, number>)[e] ?? 0; }

export type GameService = ReturnType<typeof createGameService>;
