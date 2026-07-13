// services/checkin-rewards.js — the check-in reward pipeline.
// Runs inside an open transaction (client) that the caller controls: the route
// owns BEGIN/COMMIT/ROLLBACK, GPS gating, and the same-course-per-day check.
// This module inserts the check-in row and applies every XP/gold/badge grant,
// returning the data the route needs to shape its response.

const {
  getLevelFromXp,
  grantXp,
  grantGold,
  evaluateBadges,
  getCheckinMilestone,
  getCourseMilestone,
  getRoundMilestone,
  getStateMilestone,
} = require('../routes/xp-engine');

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

async function awardCheckinRewards(client, { player, course, isRoundComplete, holesLogged, weatherCondition, oldLevel }) {
  const courseId = course.id;

  // Is this a new course for the player?
  const prevVisit = await client.query(
    'SELECT COUNT(*) as cnt FROM checkins WHERE player_id = $1 AND course_id = $2',
    [player.id, courseId]
  );
  const isNewCourse = parseInt(prevVisit.rows[0].cnt) === 0;

  // First player ever at this course (trailblazer)?
  const trailblazerCheck = await client.query(
    'SELECT COUNT(*) as cnt FROM checkins WHERE course_id = $1',
    [courseId]
  );
  const isTrailblazer = parseInt(trailblazerCheck.rows[0].cnt) === 0;

  // First check-in of the day for this player?
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayCheckinResult = await client.query(
    'SELECT COUNT(*) as cnt FROM checkins WHERE player_id = $1 AND checked_in_at >= $2',
    [player.id, todayStart.toISOString()]
  );
  const isDailyFirst = parseInt(todayCheckinResult.rows[0].cnt) === 0;

  const now = new Date();
  const isWeekendDay = isWeekend(now);
  const hour = now.getUTCHours();
  const isNight = hour >= 20 || hour < 0;   // 8PM–midnight UTC
  const isMorning = hour >= 5 && hour < 9;  // 5AM–9AM UTC
  const isBadWeather = ['rain', 'snow', 'cold', 'heat'].includes(weatherCondition);

  // Insert check-in record (xp_earned backfilled below once grants are summed)
  const checkinResult = await client.query(
    `INSERT INTO checkins
      (player_id, course_id, xp_earned, is_round_complete, holes_logged, weather_condition, event_flags)
     VALUES ($1, $2, 0, $3, $4, $5, $6)
     RETURNING id`,
    [
      player.id,
      courseId,
      !!isRoundComplete,
      holesLogged || null,
      weatherCondition || null,
      JSON.stringify({ isWeekend: isWeekendDay, isNight, isMorning }),
    ]
  );
  const checkinId = checkinResult.rows[0].id;

  // ── XP GRANTS ──
  const xpBreakdown = [];

  const baseEvent = isNewCourse ? 'checkin_new_course' : 'checkin_return';
  const baseXpResult = await grantXp(client, player.id, baseEvent, { course_id: courseId, checkin_id: checkinId });
  xpBreakdown.push({ event: baseEvent, amount: baseXpResult.amount, label: isNewCourse ? 'New course!' : 'Return visit', boost_label: baseXpResult.boostLabel });

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
    await client.query('UPDATE players SET total_rounds = total_rounds + 1 WHERE id = $1', [player.id]);
  }

  // Post-XP stats for milestone checks
  const statsResult = await client.query(
    `SELECT COUNT(*) as total_checkins, COUNT(DISTINCT course_id) as unique_courses
     FROM checkins WHERE player_id = $1`,
    [player.id]
  );
  const totalCheckins = parseInt(statsResult.rows[0].total_checkins);
  const uniqueCourses = parseInt(statsResult.rows[0].unique_courses);

  const roundsResult = await client.query('SELECT total_rounds FROM players WHERE id = $1', [player.id]);
  const totalRounds = parseInt(roundsResult.rows[0].total_rounds);

  const checkinMilestone = getCheckinMilestone(totalCheckins);
  if (checkinMilestone) {
    const r = await grantXp(client, player.id, checkinMilestone, { count: totalCheckins });
    xpBreakdown.push({ event: checkinMilestone, amount: r.amount, label: `🎯 ${totalCheckins} check-ins milestone!` });
  }

  const courseMilestone = getCourseMilestone(uniqueCourses);
  if (courseMilestone) {
    const r = await grantXp(client, player.id, courseMilestone, { count: uniqueCourses });
    xpBreakdown.push({ event: courseMilestone, amount: r.amount, label: `🗺️ ${uniqueCourses} courses milestone!` });
  }

  const roundMilestone = getRoundMilestone(totalRounds);
  if (roundMilestone) {
    const r = await grantXp(client, player.id, roundMilestone, { count: totalRounds });
    xpBreakdown.push({ event: roundMilestone, amount: r.amount, label: `✅ ${totalRounds} rounds milestone!` });
  }

  // Completed states: states where the player has visited ALL active courses
  const completedStatesResult = await client.query(`
    SELECT COUNT(*) AS cnt FROM (
      SELECT c.state,
        COUNT(DISTINCT ci.course_id) AS visited,
        (SELECT COUNT(*) FROM courses cc WHERE cc.state = c.state AND cc.is_active IS NOT FALSE) AS total
      FROM checkins ci
      JOIN courses c ON c.id = ci.course_id
      WHERE ci.player_id = $1
        AND c.state IS NOT NULL AND c.state != ''
      GROUP BY c.state
      HAVING COUNT(DISTINCT ci.course_id) = (
        SELECT COUNT(*) FROM courses cc WHERE cc.state = c.state AND cc.is_active IS NOT FALSE
      )
    ) t
  `, [player.id]);

  const totalCompletedStates = parseInt(completedStatesResult.rows[0].cnt);
  const stateMilestone = getStateMilestone(totalCompletedStates);
  if (stateMilestone) {
    const r = await grantXp(client, player.id, stateMilestone, { completed_states: totalCompletedStates });
    xpBreakdown.push({ event: stateMilestone, amount: r.amount, label: `🏅 State Champion! First state completed!` });
  }

  const totalXpEarned = xpBreakdown.reduce((sum, e) => sum + e.amount, 0);
  await client.query('UPDATE checkins SET xp_earned = $1 WHERE id = $2', [totalXpEarned, checkinId]);

  // ── GOLD GRANTS ──
  const goldBreakdown = [];

  const baseGoldEvent = isNewCourse ? 'checkin_new_course' : 'checkin_return';
  const baseGoldResult = await grantGold(client, player.id, baseGoldEvent, { course_id: courseId, checkin_id: checkinId });
  if (baseGoldResult.amount > 0) {
    goldBreakdown.push({ event: baseGoldEvent, amount: baseGoldResult.amount, label: isNewCourse ? 'New course!' : 'Return visit' });
  }

  // ── BADGE EVALUATION ──
  const badgeStatsResult = await client.query(`
    SELECT
      COUNT(DISTINCT ci.course_id) AS unique_courses,
      COUNT(*) AS total_checkins,
      (SELECT COALESCE(MAX(sub.cnt), 0)
       FROM (SELECT course_id, COUNT(*) cnt FROM checkins WHERE player_id = $1 GROUP BY course_id) sub
      ) AS max_same_course_visits,
      COUNT(DISTINCT c.state) AS unique_states,
      SUM(CASE WHEN EXTRACT(DOW FROM ci.checked_in_at) IN (0, 6) THEN 1 ELSE 0 END) AS weekend_rounds,
      SUM(CASE WHEN EXTRACT(HOUR FROM ci.checked_in_at) >= 20 THEN 1 ELSE 0 END) AS night_checkins,
      SUM(CASE WHEN EXTRACT(HOUR FROM ci.checked_in_at) >= 5 AND EXTRACT(HOUR FROM ci.checked_in_at) < 9 THEN 1 ELSE 0 END) AS morning_checkins,
      SUM(CASE WHEN ci.weather_condition IN ('rain','snow','cold','heat') THEN 1 ELSE 0 END) AS weather_checkins
    FROM checkins ci
    JOIN courses c ON c.id = ci.course_id
    WHERE ci.player_id = $1
  `, [player.id]);

  const bsr = badgeStatsResult.rows[0];

  const trailblazerResult = await client.query(`
    SELECT COUNT(*) AS cnt
    FROM (
      SELECT ci.course_id
      FROM checkins ci
      WHERE ci.player_id = $1
        AND ci.checked_in_at = (
          SELECT MIN(ci2.checked_in_at) FROM checkins ci2 WHERE ci2.course_id = ci.course_id
        )
      GROUP BY ci.course_id
    ) t
  `, [player.id]);

  const playerFullResult = await client.query(
    'SELECT battle_wins, best_streak, total_rounds FROM players WHERE id = $1',
    [player.id]
  );
  const pf = playerFullResult.rows[0];

  const challengesResult = await client.query(
    'SELECT COUNT(*) as cnt FROM player_challenges WHERE player_id = $1 AND completed = TRUE',
    [player.id]
  );

  const opponentsResult = await client.query(`
    SELECT COUNT(DISTINCT CASE WHEN challenger_id = $1 THEN opponent_id ELSE challenger_id END) AS cnt
    FROM battles WHERE (challenger_id = $1 OR opponent_id = $1)
  `, [player.id]);

  const completedCitiesResult = await client.query(`
    SELECT COUNT(*) AS cnt FROM (
      SELECT c.city, c.state,
        COUNT(DISTINCT ci.course_id) AS visited,
        (SELECT COUNT(*) FROM courses cc WHERE cc.city = c.city AND cc.state = c.state) AS total
      FROM checkins ci
      JOIN courses c ON c.id = ci.course_id
      WHERE ci.player_id = $1
      GROUP BY c.city, c.state
      HAVING COUNT(DISTINCT ci.course_id) = (SELECT COUNT(*) FROM courses cc WHERE cc.city = c.city AND cc.state = c.state)
        AND (SELECT COUNT(*) FROM courses cc WHERE cc.city = c.city AND cc.state = c.state) >= 2
    ) t
  `, [player.id]);

  const seasonsResult = await client.query(`
    SELECT COUNT(DISTINCT CASE
      WHEN EXTRACT(MONTH FROM ci.checked_in_at) IN (3,4,5) THEN 'spring'
      WHEN EXTRACT(MONTH FROM ci.checked_in_at) IN (6,7,8) THEN 'summer'
      WHEN EXTRACT(MONTH FROM ci.checked_in_at) IN (9,10,11) THEN 'fall'
      ELSE 'winter'
    END) AS cnt
    FROM checkins ci WHERE ci.player_id = $1
  `, [player.id]);

  const badgeStats = {
    uniqueCourses: parseInt(bsr.unique_courses),
    totalCheckins: parseInt(bsr.total_checkins),
    totalRounds: parseInt(pf.total_rounds),
    challengesCompleted: parseInt(challengesResult.rows[0].cnt),
    battleWins: parseInt(pf.battle_wins),
    bestStreak: parseInt(pf.best_streak),
    uniqueOpponents: parseInt(opponentsResult.rows[0].cnt),
    uniqueStates: parseInt(bsr.unique_states),
    maxSameCourseVisits: parseInt(bsr.max_same_course_visits),
    weekendRounds: parseInt(bsr.weekend_rounds),
    nightCheckins: parseInt(bsr.night_checkins),
    morningCheckins: parseInt(bsr.morning_checkins),
    weatherCheckins: parseInt(bsr.weather_checkins),
    trailblazerCourses: parseInt(trailblazerResult.rows[0].cnt),
    seasonsPlayed: parseInt(seasonsResult.rows[0].cnt),
    completedCities: parseInt(completedCitiesResult.rows[0].cnt),
    completedStates: totalCompletedStates,
  };

  const existingBadgesResult = await client.query(
    'SELECT category, tier FROM player_badges WHERE player_id = $1',
    [player.id]
  );
  const existingBadgeSet = new Set(existingBadgesResult.rows.map(r => `${r.category}:${r.tier}`));

  const newBadges = evaluateBadges(badgeStats, existingBadgeSet);

  for (const badge of newBadges) {
    await client.query(
      'INSERT INTO player_badges (player_id, category, tier) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [player.id, badge.category, badge.tier]
    );
    const bgr = await grantGold(client, player.id, 'badge_unlock', { category: badge.category, tier: badge.tier });
    if (bgr.amount > 0) {
      goldBreakdown.push({ event: 'badge_unlock', amount: bgr.amount, label: `🏅 Badge: ${badge.category} ${badge.tier}` });
    }
  }

  // ── Level-up gold (still inside transaction) ──
  const finalXpCheck = await client.query('SELECT xp, level, gold FROM players WHERE id = $1', [player.id]);
  const finalXpPre = finalXpCheck.rows[0].xp;
  const newLevel = getLevelFromXp(finalXpPre);
  const leveledUp = newLevel > oldLevel;

  if (leveledUp) {
    const lvlGold = await grantGold(client, player.id, 'level_up', { old_level: oldLevel, new_level: newLevel });
    if (lvlGold.amount > 0) {
      goldBreakdown.push({ event: 'level_up', amount: lvlGold.amount, label: `⬆️ Level up!` });
    }
  }

  return {
    checkinId,
    isNewCourse,
    isTrailblazer,
    xpBreakdown,
    goldBreakdown,
    newBadges,
    totalXpEarned,
    finalXpPre,
    newLevel,
    leveledUp,
  };
}

module.exports = { awardCheckinRewards };
