// src/modules/checkins/checkin-rewards.service.ts — the check-in reward
// pipeline. Runs inside the POST /checkins transaction (client): inserts the
// check-in row and applies every XP/gold/badge grant, returning the data the
// response needs. Ported faithfully from the legacy engine, now typed.

import type { PoolClient } from 'pg';
import {
  grantXp,
  grantGold,
  evaluateBadges,
  getLevelFromXp,
  getCheckinMilestone,
  getCourseMilestone,
  getRoundMilestone,
  getStateMilestone,
  type EarnedBadge,
} from '../progression';
import type { CheckinsRepo, PlayerRow, CourseRow } from './checkins.repo';

const BAD_WEATHER = ['rain', 'snow', 'cold', 'heat'];

export interface XpBreakdownItem {
  event: string;
  amount: number;
  label: string;
  boost_label?: string | null;
}
export interface GoldBreakdownItem {
  event: string;
  amount: number;
  label: string;
}

export interface CheckinRewards {
  checkinId: number;
  isNewCourse: boolean;
  isTrailblazer: boolean;
  xpBreakdown: XpBreakdownItem[];
  goldBreakdown: GoldBreakdownItem[];
  totalXpEarned: number;
  totalGoldEarned: number;
  finalXpPre: number;
  newLevel: number;
  leveledUp: boolean;
  newBadges: EarnedBadge[];
  newGold: number;
}

export interface RewardContext {
  player: PlayerRow;
  course: CourseRow;
  isRoundComplete: boolean;
  holesLogged: number | null;
  weatherCondition: string | null;
  oldLevel: number;
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

export async function awardCheckinRewards(client: PoolClient, repo: CheckinsRepo, ctx: RewardContext): Promise<CheckinRewards> {
  const { player, course, isRoundComplete, holesLogged, weatherCondition, oldLevel } = ctx;
  const courseId = course.id;

  const isNewCourse = (await repo.prevVisitCount(client, player.id, courseId)) === 0;
  const isTrailblazer = (await repo.courseCheckinCount(client, courseId)) === 0;
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const isDailyFirst = (await repo.dailyCheckinCount(client, player.id, todayStart.toISOString())) === 0;

  const now = new Date();
  const isWeekendDay = isWeekend(now);
  const hour = now.getUTCHours();
  const isNight = hour >= 20 || hour < 0;
  const isMorning = hour >= 5 && hour < 9;
  const isBadWeather = weatherCondition != null && BAD_WEATHER.includes(weatherCondition);

  const checkinId = await repo.insertCheckin(client, {
    playerId: player.id,
    courseId,
    isRoundComplete,
    holesLogged,
    weatherCondition,
    eventFlags: { isWeekend: isWeekendDay, isNight, isMorning },
  });

  // ── XP ──
  const xpBreakdown: XpBreakdownItem[] = [];
  const baseEvent = isNewCourse ? 'checkin_new_course' : 'checkin_return';
  const baseXp = await grantXp(client, player.id, baseEvent, { course_id: courseId, checkin_id: checkinId });
  xpBreakdown.push({ event: baseEvent, amount: baseXp.amount, label: isNewCourse ? 'New course!' : 'Return visit', boost_label: baseXp.boostLabel });

  if (isTrailblazer) {
    const r = await grantXp(client, player.id, 'trailblazer_first', { course_id: courseId });
    xpBreakdown.push({ event: 'trailblazer_first', amount: r.amount, label: '🚀 First player here!' });
  }
  if (isDailyFirst) {
    const r = await grantXp(client, player.id, 'daily_first_checkin', { checkin_id: checkinId });
    xpBreakdown.push({ event: 'daily_first_checkin', amount: r.amount, label: 'First check-in of the day' });
  }
  if (isWeekendDay) {
    const r = await grantXp(client, player.id, 'weekend_warrior', { checkin_id: checkinId });
    xpBreakdown.push({ event: 'weekend_warrior', amount: r.amount, label: '🎉 Weekend warrior!' });
  }
  if (isBadWeather) {
    const r = await grantXp(client, player.id, 'bad_weather', { weather: weatherCondition, checkin_id: checkinId });
    xpBreakdown.push({ event: 'bad_weather', amount: r.amount, label: `🌧️ Playing in ${weatherCondition}!` });
  }
  if (isRoundComplete) {
    const r = await grantXp(client, player.id, 'round_complete', { checkin_id: checkinId, holes: holesLogged });
    xpBreakdown.push({ event: 'round_complete', amount: r.amount, label: '✅ Full round completed!' });
    await repo.incrementTotalRounds(client, player.id);
  }

  // Milestones
  const stats = await repo.postXpStats(client, player.id);
  const totalRounds = await repo.playerTotalRounds(client, player.id);

  const checkinMilestone = getCheckinMilestone(stats.totalCheckins);
  if (checkinMilestone) {
    const r = await grantXp(client, player.id, checkinMilestone, { count: stats.totalCheckins });
    xpBreakdown.push({ event: checkinMilestone, amount: r.amount, label: `🎯 ${stats.totalCheckins} check-ins milestone!` });
  }
  const courseMilestone = getCourseMilestone(stats.uniqueCourses);
  if (courseMilestone) {
    const r = await grantXp(client, player.id, courseMilestone, { count: stats.uniqueCourses });
    xpBreakdown.push({ event: courseMilestone, amount: r.amount, label: `🗺️ ${stats.uniqueCourses} courses milestone!` });
  }
  const roundMilestone = getRoundMilestone(totalRounds);
  if (roundMilestone) {
    const r = await grantXp(client, player.id, roundMilestone, { count: totalRounds });
    xpBreakdown.push({ event: roundMilestone, amount: r.amount, label: `✅ ${totalRounds} rounds milestone!` });
  }

  const completedStates = await repo.completedStatesCount(client, player.id);
  const stateMilestone = getStateMilestone(completedStates);
  if (stateMilestone) {
    const r = await grantXp(client, player.id, stateMilestone, { completed_states: completedStates });
    xpBreakdown.push({ event: stateMilestone, amount: r.amount, label: '🏅 State Champion! First state completed!' });
  }

  const totalXpEarned = xpBreakdown.reduce((s, e) => s + e.amount, 0);
  await repo.updateCheckinXp(client, checkinId, totalXpEarned);

  // ── Gold ──
  const goldBreakdown: GoldBreakdownItem[] = [];
  const baseGold = await grantGold(client, player.id, baseEvent, { course_id: courseId, checkin_id: checkinId });
  if (baseGold.amount > 0) {
    goldBreakdown.push({ event: baseEvent, amount: baseGold.amount, label: isNewCourse ? 'New course!' : 'Return visit' });
  }

  // ── Badges ──
  const badgeStats = await repo.badgeStats(client, player.id, completedStates);
  const existing = await repo.earnedBadgeKeys(client, player.id);
  const newBadges = evaluateBadges(badgeStats, existing);
  for (const badge of newBadges) {
    await repo.insertBadge(client, player.id, badge.category, badge.tier);
    const bg = await grantGold(client, player.id, 'badge_unlock', { category: badge.category, tier: badge.tier });
    if (bg.amount > 0) goldBreakdown.push({ event: 'badge_unlock', amount: bg.amount, label: `🏅 Badge: ${badge.category} ${badge.tier}` });
  }

  // ── Level-up gold ──
  const finalPlayer = await repo.finalPlayer(client, player.id);
  const finalXpPre = finalPlayer.xp;
  const newLevel = getLevelFromXp(finalXpPre);
  const leveledUp = newLevel > oldLevel;
  if (leveledUp) {
    const lvl = await grantGold(client, player.id, 'level_up', { old_level: oldLevel, new_level: newLevel });
    if (lvl.amount > 0) goldBreakdown.push({ event: 'level_up', amount: lvl.amount, label: '⬆️ Level up!' });
  }

  const totalGoldEarned = goldBreakdown.reduce((s, e) => s + e.amount, 0);
  const newGold = await repo.playerGold(client, player.id);

  return {
    checkinId,
    isNewCourse,
    isTrailblazer,
    xpBreakdown,
    goldBreakdown,
    totalXpEarned,
    totalGoldEarned,
    finalXpPre,
    newLevel,
    leveledUp,
    newBadges,
    newGold,
  };
}
