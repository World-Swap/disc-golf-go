const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  getLevelFromXp,
  getLevelProgress,
  getLevelTitle,
  grantXp,
  grantGold,
  evaluateBadges,
  getCheckinMilestone,
  getCourseMilestone,
  getRoundMilestone,
  getStateMilestone,
  BADGE_DEFINITIONS,
} = require('./xp-engine');
// vault imports removed — gold grants use grantGold from xp-engine

// 800m: accommodates course coordinate variance (parking lot vs basket)
// and GPS error on Android devices (50-200m in real-world conditions).
// A course spanning 600m with 150m GPS error = 750m — needs 800m to pass.
const CHECKIN_RADIUS_METERS = 800;

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function getHourUTC(date) { return date.getUTCHours(); }

module.exports = ({ pool }) => {
  const router = express.Router();

  // POST /api/checkins
  router.post('/checkins', requireAuth(pool), async (req, res) => {
    const {
      course_id,
      player_lat,
      player_lng,
      is_round_complete,
      holes_logged,
      weather_condition,  // 'rain' | 'snow' | 'cold' | 'heat' | null
    } = req.body;

    if (!course_id || player_lat === undefined || player_lng === undefined) {
      return res.status(400).json({ error: 'course_id, player_lat, and player_lng are required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Load player
      const playerResult = await client.query(
        'SELECT id, display_name, xp, level, battle_wins, total_rounds FROM players WHERE id = $1',
        [req.player.id]
      );
      if (playerResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Player not found' });
      }
      const player = playerResult.rows[0];
      const oldLevel = player.level || getLevelFromXp(player.xp);

      // Load course
      const courseResult = await client.query(
        'SELECT id, name, city, state, lat, lng FROM courses WHERE id = $1',
        [course_id]
      );
      if (courseResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Course not found' });
      }
      const course = courseResult.rows[0];

      // GPS check — no bypass allowed, must physically be at the course
      const distanceMeters = haversineMeters(player_lat, player_lng, course.lat, course.lng);
      if (distanceMeters > CHECKIN_RADIUS_METERS) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Too far from course',
          distance_meters: Math.round(distanceMeters),
          required_meters: CHECKIN_RADIUS_METERS,
          course_name: course.name
        });
      }

      // ── SAME-COURSE PER-DAY LIMIT ──
      // A player can check in to multiple different courses in a day, but cannot
      // check in to the SAME course more than once per calendar day (UTC).
      const sameDayStart = new Date();
      sameDayStart.setUTCHours(0, 0, 0, 0);
      const sameCourseToday = await client.query(
        `SELECT COUNT(*) as cnt FROM checkins
         WHERE player_id = $1 AND course_id = $2 AND checked_in_at >= $3`,
        [player.id, course.id, sameDayStart.toISOString()]
      );
      if (parseInt(sameCourseToday.rows[0].cnt) > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Already checked in here today',
          message: "You've already checked in here today. Come back tomorrow!",
          course_name: course.name,
          resets_at: new Date(sameDayStart.getTime() + 86400000).toISOString(),
        });
      }

      // Determine if new course for player
      const prevVisit = await client.query(
        'SELECT COUNT(*) as cnt FROM checkins WHERE player_id = $1 AND course_id = $2',
        [player.id, course.id]
      );
      const isNewCourse = parseInt(prevVisit.rows[0].cnt) === 0;

      // Check if first player ever at this course (trailblazer)
      const trailblazerCheck = await client.query(
        'SELECT COUNT(*) as cnt FROM checkins WHERE course_id = $1',
        [course.id]
      );
      const isTrailblazer = parseInt(trailblazerCheck.rows[0].cnt) === 0;

      // Check if first check-in of the day for this player
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const todayCheckinResult = await client.query(
        'SELECT COUNT(*) as cnt FROM checkins WHERE player_id = $1 AND checked_in_at >= $2',
        [player.id, todayStart.toISOString()]
      );
      const isDailyFirst = parseInt(todayCheckinResult.rows[0].cnt) === 0;

      const now = new Date();
      const isWeekendDay = isWeekend(now);
      const hour = getHourUTC(now);
      const isNight = hour >= 20 || hour < 0;   // 8PM–midnight UTC
      const isMorning = hour >= 5 && hour < 9;  // 5AM–9AM UTC
      const isBadWeather = ['rain', 'snow', 'cold', 'heat'].includes(weather_condition);

      // Insert check-in record (XP will be summed from transactions)
      const checkinResult = await client.query(
        `INSERT INTO checkins
          (player_id, course_id, xp_earned, is_round_complete, holes_logged, weather_condition, event_flags)
         VALUES ($1, $2, 0, $3, $4, $5, $6)
         RETURNING id`,
        [
          player.id,
          course.id,
          !!is_round_complete,
          holes_logged || null,
          weather_condition || null,
          JSON.stringify({ isWeekend: isWeekendDay, isNight, isMorning })
        ]
      );
      const checkinId = checkinResult.rows[0].id;

      // ── XP GRANTS ──
      const xpBreakdown = [];

      // 1. Base check-in XP
      const baseEvent = isNewCourse ? 'checkin_new_course' : 'checkin_return';
      const baseXpResult = await grantXp(client, player.id, baseEvent, { course_id, checkin_id: checkinId });
      xpBreakdown.push({ event: baseEvent, amount: baseXpResult.amount, label: isNewCourse ? 'New course!' : 'Return visit', boost_label: baseXpResult.boostLabel });

      // 2. Trailblazer bonus
      if (isTrailblazer) {
        const r = await grantXp(client, player.id, 'trailblazer_first', { course_id });
        xpBreakdown.push({ event: 'trailblazer_first', amount: r.amount, label: '🚀 First player here!' });
      }

      // 3. Daily first check-in bonus
      if (isDailyFirst) {
        const r = await grantXp(client, player.id, 'daily_first_checkin', { checkin_id: checkinId });
        xpBreakdown.push({ event: 'daily_first_checkin', amount: r.amount, label: 'First check-in of the day' });
      }

      // 4. Weekend warrior bonus
      if (isWeekendDay) {
        const r = await grantXp(client, player.id, 'weekend_warrior', { checkin_id: checkinId });
        xpBreakdown.push({ event: 'weekend_warrior', amount: r.amount, label: '🎉 Weekend warrior!' });
      }

      // 5. Bad weather bonus
      if (isBadWeather) {
        const r = await grantXp(client, player.id, 'bad_weather', { weather: weather_condition, checkin_id: checkinId });
        xpBreakdown.push({ event: 'bad_weather', amount: r.amount, label: `🌧️ Playing in ${weather_condition}!` });
      }

      // 6. Round completion bonus
      if (is_round_complete) {
        const r = await grantXp(client, player.id, 'round_complete', { checkin_id: checkinId, holes: holes_logged });
        xpBreakdown.push({ event: 'round_complete', amount: r.amount, label: '✅ Full round completed!' });

        // Increment round counter
        await client.query('UPDATE players SET total_rounds = total_rounds + 1 WHERE id = $1', [player.id]);
      }

      // 7. Post-XP stats for milestone checks
      const statsResult = await client.query(
        `SELECT COUNT(*) as total_checkins, COUNT(DISTINCT course_id) as unique_courses
         FROM checkins WHERE player_id = $1`,
        [player.id]
      );
      const totalCheckins = parseInt(statsResult.rows[0].total_checkins);
      const uniqueCourses = parseInt(statsResult.rows[0].unique_courses);

      const roundsResult = await client.query(
        'SELECT total_rounds FROM players WHERE id = $1',
        [player.id]
      );
      const totalRounds = parseInt(roundsResult.rows[0].total_rounds);

      // Check-in milestones
      const checkinMilestone = getCheckinMilestone(totalCheckins);
      if (checkinMilestone) {
        const r = await grantXp(client, player.id, checkinMilestone, { count: totalCheckins });
        xpBreakdown.push({ event: checkinMilestone, amount: r.amount, label: `🎯 ${totalCheckins} check-ins milestone!` });
      }

      // Course milestones
      const courseMilestone = getCourseMilestone(uniqueCourses);
      if (courseMilestone) {
        const r = await grantXp(client, player.id, courseMilestone, { count: uniqueCourses });
        xpBreakdown.push({ event: courseMilestone, amount: r.amount, label: `🗺️ ${uniqueCourses} courses milestone!` });
      }

      // Round milestones
      const roundMilestone = getRoundMilestone(totalRounds);
      if (roundMilestone) {
        const r = await grantXp(client, player.id, roundMilestone, { count: totalRounds });
        xpBreakdown.push({ event: roundMilestone, amount: r.amount, label: `✅ ${totalRounds} rounds milestone!` });
      }

      // Completed states: count states where player has visited ALL active courses in that state
      // (moved here because state milestone check below needs this result)
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

      // State champion milestone (first completed state)
      const totalCompletedStates = parseInt(completedStatesResult.rows[0].cnt);
      const stateMilestone = getStateMilestone(totalCompletedStates);
      if (stateMilestone) {
        const r = await grantXp(client, player.id, stateMilestone, { completed_states: totalCompletedStates });
        xpBreakdown.push({ event: stateMilestone, amount: r.amount, label: `🏅 State Champion! First state completed!` });
      }

      // Update checkin.xp_earned with total from breakdown
      const totalXpEarned = xpBreakdown.reduce((sum, e) => sum + e.amount, 0);
      await client.query('UPDATE checkins SET xp_earned = $1 WHERE id = $2', [totalXpEarned, checkinId]);

      // ── GOLD GRANTS ──
      const goldBreakdown = [];

      // 1. Base check-in gold
      const baseGoldEvent = isNewCourse ? 'checkin_new_course' : 'checkin_return';
      const baseGoldResult = await grantGold(client, player.id, baseGoldEvent, { course_id, checkin_id: checkinId });
      if (baseGoldResult.amount > 0) {
        goldBreakdown.push({ event: baseGoldEvent, amount: baseGoldResult.amount, label: isNewCourse ? 'New course!' : 'Return visit' });
      }
      const totalGoldEarned = goldBreakdown.reduce((sum, e) => sum + e.amount, 0);

      // ── BADGE EVALUATION ──
      // Load extended stats for badge checks
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

      // Trailblazer: count courses where this player was first
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

      // Battle stats from players table
      const playerFullResult = await client.query(
        'SELECT battle_wins, best_streak, total_rounds FROM players WHERE id = $1',
        [player.id]
      );
      const pf = playerFullResult.rows[0];

      // Challenges completed
      const challengesResult = await client.query(
        'SELECT COUNT(*) as cnt FROM player_challenges WHERE player_id = $1 AND completed = TRUE',
        [player.id]
      );

      // Unique opponents battled
      const opponentsResult = await client.query(`
        SELECT COUNT(DISTINCT CASE WHEN challenger_id = $1 THEN opponent_id ELSE challenger_id END) AS cnt
        FROM battles WHERE (challenger_id = $1 OR opponent_id = $1)
      `, [player.id]);

      // Completed cities: count cities where player has visited ALL courses
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

      // Seasons played (rough: spring=3-5, summer=6-8, fall=9-11, winter=12-2)
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
        completedStates: parseInt(completedStatesResult.rows[0].cnt),
      };

      // Load existing badges
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
        // Award gold for each badge unlock
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

      await client.query('COMMIT');

      // Sync course-specific checkin challenges (fire-and-forget after commit)
      (async () => {
        try {
          const courseCheckinCh = await pool.query(
            `SELECT id, target_value FROM challenges
             WHERE challenge_type = 'course_checkin' AND cadence = 'permanent' AND course_id = $1`,
            [course_id]
          );
          for (const ch of courseCheckinCh.rows) {
            const r = await pool.query(
              `SELECT COUNT(*) AS cnt FROM checkins WHERE player_id = $1 AND course_id = $2`,
              [player.id, course_id]
            );
            const progress = parseInt(r.rows[0]?.cnt || 0);
            const completed = progress >= ch.target_value;
            await pool.query(
              `INSERT INTO player_challenges (player_id, challenge_id, progress, completed, completed_at)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (player_id, challenge_id) DO UPDATE
                 SET progress = EXCLUDED.progress,
                     completed = CASE WHEN EXCLUDED.completed THEN TRUE ELSE player_challenges.completed END,
                     completed_at = CASE WHEN EXCLUDED.completed AND player_challenges.completed_at IS NULL THEN NOW() ELSE player_challenges.completed_at END`,
              [player.id, ch.id, progress, completed, completed ? new Date() : null]
            );
          }
        } catch (_e) { /* non-fatal — checkin challenge sync doesn't block response */ }
      })();

      // Re-fetch gold after all grants (including possible level-up gold)
      const finalGoldRes = await client.query('SELECT gold FROM players WHERE id = $1', [player.id]);
      const newGold = finalGoldRes.rows[0].gold;

      const levelProgress = getLevelProgress(finalXpPre);
      const levelTitle = getLevelTitle(newLevel);
      const finalTotalGold = goldBreakdown.reduce((sum, e) => sum + e.amount, 0);

      res.json({
        success: true,
        course_name: course.name,
        city: course.city,
        state: course.state,
        distance_meters: Math.round(distanceMeters),
        is_new_course: isNewCourse,
        is_trailblazer: isTrailblazer,

        // XP breakdown
        xp_earned: totalXpEarned,
        xp_breakdown: xpBreakdown,
        new_xp: finalXpPre,

        // Gold breakdown
        gold_earned: finalTotalGold,
        gold_breakdown: goldBreakdown,
        new_gold: newGold,

        // Level info
        old_level: oldLevel,
        new_level: newLevel,
        leveled_up: leveledUp,
        level_title: levelTitle.title,
        level_title_icon: levelTitle.icon,
        level_progress: levelProgress,

        // New badges this check-in
        new_badges: newBadges.map(b => ({
          category: b.category,
          tier: b.tier,
          name: BADGE_DEFINITIONS[b.category].name,
          label: b.tierDef.label,
          desc: b.tierDef.desc,
          icon: BADGE_DEFINITIONS[b.category].icon,
        })),
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Check-in error:', err.message, err.stack);
      res.status(500).json({ error: 'Check-in failed' });
    } finally {
      client.release();
    }
  });

  // GET /api/checkins/status — check if player has a valid check-in at a course today
  router.get('/checkins/status', requireAuth(pool), async (req, res) => {
    const courseId = parseInt(req.query.course_id);
    if (!courseId) return res.status(400).json({ error: 'course_id required' });

    try {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const result = await pool.query(
        `SELECT id, checked_in_at FROM checkins
         WHERE player_id = $1 AND course_id = $2 AND checked_in_at >= $3
         ORDER BY checked_in_at DESC LIMIT 1`,
        [req.player.id, courseId, todayStart.toISOString()]
      );
      const checkedIn = result.rows.length > 0;
      res.json({
        checked_in: checkedIn,
        checkin_id: checkedIn ? result.rows[0].id : null,
        checked_in_at: checkedIn ? result.rows[0].checked_in_at : null,
        course_id: courseId,
      });
    } catch (err) {
      console.error('Check-in status error:', err.message);
      res.status(500).json({ error: 'Failed to check status' });
    }
  });

  // GET /api/checkins/at-course — players currently checked in at this course (within last 2 hours)
  // Used by the "Add Players" step before starting a group round.
  // Returns all OTHER players checked in at the same course, excluding the requesting player.
  router.get('/checkins/at-course', requireAuth(pool), async (req, res) => {
    const courseId = parseInt(req.query.course_id);
    if (!courseId) return res.status(400).json({ error: 'course_id required' });

    try {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const result = await pool.query(
        `SELECT DISTINCT ON (p.id)
                p.id, p.display_name, p.profile_photo_url as avatar_url, p.xp, p.level,
                ci.checked_in_at
         FROM checkins ci
         JOIN players p ON p.id = ci.player_id
         WHERE ci.course_id = $1
           AND ci.checked_in_at >= $2
           AND ci.player_id != $3
         ORDER BY p.id, ci.checked_in_at DESC`,
        [courseId, twoHoursAgo.toISOString(), req.player.id]
      );
      res.json({ players: result.rows });
    } catch (err) {
      console.error('At-course checkins error:', err.message);
      res.status(500).json({ error: 'Failed to get checked-in players' });
    }
  });

  // GET /api/checkins/me — player's check-in history
  router.get('/checkins/me', requireAuth(pool), async (req, res) => {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = Math.max(0, parseInt(req.query.offset) || 0);

    try {
      const result = await pool.query(
        `SELECT ci.id, ci.checked_in_at, ci.xp_earned, ci.is_round_complete,
                ci.weather_condition, ci.holes_logged,
                c.name as course_name, c.city, c.state
         FROM checkins ci
         JOIN courses c ON c.id = ci.course_id
         WHERE ci.player_id = $1
         ORDER BY ci.checked_in_at DESC
         LIMIT $2 OFFSET $3`,
        [req.player.id, limit + 1, offset]
      );

      const hasMore = result.rows.length > limit;
      const checkins_rows = hasMore ? result.rows.slice(0, limit) : result.rows;

      res.json({ checkins: checkins_rows, limit, offset });
    } catch (err) {
      console.error('Get checkins error:', err.message);
      res.status(500).json({ error: 'Failed to get check-ins' });
    }
  });

  return router;
};
