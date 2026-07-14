// src/modules/onboarding/onboarding.service.ts — onboarding funnel + state.

import { badRequest } from '../../http/errors';
import type { Database } from '../../db/types';
import { createOnboardingRepo, type OnboardingRepo } from './onboarding.repo';

const VALID_EVENTS = [
  'onboard_loaded', 'experience_selected', 'tutorial_started', 'tutorial_completed',
  'tutorial_skipped', 'signup_prompted', 'signup_triggered', 'guest_played_first_throw',
];
const VALID_EXPERIENCE = ['new', 'experienced'];

export function createOnboardingService(db: Database, repo: OnboardingRepo = createOnboardingRepo(db)) {
  return {
    // Funnel event — validated, best-effort insert (never blocks the client).
    async trackEvent(body: Record<string, unknown>) {
      const eventType = String(body.event_type ?? '');
      if (!VALID_EVENTS.includes(eventType)) throw badRequest('invalid event_type');
      await repo
        .insertEvent(
          (body.player_id as number) ?? null,
          (body.guest_uuid as string) ?? null,
          eventType,
          (body.experience_level as string) ?? null,
          (body.session_id as string) ?? null
        )
        .catch((err) => console.error('[onboarding] trackEvent failed:', (err as Error).message));
      return { ok: true };
    },

    async setExperience(playerId: number, level: unknown) {
      if (!VALID_EXPERIENCE.includes(String(level))) throw badRequest('experience_level must be "new" or "experienced"');
      const experience_level = String(level);
      await repo.setExperience(playerId, experience_level);
      await repo.insertEvent(playerId, null, 'experience_selected', experience_level, null).catch(() => {});
      return { ok: true, experience_level };
    },

    async complete(playerId: number) {
      await repo.complete(playerId);
      return { ok: true };
    },

    async getStatus(playerId: number | null) {
      if (playerId == null) return { needs_onboarding: false, onboarding_completed: true };
      const s = await repo.status(playerId);
      if (!s) return { needs_onboarding: false, onboarding_completed: true };
      return {
        onboarding_completed: s.onboarding_completed,
        experience_level: s.experience_level,
        is_guest: s.is_guest,
        needs_onboarding: !s.onboarding_completed,
      };
    },
  };
}

export type OnboardingService = ReturnType<typeof createOnboardingService>;
