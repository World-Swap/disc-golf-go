// src/modules/onboarding/onboarding.repo.ts — onboarding state + funnel events.

import type { Queryable } from '../../db/types';

export interface OnboardingStatus {
  onboarding_completed: boolean;
  experience_level: string | null;
  is_guest: boolean;
}

export function createOnboardingRepo(db: Queryable) {
  return {
    async insertEvent(playerId: number | null, guestUuid: string | null, eventType: string, experienceLevel: string | null, sessionId: string | null) {
      await db.query(
        `INSERT INTO onboarding_events (player_id, guest_uuid, event_type, experience_level, session_id) VALUES ($1, $2, $3, $4, $5)`,
        [playerId, guestUuid, eventType, experienceLevel, sessionId]
      );
    },

    async setExperience(playerId: number, level: string) {
      await db.query('UPDATE players SET experience_level = $1 WHERE id = $2', [level, playerId]);
    },

    async complete(playerId: number) {
      await db.query('UPDATE players SET onboarding_completed = true WHERE id = $1', [playerId]);
    },

    async status(playerId: number): Promise<OnboardingStatus | null> {
      const r = await db.query<OnboardingStatus>('SELECT onboarding_completed, experience_level, is_guest FROM players WHERE id = $1', [playerId]);
      return r.rows[0] ?? null;
    },
  };
}

export type OnboardingRepo = ReturnType<typeof createOnboardingRepo>;
