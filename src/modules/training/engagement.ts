// src/modules/training/engagement.ts — did this player actually open the lesson?
//
// What this is NOT: proof. Every signal here is reported by the client, and a
// determined caller can POST them in order. Saying otherwise would be a lie
// told to ourselves.
//
// What it IS: a price. Before this, the entire library was reachable by a
// script in seconds, or by tapping through in a few minutes -- 25,750 XP, level
// 14, 1,000 gold, and now coupons redeemable for real merchandise. With a
// server-timed dwell and a required resource open, clicking through costs
// MIN_DWELL_SECONDS per lesson plus a completion rate limit, which turns
// minutes into hours and makes the honest route competitive with the cheat.
//
// The numbers are set to be invisible to someone who genuinely watches the
// video and skims the article, and obstructive to someone who does not. A fast
// reader who already knows the material is the person most likely to be
// annoyed, which is why the dwell is seconds rather than minutes.

export const MIN_DWELL_SECONDS = 45;

/** Completions allowed per hour. Nobody honestly finishes 20 lessons in one. */
export const MAX_COMPLETIONS_PER_HOUR = 20;

export type EngagementEvent = 'opened' | 'resource_opened';

export const ENGAGEMENT_EVENTS: EngagementEvent[] = ['opened', 'resource_opened'];

export function isEngagementEvent(v: unknown): v is EngagementEvent {
  return typeof v === 'string' && (ENGAGEMENT_EVENTS as string[]).includes(v);
}

export interface EngagementState {
  openedSecondsAgo: number | null;
  resourcesOpened: number;
}

export interface GateResult {
  ok: boolean;
  /** Shown to the player, so it says what to do rather than that they failed. */
  reason?: string;
  waitSeconds?: number;
}

/**
 * Decide whether a completion may be accepted.
 *
 * Deliberately a pure function of state the SERVER recorded, so it is trivially
 * testable and cannot be influenced by anything in the request body.
 */
export function checkEngagement(state: EngagementState): GateResult {
  if (state.openedSecondsAgo == null) {
    return { ok: false, reason: 'Open the lesson before marking it done.' };
  }
  if (state.resourcesOpened < 1) {
    return { ok: false, reason: 'Watch the video or open one of the links first.' };
  }
  if (state.openedSecondsAgo < MIN_DWELL_SECONDS) {
    const waitSeconds = Math.ceil(MIN_DWELL_SECONDS - state.openedSecondsAgo);
    return {
      ok: false,
      reason: 'Give the lesson a moment — you can mark it done in ' + waitSeconds + 's.',
      waitSeconds,
    };
  }
  return { ok: true };
}
