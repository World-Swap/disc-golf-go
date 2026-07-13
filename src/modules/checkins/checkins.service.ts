// src/modules/checkins/checkins.service.ts — check-in orchestration. Owns the
// transaction, GPS gate, and per-day guard; delegates rewards to the pipeline.

import { notFound, badRequest, AppError } from '../../http/errors';
import { withTransaction } from '../../db/pool';
import { haversineMeters } from '../../lib/geo';
import { getLevelFromXp } from '../progression';
import type { Database } from '../../db/types';
import { createCheckinsRepo, startOfUtcDayIso, type CheckinsRepo } from './checkins.repo';
import { awardCheckinRewards } from './checkin-rewards.service';
import { toCheckinResponse } from './checkins.view';
import type { CheckinInput } from './checkins.validation';

const CHECKIN_RADIUS_METERS = 800;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export function createCheckinsService(db: Database, repo: CheckinsRepo = createCheckinsRepo(db)) {
  return {
    async checkIn(playerId: number, input: CheckinInput) {
      const sinceIso = startOfUtcDayIso();

      const { rewards, distance, oldLevel, course } = await withTransaction(db, async (client) => {
        const player = await repo.loadPlayer(client, playerId);
        if (!player) throw notFound('Player not found');
        const oldLvl = player.level ?? getLevelFromXp(player.xp);

        const course = await repo.loadCourse(client, input.course_id);
        if (!course) throw notFound('Course not found');

        // GPS gate — no bypass; must physically be at the course.
        const distanceMeters = haversineMeters(input.player_lat, input.player_lng, course.lat, course.lng);
        if (distanceMeters > CHECKIN_RADIUS_METERS) {
          throw new AppError(400, 'Too far from course', {
            distance_meters: Math.round(distanceMeters),
            required_meters: CHECKIN_RADIUS_METERS,
            course_name: course.name,
          });
        }

        // Same-course-per-UTC-day guard.
        if ((await repo.sameCourseTodayCount(client, player.id, course.id, sinceIso)) > 0) {
          throw new AppError(400, 'Already checked in here today', {
            message: "You've already checked in here today. Come back tomorrow!",
            course_name: course.name,
            resets_at: new Date(new Date(sinceIso).getTime() + 86_400_000).toISOString(),
          });
        }

        const rewards = await awardCheckinRewards(client, repo, {
          player,
          course,
          isRoundComplete: input.is_round_complete,
          holesLogged: input.holes_logged,
          weatherCondition: input.weather_condition,
          oldLevel: oldLvl,
        });

        return { rewards, distance: distanceMeters, oldLevel: oldLvl, course };
      });

      // Fire-and-forget challenge sync (after commit; never blocks the response).
      void this.syncCourseChallenges(playerId, input.course_id).catch(() => {});

      return toCheckinResponse(course, distance, oldLevel, rewards);
    },

    async syncCourseChallenges(playerId: number, courseId: number) {
      const challenges = await repo.courseCheckinChallenges(courseId);
      for (const ch of challenges) {
        const progress = await repo.courseCheckinCountForPlayer(playerId, courseId);
        await repo.upsertPlayerChallenge(playerId, ch.id, progress, progress >= ch.target_value);
      }
    },

    async status(playerId: number, courseId: number) {
      if (!courseId) throw badRequest('course_id required');
      const row = await repo.statusToday(playerId, courseId, startOfUtcDayIso());
      return {
        checked_in: row != null,
        checkin_id: row?.id ?? null,
        checked_in_at: row?.checked_in_at ?? null,
        course_id: courseId,
      };
    },

    async atCourse(playerId: number, courseId: number) {
      if (!courseId) throw badRequest('course_id required');
      const sinceIso = new Date(Date.now() - TWO_HOURS_MS).toISOString();
      return { players: await repo.playersAtCourse(courseId, sinceIso, playerId) };
    },

    async history(playerId: number, limit: number, offset: number) {
      const rows = await repo.history(playerId, limit, offset);
      const hasMore = rows.length > limit;
      return { checkins: hasMore ? rows.slice(0, limit) : rows, limit, offset };
    },
  };
}

export type CheckinsService = ReturnType<typeof createCheckinsService>;
