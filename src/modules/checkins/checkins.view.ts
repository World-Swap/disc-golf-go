// src/modules/checkins/checkins.view.ts — shape the POST /checkins response.

import { getLevelProgress, getLevelTitle } from '../progression';
import type { CourseRow } from './checkins.repo';
import type { CheckinRewards } from './checkin-rewards.service';

export function toCheckinResponse(course: CourseRow, distanceMeters: number, oldLevel: number, r: CheckinRewards) {
  const levelTitle = getLevelTitle(r.newLevel);
  return {
    success: true,
    course_name: course.name,
    city: course.city,
    state: course.state,
    distance_meters: Math.round(distanceMeters),
    is_new_course: r.isNewCourse,
    is_trailblazer: r.isTrailblazer,

    xp_earned: r.totalXpEarned,
    xp_breakdown: r.xpBreakdown,
    new_xp: r.finalXpPre,

    gold_earned: r.totalGoldEarned,
    gold_breakdown: r.goldBreakdown,
    new_gold: r.newGold,

    old_level: oldLevel,
    new_level: r.newLevel,
    leveled_up: r.leveledUp,
    level_title: levelTitle.title,
    level_title_icon: levelTitle.icon,
    level_progress: getLevelProgress(r.finalXpPre),

    new_badges: r.newBadges,
  };
}
