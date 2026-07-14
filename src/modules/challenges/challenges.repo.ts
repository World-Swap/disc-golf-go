// src/modules/challenges/challenges.repo.ts — data access for challenges:
// rotating slots, permanent challenges, and the per-type progress computers.

import type { PoolClient } from 'pg';
import type { Queryable, Database } from '../../db/types';

export interface PeriodBounds {
  start: Date;
  end: Date;
}

interface SlotRow {
  challenge_type: string;
  period_start: Date;
  period_end: Date;
  target_value: number;
}

export function createChallengesRepo(db: Database) {
  return {
    async slotCountForPeriod(cadence: string, start: Date): Promise<number> {
      const r = await db.query<{ cnt: string }>('SELECT COUNT(*) as cnt FROM active_challenge_slots WHERE cadence = $1 AND period_start = $2', [cadence, start]);
      return parseInt(r.rows[0]!.cnt, 10);
    },

    async poolChallenges(cadence: string, count: number) {
      const r = await db.query<{ id: number }>('SELECT id FROM challenges WHERE cadence = $1 AND is_pool_member = TRUE ORDER BY RANDOM() LIMIT $2', [cadence, count]);
      return r.rows;
    },

    async insertSlot(challengeId: number, cadence: string, start: Date, end: Date) {
      await db.query(
        `INSERT INTO active_challenge_slots (challenge_id, cadence, period_start, period_end) VALUES ($1, $2, $3, $4)
         ON CONFLICT (challenge_id, period_start) DO NOTHING`,
        [challengeId, cadence, start, end]
      );
    },

    async activeSlots(playerId: number, now: Date) {
      const r = await db.query(
        `SELECT acs.id as slot_id, acs.cadence, acs.period_start, acs.period_end,
                ch.id as challenge_id, ch.slug, ch.title, ch.description, ch.difficulty,
                ch.challenge_type, ch.target_value, ch.xp_reward,
                pcs.progress, pcs.completed, pcs.completed_at, pcs.claimed, pcs.claimed_at
         FROM active_challenge_slots acs
         JOIN challenges ch ON ch.id = acs.challenge_id
         LEFT JOIN player_challenge_slots pcs ON pcs.slot_id = acs.id AND pcs.player_id = $1
         WHERE acs.period_start <= $2 AND acs.period_end > $2
         ORDER BY acs.cadence, ch.difficulty ASC`,
        [playerId, now]
      );
      return r.rows as Array<Record<string, unknown> & { slot_id: number; cadence: string; challenge_type: string; target_value: number; period_start: Date; period_end: Date }>;
    },

    async permanentChallenges(playerId: number, today: string) {
      const r = await db.query(
        `SELECT ch.id, ch.slug, ch.title, ch.description, ch.difficulty, ch.challenge_type, ch.target_value, ch.xp_reward,
                ch.course_id, co.name AS course_name, co.city AS course_city,
                pc.progress, pc.completed, pc.completed_at, pc.claimed, pc.claimed_at
         FROM challenges ch
         LEFT JOIN courses co ON co.id = ch.course_id
         LEFT JOIN player_challenges pc ON pc.challenge_id = ch.id AND pc.player_id = $1
         WHERE ch.cadence = 'permanent' AND (ch.active_until IS NULL OR ch.active_until >= $2)
         ORDER BY ch.difficulty ASC, ch.slug ASC`,
        [playerId, today]
      );
      return r.rows;
    },

    async listPermanent(playerId: number, today: string) {
      const r = await db.query(
        `SELECT ch.id, ch.slug, ch.title, ch.description, ch.difficulty, ch.challenge_type, ch.target_value, ch.xp_reward,
                ch.is_rotating, ch.active_from, ch.active_until,
                ch.course_id, co.name AS course_name, co.city AS course_city,
                pc.progress, pc.completed, pc.completed_at
         FROM challenges ch
         LEFT JOIN courses co ON co.id = ch.course_id
         LEFT JOIN player_challenges pc ON pc.challenge_id = ch.id AND pc.player_id = $1
         WHERE (ch.active_until IS NULL OR ch.active_until >= $2) AND ch.cadence = 'permanent'
         ORDER BY ch.difficulty ASC, ch.slug ASC`,
        [playerId, today]
      );
      return r.rows;
    },

    async upsertSlotProgress(playerId: number, slotId: number, progress: number, completed: boolean) {
      await db.query(
        `INSERT INTO player_challenge_slots (player_id, slot_id, progress, completed, completed_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (player_id, slot_id) DO UPDATE
           SET progress = EXCLUDED.progress,
               completed = CASE WHEN EXCLUDED.completed THEN TRUE ELSE player_challenge_slots.completed END,
               completed_at = CASE WHEN EXCLUDED.completed AND player_challenge_slots.completed_at IS NULL THEN NOW() ELSE player_challenge_slots.completed_at END`,
        [playerId, slotId, progress, completed, completed ? new Date() : null]
      );
    },

    async leaderboard() {
      const r = await db.query(
        `SELECT p.id, p.display_name, p.level, p.xp,
                (COALESCE((SELECT COUNT(*) FROM player_challenges pc WHERE pc.player_id = p.id AND pc.completed = TRUE), 0)
                 + COALESCE((SELECT COUNT(*) FROM player_challenge_slots pcs WHERE pcs.player_id = p.id AND pcs.completed = TRUE), 0)) AS challenges_completed
         FROM players p ORDER BY challenges_completed DESC, p.xp DESC LIMIT 50`
      );
      return r.rows;
    },

    // ── claim (transaction) ──
    async loadSlot(client: PoolClient, slotId: number) {
      const r = await client.query(
        `SELECT acs.*, ch.difficulty, ch.slug, ch.xp_reward, ch.challenge_type, ch.target_value
         FROM active_challenge_slots acs JOIN challenges ch ON ch.id = acs.challenge_id WHERE acs.id = $1`,
        [slotId]
      );
      return r.rows[0] ?? null;
    },

    async slotProgress(client: PoolClient, playerId: number, slotId: number) {
      const r = await client.query<{ completed: boolean; claimed: boolean }>('SELECT * FROM player_challenge_slots WHERE player_id = $1 AND slot_id = $2', [playerId, slotId]);
      return r.rows[0] ?? null;
    },

    async markSlotClaimed(client: PoolClient, playerId: number, slotId: number) {
      await client.query('UPDATE player_challenge_slots SET claimed = TRUE, claimed_at = NOW() WHERE player_id = $1 AND slot_id = $2', [playerId, slotId]);
    },

    async totalCompletedForBadges(client: PoolClient, playerId: number): Promise<number> {
      const r = await client.query<{ total_completed: string }>(
        `SELECT (SELECT COUNT(*) FROM player_challenges WHERE player_id = $1 AND completed = TRUE)
              + (SELECT COUNT(*) FROM player_challenge_slots WHERE player_id = $1 AND completed = TRUE) AS total_completed`,
        [playerId]
      );
      return parseInt(r.rows[0]!.total_completed, 10);
    },

    async permanentCompletedCount(client: PoolClient, playerId: number): Promise<number> {
      const r = await client.query<{ cnt: string }>('SELECT COUNT(*) as cnt FROM player_challenges WHERE player_id = $1 AND completed = TRUE', [playerId]);
      return parseInt(r.rows[0]!.cnt, 10);
    },

    async earnedBadgeKeys(client: PoolClient, playerId: number): Promise<Set<string>> {
      const r = await client.query<{ category: string; tier: string }>('SELECT category, tier FROM player_badges WHERE player_id = $1', [playerId]);
      return new Set(r.rows.map((row) => `${row.category}:${row.tier}`));
    },

    async insertBadge(client: PoolClient, playerId: number, category: string, tier: string) {
      await client.query('INSERT INTO player_badges (player_id, category, tier) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [playerId, category, tier]);
    },

    async randomItemByRarity(rarity: string) {
      const r = await db.query<{ id: number; name: string; icon: string | null; rarity: string; description: string | null }>('SELECT * FROM vault_items WHERE rarity = $1 ORDER BY RANDOM() LIMIT 1', [rarity]);
      return r.rows[0] ?? null;
    },

    async playerGold(client: PoolClient, playerId: number): Promise<number> {
      const r = await client.query<{ gold: number }>('SELECT gold FROM players WHERE id = $1', [playerId]);
      return r.rows[0]!.gold;
    },

    // ── permanent progress sync (transaction) ──
    async loadChallenge(client: PoolClient, challengeId: number) {
      const r = await client.query('SELECT * FROM challenges WHERE id = $1', [challengeId]);
      return r.rows[0] ?? null;
    },

    async playerChallenge(client: PoolClient, playerId: number, challengeId: number) {
      const r = await client.query<{ id: number; progress: number; completed: boolean }>('SELECT id, progress, completed FROM player_challenges WHERE player_id = $1 AND challenge_id = $2', [playerId, challengeId]);
      return r.rows[0] ?? null;
    },

    async insertPlayerChallenge(client: PoolClient, playerId: number, challengeId: number, progress: number, completed: boolean) {
      await client.query(
        `INSERT INTO player_challenges (player_id, challenge_id, progress, completed, completed_at) VALUES ($1, $2, $3, $4, $5)`,
        [playerId, challengeId, progress, completed, completed ? new Date() : null]
      );
    },

    async updatePlayerChallenge(client: PoolClient, playerId: number, challengeId: number, progress: number, completed: boolean) {
      await client.query(
        `UPDATE player_challenges SET progress = $3, completed = $4,
           completed_at = CASE WHEN $4 AND completed_at IS NULL THEN NOW() ELSE completed_at END
         WHERE player_id = $1 AND challenge_id = $2`,
        [playerId, challengeId, progress, completed]
      );
    },

    async markPlayerChallengeClaimed(client: PoolClient, playerId: number, challengeId: number) {
      await client.query('UPDATE player_challenges SET claimed = TRUE, claimed_at = NOW() WHERE player_id = $1 AND challenge_id = $2', [playerId, challengeId]);
    },

    // ── progress computers (dispatch on challenge_type) ──
    computeRotatingProgress(exec: Queryable, playerId: number, slot: SlotRow) {
      return computeRotatingProgress(exec, playerId, slot);
    },
    computePermanentProgress(exec: Queryable, playerId: number, challenge: { challenge_type: string; course_id: number | null }) {
      return computePermanentProgress(exec, playerId, challenge);
    },
  };
}

export type ChallengesRepo = ReturnType<typeof createChallengesRepo>;

async function countCol(exec: Queryable, sql: string, params: unknown[]): Promise<number> {
  const r = await exec.query<Record<string, string>>(sql, params);
  const row = r.rows[0];
  if (!row) return 0;
  return parseInt(Object.values(row)[0] ?? '0', 10);
}

async function computeRotatingProgress(exec: Queryable, playerId: number, slot: SlotRow): Promise<number> {
  const { challenge_type: type, period_start: ps, period_end: pe, target_value } = slot;
  const p = [playerId, ps, pe];
  switch (type) {
    case 'daily_checkins':
    case 'weekly_unique_courses': {
      const cnt = await countCol(exec, `SELECT COUNT(DISTINCT course_id) AS cnt FROM checkins WHERE player_id = $1 AND checked_in_at >= $2 AND checked_in_at < $3`, p);
      return type === 'daily_checkins' ? Math.min(cnt, target_value) : cnt;
    }
    case 'daily_rounds':
    case 'weekly_rounds':
    case 'monthly_rounds':
      return countCol(exec, `SELECT COUNT(*) AS cnt FROM rounds WHERE player_id = $1 AND status = 'completed' AND completed_at >= $2 AND completed_at < $3`, p);
    case 'daily_holes':
    case 'weekly_holes':
    case 'monthly_holes':
      return countCol(exec, `SELECT COUNT(*) AS cnt FROM round_holes rh JOIN rounds ro ON ro.id = rh.round_id WHERE ro.player_id = $1 AND ro.started_at >= $2 AND ro.started_at < $3`, p);
    case 'daily_birdies':
    case 'weekly_birdies':
    case 'monthly_birdies':
      return countCol(exec, `SELECT COUNT(*) AS cnt FROM round_holes rh JOIN rounds ro ON ro.id = rh.round_id WHERE ro.player_id = $1 AND ro.started_at >= $2 AND ro.started_at < $3 AND rh.score = rh.par - 1`, p);
    case 'daily_pars':
    case 'weekly_pars':
    case 'monthly_pars':
      return countCol(exec, `SELECT COUNT(*) AS cnt FROM round_holes rh JOIN rounds ro ON ro.id = rh.round_id WHERE ro.player_id = $1 AND ro.started_at >= $2 AND ro.started_at < $3 AND rh.score = rh.par`, p);
    case 'weekly_new_courses':
    case 'location_new_courses':
      return countCol(exec, `SELECT COUNT(DISTINCT ci.course_id) AS cnt FROM checkins ci WHERE ci.player_id = $1 AND ci.checked_in_at >= $2 AND ci.checked_in_at < $3 AND ci.course_id NOT IN (SELECT DISTINCT course_id FROM checkins WHERE player_id = $1 AND checked_in_at < $2)`, p);
    case 'monthly_unique_courses':
      return countCol(exec, `SELECT COUNT(DISTINCT course_id) AS cnt FROM checkins WHERE player_id = $1 AND checked_in_at >= $2 AND checked_in_at < $3`, p);
    case 'round_under_par':
      return countCol(exec, `SELECT COUNT(*) AS cnt FROM rounds WHERE player_id = $1 AND status = 'completed' AND completed_at >= $2 AND completed_at < $3 AND total_score < total_par`, p);
    case 'round_birdies_single':
      return countCol(exec, `SELECT COALESCE(MAX(birdie_cnt), 0) AS cnt FROM (SELECT ro.id, COUNT(*) FILTER (WHERE rh.score = rh.par - 1) AS birdie_cnt FROM rounds ro JOIN round_holes rh ON rh.round_id = ro.id WHERE ro.player_id = $1 AND ro.status = 'completed' AND ro.completed_at >= $2 AND ro.completed_at < $3 GROUP BY ro.id) t`, p);
    case 'round_zero_bogeys':
      return countCol(exec, `SELECT COUNT(*) AS cnt FROM (SELECT ro.id FROM rounds ro JOIN round_holes rh ON rh.round_id = ro.id WHERE ro.player_id = $1 AND ro.status = 'completed' AND ro.completed_at >= $2 AND ro.completed_at < $3 GROUP BY ro.id HAVING COUNT(*) FILTER (WHERE rh.score > rh.par) = 0 AND COUNT(*) > 0) t`, p);
    case 'round_clutch_finish':
      return countCol(exec, `SELECT COUNT(*) AS cnt FROM (SELECT ro.id FROM rounds ro JOIN round_holes rh ON rh.round_id = ro.id AND rh.hole_number = ro.holes_count WHERE ro.player_id = $1 AND ro.status = 'completed' AND ro.completed_at >= $2 AND ro.completed_at < $3 AND rh.score <= rh.par - 1) t`, p);
    case 'round_ace':
      return countCol(exec, `SELECT COUNT(DISTINCT ro.id) AS cnt FROM rounds ro JOIN round_holes rh ON rh.round_id = ro.id WHERE ro.player_id = $1 AND ro.status = 'completed' AND ro.completed_at >= $2 AND ro.completed_at < $3 AND rh.score = 1 AND rh.par >= 2`, p);
    case 'round_clean_sheet':
      return countCol(exec, `SELECT COUNT(*) AS cnt FROM (SELECT ro.id FROM rounds ro JOIN round_holes rh ON rh.round_id = ro.id WHERE ro.player_id = $1 AND ro.status = 'completed' AND ro.holes_count = 18 AND ro.completed_at >= $2 AND ro.completed_at < $3 GROUP BY ro.id HAVING COUNT(*) FILTER (WHERE rh.score >= rh.par + 2) = 0 AND COUNT(*) = 18) t`, p);
    case 'round_beat_best':
      return countCol(exec, `SELECT COUNT(*) AS cnt FROM (SELECT ro.id FROM rounds ro JOIN player_course_bests pcb ON pcb.player_id = ro.player_id AND pcb.course_id = ro.course_id AND pcb.best_round_id != ro.id WHERE ro.player_id = $1 AND ro.status = 'completed' AND ro.completed_at >= $2 AND ro.completed_at < $3 AND (ro.total_score - ro.total_par) < pcb.best_score_vs_par) t`, p);
    case 'round_birdie_streak': {
      const rounds = await exec.query<{ id: number }>(`SELECT ro.id FROM rounds ro WHERE ro.player_id = $1 AND ro.status = 'completed' AND ro.completed_at >= $2 AND ro.completed_at < $3 ORDER BY ro.completed_at DESC`, p);
      let count = 0;
      for (const round of rounds.rows) {
        const holes = await exec.query<{ score: number; par: number }>('SELECT score, par FROM round_holes WHERE round_id = $1 ORDER BY hole_number ASC', [round.id]);
        let streak = 0;
        let maxStreak = 0;
        for (const h of holes.rows) {
          if (h.score <= h.par - 1) { streak++; maxStreak = Math.max(maxStreak, streak); } else streak = 0;
        }
        if (maxStreak >= (target_value || 3)) count++;
      }
      return count;
    }
    case 'round_consistency':
      return countCol(exec, `SELECT COUNT(*) AS cnt FROM (SELECT ro.id FROM rounds ro JOIN (SELECT course_id, AVG(total_score - total_par) AS avg_vpar FROM rounds WHERE player_id = $1 AND status = 'completed' AND completed_at < $2 GROUP BY course_id HAVING COUNT(*) >= 2) avg_data ON avg_data.course_id = ro.course_id WHERE ro.player_id = $1 AND ro.status = 'completed' AND ro.completed_at >= $2 AND ro.completed_at < $3 AND ABS((ro.total_score - ro.total_par) - avg_data.avg_vpar) <= 2) t`, p);
    case 'streak_days_played':
      return countCol(exec, `SELECT COUNT(DISTINCT DATE(completed_at)) AS cnt FROM rounds WHERE player_id = $1 AND status = 'completed' AND completed_at >= $2 AND completed_at < $3`, p);
    case 'streak_weekend':
      return countCol(exec, `SELECT COUNT(DISTINCT EXTRACT(DOW FROM completed_at)) AS cnt FROM rounds WHERE player_id = $1 AND status = 'completed' AND completed_at >= $2 AND completed_at < $3 AND EXTRACT(DOW FROM completed_at) IN (0, 6)`, p);
    case 'location_states':
      return countCol(exec, `SELECT COUNT(DISTINCT co.state) AS cnt FROM rounds ro JOIN courses co ON co.id = ro.course_id WHERE ro.player_id = $1 AND ro.status = 'completed' AND ro.completed_at >= $2 AND ro.completed_at < $3 AND co.state IS NOT NULL`, p);
    case 'location_same_course':
      return countCol(exec, `SELECT COALESCE(MAX(cnt), 0) AS cnt FROM (SELECT course_id, COUNT(*) AS cnt FROM rounds WHERE player_id = $1 AND status = 'completed' AND completed_at >= $2 AND completed_at < $3 GROUP BY course_id) t`, p);
    case 'round_ace_alltime':
      return countCol(exec, `SELECT COUNT(DISTINCT ro.id) AS cnt FROM rounds ro JOIN round_holes rh ON rh.round_id = ro.id WHERE ro.player_id = $1 AND ro.status = 'completed' AND rh.score = 1 AND rh.par >= 2`, [playerId]);
    default:
      return 0;
  }
}

async function computePermanentProgress(exec: Queryable, playerId: number, challenge: { challenge_type: string; course_id: number | null }): Promise<number> {
  const { challenge_type: type, course_id } = challenge;
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  switch (type) {
    case 'course_checkin':
      return course_id ? countCol(exec, 'SELECT COUNT(*) AS cnt FROM checkins WHERE player_id = $1 AND course_id = $2', [playerId, course_id]) : 0;
    case 'course_rounds':
      return course_id ? countCol(exec, `SELECT COUNT(*) AS cnt FROM rounds WHERE player_id = $1 AND course_id = $2 AND status = 'completed'`, [playerId, course_id]) : 0;
    case 'courses_in_day':
      return countCol(exec, `SELECT COALESCE(MAX(cnt), 0) AS cnt FROM (SELECT COUNT(DISTINCT course_id) AS cnt FROM checkins WHERE player_id = $1 GROUP BY DATE(checked_in_at)) t`, [playerId]);
    case 'unique_battles':
      return countCol(exec, `SELECT COUNT(DISTINCT CASE WHEN challenger_id = $1 THEN opponent_id ELSE challenger_id END) AS cnt FROM battles WHERE (challenger_id = $1 OR opponent_id = $1)`, [playerId]);
    case 'weekend_rounds':
      return countCol(exec, `SELECT COUNT(*) AS cnt FROM checkins WHERE player_id = $1 AND EXTRACT(DOW FROM checked_in_at) IN (0, 6)`, [playerId]);
    case 'new_courses_week':
      return countCol(exec, `SELECT COUNT(DISTINCT course_id) AS cnt FROM checkins WHERE player_id = $1 AND checked_in_at >= $2 AND course_id NOT IN (SELECT DISTINCT course_id FROM checkins WHERE player_id = $1 AND checked_in_at < $2)`, [playerId, weekAgo]);
    case 'same_course_visits':
      return countCol(exec, `SELECT COALESCE(MAX(cnt), 0) AS cnt FROM (SELECT COUNT(*) AS cnt FROM checkins WHERE player_id = $1 GROUP BY course_id) t`, [playerId]);
    case 'full_rounds':
      return countCol(exec, 'SELECT total_rounds AS cnt FROM players WHERE id = $1', [playerId]);
    case 'unique_states':
      return countCol(exec, `SELECT COUNT(DISTINCT c.state) AS cnt FROM checkins ci JOIN courses c ON c.id = ci.course_id WHERE ci.player_id = $1`, [playerId]);
    case 'night_checkins':
      return countCol(exec, `SELECT COUNT(*) AS cnt FROM checkins WHERE player_id = $1 AND EXTRACT(HOUR FROM checked_in_at) >= 20`, [playerId]);
    case 'morning_checkins':
      return countCol(exec, `SELECT COUNT(*) AS cnt FROM checkins WHERE player_id = $1 AND EXTRACT(HOUR FROM checked_in_at) >= 5 AND EXTRACT(HOUR FROM checked_in_at) < 9`, [playerId]);
    case 'full_rounds_week':
      return countCol(exec, `SELECT COUNT(*) AS cnt FROM checkins WHERE player_id = $1 AND is_round_complete = TRUE AND checked_in_at >= $2`, [playerId, weekAgo]);
    case 'battle_wins':
      return countCol(exec, 'SELECT battle_wins AS cnt FROM players WHERE id = $1', [playerId]);
    case 'login_streak':
      return countCol(exec, 'SELECT login_streak AS cnt FROM players WHERE id = $1', [playerId]);
    default:
      return 0;
  }
}
