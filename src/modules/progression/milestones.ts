// src/modules/progression/milestones.ts — map a running count to the one-time
// XP milestone event it just crossed (exact-match, so it fires once).

import type { XpEvent } from './events';

export function getCheckinMilestone(checkinCount: number): XpEvent | null {
  for (const m of [10, 50, 100, 250] as const) {
    if (checkinCount === m) return `milestone_checkins_${m}` as XpEvent;
  }
  return null;
}

export function getCourseMilestone(uniqueCourses: number): XpEvent | null {
  for (const m of [5, 10, 25, 50, 100] as const) {
    if (uniqueCourses === m) return `milestone_courses_${m}` as XpEvent;
  }
  return null;
}

export function getStateMilestone(completedStates: number): XpEvent | null {
  // Fires the first time a player completes any state.
  return completedStates === 1 ? 'milestone_state_champion' : null;
}

export function getRoundMilestone(totalRounds: number): XpEvent | null {
  for (const m of [10, 50] as const) {
    if (totalRounds === m) return `milestone_rounds_${m}` as XpEvent;
  }
  return null;
}
