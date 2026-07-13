// routes/checkins.js — GPS-gated course check-ins + check-in history.
// The reward pipeline (XP/gold/badges) lives in services/checkin-rewards.
// Distance math lives in lib/geo.

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { haversineMeters } = require('../lib/geo');
const { getLevelFromXp, getLevelProgress, getLevelTitle, BADGE_DEFINITIONS } = require('./xp-engine');
const { awardCheckinRewards } = require('../services/checkin-rewards');

// 800m: accommodates course coordinate variance (parking lot vs basket) and
// GPS error on Android devices (50-200m). A 600m course span + 150m GPS error
// = 750m — needs 800m to pass.
const CHECKIN_RADIUS_METERS = 800;

module.exports = ({ pool }) => {
  const router = express.Router();

  // POST /api/checkins — check in at a course (GPS-gated), applying all rewards.
  router.post('/checkins', requireAuth(pool), async (req, res, next) => {
    const { course_id, player_lat, player_lng, is_round_complete, holes_logged, weather_condition } = req.body;

    if (!course_id || player_lat === undefined || player_lng === undefined) {
      return res.status(400).json({ error: 'course_id, player_lat, and player_lng are required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

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

      const courseResult = await client.query(
        'SELECT id, name, city, state, lat, lng FROM courses WHERE id = $1',
        [course_id]
      );
      if (courseResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Course not found' });
      }
      const course = courseResult.rows[0];

      // GPS gate — no bypass; player must physically be at the course.
      const distanceMeters = haversineMeters(player_lat, player_lng, course.lat, course.lng);
      if (distanceMeters > CHECKIN_RADIUS_METERS) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Too far from course',
          distance_meters: Math.round(distanceMeters),
          required_meters: CHECKIN_RADIUS_METERS,
          course_name: course.name,
        });
      }

      // Same-course-per-day limit: different courses are fine, but not the same
      // course twice in one UTC calendar day.
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

      const rewards = await awardCheckinRewards(client, {
        player,
        course,
        isRoundComplete: is_round_complete,
        holesLogged: holes_logged,
        weatherCondition: weather_condition,
        oldLevel,
      });

      await client.query('COMMIT');

      // Sync course-specific check-in challenges (fire-and-forget after commit).
      syncCourseCheckinChallenges(pool, player.id, course_id).catch(() => {});

      const finalGoldRes = await client.query('SELECT gold FROM players WHERE id = $1', [player.id]);
      const levelTitle = getLevelTitle(rewards.newLevel);
      const finalTotalGold = rewards.goldBreakdown.reduce((sum, e) => sum + e.amount, 0);

      res.json({
        success: true,
        course_name: course.name,
        city: course.city,
        state: course.state,
        distance_meters: Math.round(distanceMeters),
        is_new_course: rewards.isNewCourse,
        is_trailblazer: rewards.isTrailblazer,

        xp_earned: rewards.totalXpEarned,
        xp_breakdown: rewards.xpBreakdown,
        new_xp: rewards.finalXpPre,

        gold_earned: finalTotalGold,
        gold_breakdown: rewards.goldBreakdown,
        new_gold: finalGoldRes.rows[0].gold,

        old_level: oldLevel,
        new_level: rewards.newLevel,
        leveled_up: rewards.leveledUp,
        level_title: levelTitle.title,
        level_title_icon: levelTitle.icon,
        level_progress: getLevelProgress(rewards.finalXpPre),

        new_badges: rewards.newBadges.map(b => ({
          category: b.category,
          tier: b.tier,
          name: BADGE_DEFINITIONS[b.category].name,
          label: b.tierDef.label,
          desc: b.tierDef.desc,
          icon: BADGE_DEFINITIONS[b.category].icon,
        })),
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  });

  // GET /api/checkins/status — does the player have a check-in at a course today?
  router.get('/checkins/status', requireAuth(pool), async (req, res, next) => {
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
      next(err);
    }
  });

  // GET /api/checkins/at-course — other players checked in at this course in the
  // last 2 hours. Used by the "Add Players" step before a group round.
  router.get('/checkins/at-course', requireAuth(pool), async (req, res, next) => {
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
      next(err);
    }
  });

  // GET /api/checkins/me — the player's check-in history (paginated).
  router.get('/checkins/me', requireAuth(pool), async (req, res, next) => {
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
      res.json({
        checkins: hasMore ? result.rows.slice(0, limit) : result.rows,
        limit,
        offset,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
};

// Upsert progress for permanent course-checkin challenges tied to this course.
// Best-effort — runs after the check-in transaction commits and never throws
// into the request path.
async function syncCourseCheckinChallenges(pool, playerId, courseId) {
  const challenges = await pool.query(
    `SELECT id, target_value FROM challenges
     WHERE challenge_type = 'course_checkin' AND cadence = 'permanent' AND course_id = $1`,
    [courseId]
  );
  for (const ch of challenges.rows) {
    const r = await pool.query(
      `SELECT COUNT(*) AS cnt FROM checkins WHERE player_id = $1 AND course_id = $2`,
      [playerId, courseId]
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
      [playerId, ch.id, progress, completed, completed ? new Date() : null]
    );
  }
}
