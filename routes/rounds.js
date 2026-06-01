const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { grantXp, grantGold, getRoundMilestone } = require('./xp-engine');
const { syncBattleProgress } = require('./battles');
const { syncWarProgress } = require('./crew-wars');
const { getActiveBoosts, awardGold, rollItemDrop, addToInventory, GOLD_EVENTS } = require('./vault');
const { processRoundDistanceAnalytics, getPlayerDistanceStats } = require('./distance-analytics');
const { checkQuestCompletion } = require('./story');

// ── Challenge progress sync after round completion ─────────────────────────────
// Computes and upserts rotating challenge progress for round-related types.
// Called after every round completion so the challenges board stays current.
async function syncRoundChallenges(pool, playerId, courseId) {
  try {
    const now = new Date();

    // Find all active rotating slots for round-related challenge types
    const slotsResult = await pool.query(
      `SELECT acs.id as slot_id, acs.cadence, acs.period_start, acs.period_end,
              ch.challenge_type, ch.target_value, ch.slug
       FROM active_challenge_slots acs
       JOIN challenges ch ON ch.id = acs.challenge_id
       WHERE acs.period_start <= $1 AND acs.period_end > $1
         AND ch.challenge_type IN (
           'daily_rounds','weekly_rounds','monthly_rounds',
           'daily_holes','weekly_holes','monthly_holes',
           'daily_birdies','weekly_birdies','monthly_birdies',
           'daily_pars','weekly_pars','monthly_pars',
           'round_under_par','round_birdies_single','round_zero_bogeys',
           'round_clutch_finish','round_ace','round_clean_sheet',
           'round_beat_best','round_birdie_streak','round_consistency',
           'streak_days_played','streak_weekend',
           'location_states','location_new_courses','location_same_course'
         )`,
      [now]
    );

    for (const slot of slotsResult.rows) {
      let progress = 0;
      const { challenge_type, period_start, period_end } = slot;

      if (['daily_rounds','weekly_rounds','monthly_rounds'].includes(challenge_type)) {
        const r = await pool.query(
          `SELECT COUNT(*) AS cnt FROM rounds
           WHERE player_id = $1 AND status = 'completed'
             AND completed_at >= $2 AND completed_at < $3`,
          [playerId, period_start, period_end]
        );
        progress = parseInt(r.rows[0].cnt);
      } else if (['daily_holes','weekly_holes','monthly_holes'].includes(challenge_type)) {
        const r = await pool.query(
          `SELECT COUNT(*) AS cnt FROM round_holes rh
           JOIN rounds ro ON ro.id = rh.round_id
           WHERE ro.player_id = $1 AND ro.started_at >= $2 AND ro.started_at < $3`,
          [playerId, period_start, period_end]
        );
        progress = parseInt(r.rows[0].cnt);
      } else if (['daily_birdies','weekly_birdies','monthly_birdies'].includes(challenge_type)) {
        const r = await pool.query(
          `SELECT COUNT(*) AS cnt FROM round_holes rh
           JOIN rounds ro ON ro.id = rh.round_id
           WHERE ro.player_id = $1 AND ro.started_at >= $2 AND ro.started_at < $3
             AND rh.score = rh.par - 1`,
          [playerId, period_start, period_end]
        );
        progress = parseInt(r.rows[0].cnt);
      } else if (['daily_pars','weekly_pars','monthly_pars'].includes(challenge_type)) {
        const r = await pool.query(
          `SELECT COUNT(*) AS cnt FROM round_holes rh
           JOIN rounds ro ON ro.id = rh.round_id
           WHERE ro.player_id = $1 AND ro.started_at >= $2 AND ro.started_at < $3
             AND rh.score = rh.par`,
          [playerId, period_start, period_end]
        );
        progress = parseInt(r.rows[0].cnt);
      } else if (challenge_type === 'round_under_par') {
        const r = await pool.query(
          `SELECT COUNT(*) AS cnt FROM rounds
           WHERE player_id = $1 AND status = 'completed'
             AND completed_at >= $2 AND completed_at < $3
             AND total_score < total_par`,
          [playerId, period_start, period_end]
        );
        progress = parseInt(r.rows[0].cnt);
      } else if (challenge_type === 'round_birdies_single') {
        const r = await pool.query(
          `SELECT COALESCE(MAX(birdie_cnt), 0) AS cnt FROM (
             SELECT ro.id, COUNT(*) FILTER (WHERE rh.score = rh.par - 1) AS birdie_cnt
             FROM rounds ro
             JOIN round_holes rh ON rh.round_id = ro.id
             WHERE ro.player_id = $1 AND ro.status = 'completed'
               AND ro.completed_at >= $2 AND ro.completed_at < $3
             GROUP BY ro.id
           ) t`,
          [playerId, period_start, period_end]
        );
        progress = parseInt(r.rows[0].cnt);
      } else if (challenge_type === 'round_zero_bogeys') {
        const r = await pool.query(
          `SELECT COUNT(*) AS cnt FROM (
             SELECT ro.id
             FROM rounds ro
             JOIN round_holes rh ON rh.round_id = ro.id
             WHERE ro.player_id = $1 AND ro.status = 'completed'
               AND ro.completed_at >= $2 AND ro.completed_at < $3
             GROUP BY ro.id
             HAVING COUNT(*) FILTER (WHERE rh.score > rh.par) = 0 AND COUNT(*) > 0
           ) t`,
          [playerId, period_start, period_end]
        );
        progress = parseInt(r.rows[0].cnt);
      } else if (challenge_type === 'round_clutch_finish') {
        const r = await pool.query(
          `SELECT COUNT(*) AS cnt FROM (
             SELECT ro.id
             FROM rounds ro
             JOIN round_holes rh ON rh.round_id = ro.id
               AND rh.hole_number = ro.holes_count
             WHERE ro.player_id = $1 AND ro.status = 'completed'
               AND ro.completed_at >= $2 AND ro.completed_at < $3
               AND rh.score <= rh.par - 1
           ) t`,
          [playerId, period_start, period_end]
        );
        progress = parseInt(r.rows[0].cnt);
      } else if (challenge_type === 'round_ace') {
        const r = await pool.query(
          `SELECT COUNT(DISTINCT ro.id) AS cnt
           FROM rounds ro
           JOIN round_holes rh ON rh.round_id = ro.id
           WHERE ro.player_id = $1 AND ro.status = 'completed'
             AND ro.completed_at >= $2 AND ro.completed_at < $3
             AND rh.score = 1 AND rh.par >= 2`,
          [playerId, period_start, period_end]
        );
        progress = parseInt(r.rows[0].cnt);
      } else if (challenge_type === 'round_clean_sheet') {
        const r = await pool.query(
          `SELECT COUNT(*) AS cnt FROM (
             SELECT ro.id
             FROM rounds ro
             JOIN round_holes rh ON rh.round_id = ro.id
             WHERE ro.player_id = $1 AND ro.status = 'completed'
               AND ro.holes_count = 18
               AND ro.completed_at >= $2 AND ro.completed_at < $3
             GROUP BY ro.id
             HAVING COUNT(*) FILTER (WHERE rh.score >= rh.par + 2) = 0
             AND COUNT(*) = 18
           ) t`,
          [playerId, period_start, period_end]
        );
        progress = parseInt(r.rows[0].cnt);
      } else if (challenge_type === 'round_beat_best') {
        const r = await pool.query(
          `SELECT COUNT(*) AS cnt FROM (
             SELECT ro.id
             FROM rounds ro
             JOIN player_course_bests pcb
               ON pcb.player_id = ro.player_id AND pcb.course_id = ro.course_id
                 AND pcb.best_round_id != ro.id
             WHERE ro.player_id = $1 AND ro.status = 'completed'
               AND ro.completed_at >= $2 AND ro.completed_at < $3
               AND (ro.total_score - ro.total_par) < pcb.best_score_vs_par
           ) t`,
          [playerId, period_start, period_end]
        );
        progress = parseInt(r.rows[0].cnt);
      } else if (challenge_type === 'round_birdie_streak') {
        const rounds = await pool.query(
          `SELECT id FROM rounds WHERE player_id = $1 AND status = 'completed'
             AND completed_at >= $2 AND completed_at < $3`,
          [playerId, period_start, period_end]
        );
        for (const round of rounds.rows) {
          const holes = await pool.query(
            `SELECT score, par FROM round_holes WHERE round_id = $1 ORDER BY hole_number ASC`,
            [round.id]
          );
          let streak = 0; let maxStreak = 0;
          for (const h of holes.rows) {
            if (h.score <= h.par - 1) { streak++; maxStreak = Math.max(maxStreak, streak); }
            else { streak = 0; }
          }
          if (maxStreak >= slot.target_value) { progress++; }
        }
      } else if (challenge_type === 'round_consistency') {
        const r = await pool.query(
          `SELECT COUNT(*) AS cnt FROM (
             SELECT ro.id
             FROM rounds ro
             JOIN (
               SELECT course_id, AVG(total_score - total_par) AS avg_vpar
               FROM rounds WHERE player_id = $1 AND status = 'completed'
                 AND completed_at < $2
               GROUP BY course_id HAVING COUNT(*) >= 2
             ) avg_data ON avg_data.course_id = ro.course_id
             WHERE ro.player_id = $1 AND ro.status = 'completed'
               AND ro.completed_at >= $2 AND ro.completed_at < $3
               AND ABS((ro.total_score - ro.total_par) - avg_data.avg_vpar) <= 2
           ) t`,
          [playerId, period_start, period_end]
        );
        progress = parseInt(r.rows[0].cnt);
      } else if (challenge_type === 'streak_days_played') {
        const r = await pool.query(
          `SELECT COUNT(DISTINCT DATE(completed_at)) AS cnt FROM rounds
           WHERE player_id = $1 AND status = 'completed'
             AND completed_at >= $2 AND completed_at < $3`,
          [playerId, period_start, period_end]
        );
        progress = parseInt(r.rows[0].cnt);
      } else if (challenge_type === 'streak_weekend') {
        const r = await pool.query(
          `SELECT COUNT(DISTINCT EXTRACT(DOW FROM completed_at)) AS cnt FROM rounds
           WHERE player_id = $1 AND status = 'completed'
             AND completed_at >= $2 AND completed_at < $3
             AND EXTRACT(DOW FROM completed_at) IN (0, 6)`,
          [playerId, period_start, period_end]
        );
        progress = parseInt(r.rows[0].cnt);
      } else if (challenge_type === 'location_states') {
        const r = await pool.query(
          `SELECT COUNT(DISTINCT co.state) AS cnt
           FROM rounds ro JOIN courses co ON co.id = ro.course_id
           WHERE ro.player_id = $1 AND ro.status = 'completed'
             AND ro.completed_at >= $2 AND ro.completed_at < $3
             AND co.state IS NOT NULL`,
          [playerId, period_start, period_end]
        );
        progress = parseInt(r.rows[0].cnt);
      } else if (challenge_type === 'location_new_courses') {
        const r = await pool.query(
          `SELECT COUNT(DISTINCT ci.course_id) AS cnt FROM checkins ci
           WHERE ci.player_id = $1 AND ci.checked_in_at >= $2 AND ci.checked_in_at < $3
             AND ci.course_id NOT IN (
               SELECT DISTINCT course_id FROM checkins
               WHERE player_id = $1 AND checked_in_at < $2
             )`,
          [playerId, period_start, period_end]
        );
        progress = parseInt(r.rows[0].cnt);
      } else if (challenge_type === 'location_same_course') {
        const r = await pool.query(
          `SELECT COALESCE(MAX(cnt), 0) AS cnt FROM (
             SELECT course_id, COUNT(*) AS cnt FROM rounds
             WHERE player_id = $1 AND status = 'completed'
               AND completed_at >= $2 AND completed_at < $3
             GROUP BY course_id
           ) t`,
          [playerId, period_start, period_end]
        );
        progress = parseInt(r.rows[0].cnt);
      }

      const completed = progress >= slot.target_value;
      await pool.query(
        `INSERT INTO player_challenge_slots (player_id, slot_id, progress, completed, completed_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (player_id, slot_id) DO UPDATE
           SET progress = EXCLUDED.progress,
               completed = CASE WHEN EXCLUDED.completed THEN TRUE ELSE player_challenge_slots.completed END,
               completed_at = CASE WHEN EXCLUDED.completed AND player_challenge_slots.completed_at IS NULL THEN NOW() ELSE player_challenge_slots.completed_at END`,
        [playerId, slot.slot_id, progress, completed, completed ? new Date() : null]
      );
    }

    // Also sync permanent challenge: full_rounds
    const fullRoundsCh = await pool.query(
      `SELECT id, target_value FROM challenges WHERE challenge_type = 'full_rounds' AND cadence = 'permanent'`
    );
    for (const ch of fullRoundsCh.rows) {
      const r = await pool.query('SELECT total_rounds AS cnt FROM players WHERE id = $1', [playerId]);
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

    // Sync course-specific challenge: course_rounds (if this round was at a specific course)
    if (courseId) {
      const courseRoundsCh = await pool.query(
        `SELECT id, target_value FROM challenges
         WHERE challenge_type = 'course_rounds' AND cadence = 'permanent' AND course_id = $1`,
        [courseId]
      );
      for (const ch of courseRoundsCh.rows) {
        const r = await pool.query(
          `SELECT COUNT(*) AS cnt FROM rounds WHERE player_id = $1 AND course_id = $2 AND status = 'completed'`,
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
  } catch (err) {
    // Non-fatal — don't let challenge sync break round completion
    console.error('Challenge sync error (non-fatal):', err.message);
  }
}

// ── completeCoPlayerRounds ─────────────────────────────────────────────────────
// After the host completes a round, create a completed round record for each
// co-player, compute their totals from round_player_holes, and grant XP/gold.
// Fire-and-forget — non-fatal if it partially fails.
async function completeCoPlayerRounds(pool, hostRoundId, hostRound) {
  // Find co-players in this group
  const coPlayersResult = await pool.query(
    `SELECT player_id FROM round_players WHERE round_id = $1 AND is_host = FALSE`,
    [hostRoundId]
  );
  if (coPlayersResult.rows.length === 0) return;

  for (const { player_id: coPlayerId } of coPlayersResult.rows) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Compute totals from this co-player's holes
      const holesResult = await client.query(
        `SELECT SUM(score) as total_score, SUM(par) as total_par, COUNT(*) as holes_logged,
                COUNT(*) FILTER (WHERE score = 1 AND par >= 2) as aces,
                COUNT(*) FILTER (WHERE score <= par - 2 AND score > 1) as eagles,
                COUNT(*) FILTER (WHERE score = par - 1) as birdies
         FROM round_player_holes
         WHERE round_id = $1 AND player_id = $2`,
        [hostRoundId, coPlayerId]
      );
      const { total_score, total_par, holes_logged } = holesResult.rows[0];
      if (parseInt(holes_logged) < 3) {
        await client.query('ROLLBACK');
        continue; // Not enough holes recorded for this co-player
      }

      // Create co-player's own completed round record
      const coRound = await client.query(
        `INSERT INTO rounds (player_id, course_id, holes_count, status, completed_at, total_score, total_par, started_at)
         VALUES ($1, $2, $3, 'completed', NOW(), $4, $5, $6)
         RETURNING id`,
        [coPlayerId, hostRound.course_id, hostRound.holes_count, total_score, total_par, hostRound.started_at]
      );
      const coRoundId = coRound.rows[0].id;

      // Copy hole scores into round_holes for the co-player's round
      await client.query(
        `INSERT INTO round_holes (round_id, hole_number, par, score)
         SELECT $1, hole_number, par, score FROM round_player_holes
         WHERE round_id = $2 AND player_id = $3`,
        [coRoundId, hostRoundId, coPlayerId]
      );

      // Increment co-player's total_rounds
      await client.query(
        `UPDATE players SET total_rounds = total_rounds + 1 WHERE id = $1`,
        [coPlayerId]
      );

      let activeBoosts = [];
      try { activeBoosts = await getActiveBoosts(client, coPlayerId); } catch (_e) {}

      // Grant XP
      await grantXp(client, coPlayerId, 'round_complete', {
        round_id: coRoundId,
        holes_logged: parseInt(holes_logged),
        score_vs_par: parseInt(total_score) - parseInt(total_par),
      }, activeBoosts);

      // Grant gold
      try {
        await awardGold(client, coPlayerId, 'round_complete',
          GOLD_EVENTS.round_complete, activeBoosts, { round_id: coRoundId });
      } catch (_e) {}

      await client.query('COMMIT');

      // Fire-and-forget challenge sync
      syncRoundChallenges(pool, coPlayerId, hostRound.course_id);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Co-player ${coPlayerId} round completion error:`, err.message);
    } finally {
      client.release();
    }
  }
}

module.exports = ({ pool }) => {
  const router = express.Router();

  // POST /api/rounds/start — begin a new round (solo or group)
  // REQUIRES: valid GPS check-in at the course today for ALL players in the group
  // Body: { course_id, holes_count?, layout_id?, co_player_ids?: number[] }
  // layout_id — optional; auto-selects the course default if omitted.
  //   Falls back to null (generic par) if the course has no layouts yet.
  // co_player_ids — optional array of player IDs to add to the group.
  //   Each must have a valid check-in at the same course within the last 2 hours.
  router.post('/rounds/start', requireAuth(pool), async (req, res) => {
    const { course_id, holes_count = 18, layout_id = null, co_player_ids = [] } = req.body;
    if (!course_id) return res.status(400).json({ error: 'course_id required' });

    // Deduplicate and exclude host from co-players list
    const coPlayerIds = [...new Set((co_player_ids || []).map(Number))].filter(id => id !== req.player.id);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // ── GPS CHECK-IN GATE: host ──
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const hostCheckin = await client.query(
        `SELECT id FROM checkins
         WHERE player_id = $1 AND course_id = $2 AND checked_in_at >= $3
         LIMIT 1`,
        [req.player.id, course_id, todayStart.toISOString()]
      );
      if (hostCheckin.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          error: 'GPS check-in required',
          message: 'You must check in at this course before starting a round. Go to Check In, get within 500m of the course, and check in first.',
          requires_checkin: true,
          course_id: course_id,
        });
      }

      // ── GPS CHECK-IN GATE: co-players (within last 2 hours) ──
      if (coPlayerIds.length > 0) {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const coCheckins = await client.query(
          `SELECT DISTINCT player_id FROM checkins
           WHERE player_id = ANY($1::int[]) AND course_id = $2 AND checked_in_at >= $3`,
          [coPlayerIds, course_id, twoHoursAgo.toISOString()]
        );
        const checkedInIds = new Set(coCheckins.rows.map(r => r.player_id));
        const missingCheckins = coPlayerIds.filter(id => !checkedInIds.has(id));
        if (missingCheckins.length > 0) {
          await client.query('ROLLBACK');
          return res.status(403).json({
            error: 'Co-player GPS check-in required',
            message: 'All players in the group must be checked in at this course.',
            missing_player_ids: missingCheckins,
          });
        }
      }

      // ── VALIDATE HOLE COUNT against course ──
      const courseCheck = await client.query(
        `SELECT COALESCE(hole_count, holes, 18) AS course_holes FROM courses WHERE id = $1`,
        [course_id]
      );
      if (courseCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Course not found' });
      }
      const courseHoles = parseInt(courseCheck.rows[0].course_holes);
      if (holes_count > courseHoles) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Invalid hole count',
          message: `This course has ${courseHoles} holes. You cannot play more than ${courseHoles}.`,
          course_holes: courseHoles,
        });
      }

      // ── RESOLVE LAYOUT ────────────────────────────────────────────────────
      // If layout_id provided, verify it belongs to this course.
      // If not provided, auto-select the course default layout.
      // Falls back to null when the course has no layouts yet.
      let resolvedLayoutId = null;
      let layoutHoles = [];

      if (layout_id) {
        const layoutCheck = await client.query(
          `SELECT id FROM course_layouts WHERE id = $1 AND course_id = $2`,
          [layout_id, course_id]
        );
        if (layoutCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Layout does not belong to this course' });
        }
        resolvedLayoutId = layout_id;
      } else {
        // Auto-select default layout (or only layout if just one exists)
        const defaultLayout = await client.query(
          `SELECT id FROM course_layouts
           WHERE course_id = $1
           ORDER BY is_default DESC, id ASC
           LIMIT 1`,
          [course_id]
        );
        if (defaultLayout.rows.length > 0) {
          resolvedLayoutId = defaultLayout.rows[0].id;
        }
      }

      // Fetch hole data for the resolved layout (for use during the round)
      if (resolvedLayoutId) {
        const holesRes = await client.query(
          `SELECT hole_number, par, distance_ft, notes
           FROM course_holes
           WHERE layout_id = $1
           ORDER BY hole_number ASC`,
          [resolvedLayoutId]
        );
        layoutHoles = holesRes.rows;
      }

      // Abandon any existing in-progress round for this player
      await client.query(
        `UPDATE rounds SET status = 'abandoned' WHERE player_id = $1 AND status = 'in_progress'`,
        [req.player.id]
      );

      // Create the host's round record
      const result = await client.query(
        `INSERT INTO rounds (player_id, course_id, holes_count, layout_id, status)
         VALUES ($1, $2, $3, $4, 'in_progress')
         RETURNING *`,
        [req.player.id, course_id, holes_count, resolvedLayoutId]
      );
      const round = result.rows[0];

      // ── Register group roster in round_players ──
      // Host row
      await client.query(
        `INSERT INTO round_players (round_id, player_id, is_host) VALUES ($1, $2, TRUE)
         ON CONFLICT (round_id, player_id) DO NOTHING`,
        [round.id, req.player.id]
      );
      // Co-player rows
      for (const coId of coPlayerIds) {
        await client.query(
          `INSERT INTO round_players (round_id, player_id, is_host) VALUES ($1, $2, FALSE)
           ON CONFLICT (round_id, player_id) DO NOTHING`,
          [round.id, coId]
        );
      }

      await client.query('COMMIT');
      // layout_holes gives the frontend per-hole par/distance without a second round-trip
      res.json({ round, group_size: 1 + coPlayerIds.length, layout_holes: layoutHoles });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Start round error:', err.message);
      res.status(500).json({ error: 'Failed to start round' });
    } finally {
      client.release();
    }
  });

  // POST /api/rounds/:id/add-players — add checked-in players to an in-progress round (mid-round)
  // Only the round host can add players. Each co-player must have a valid check-in at the course.
  router.post('/rounds/:id/add-players', requireAuth(pool), async (req, res) => {
    const roundId = parseInt(req.params.id);
    const { player_ids = [] } = req.body;
    if (!roundId || !Array.isArray(player_ids) || player_ids.length === 0) {
      return res.status(400).json({ error: 'player_ids[] required' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Verify round exists, is in_progress, and belongs to the requesting player (host)
      const roundCheck = await client.query(
        `SELECT id, course_id, status FROM rounds WHERE id = $1 AND player_id = $2`,
        [roundId, req.player.id]
      );
      if (roundCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Only the round host can add players' });
      }
      const round = roundCheck.rows[0];
      if (round.status !== 'in_progress') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Round is not in progress' });
      }
      // Deduplicate and exclude host
      const newIds = [...new Set(player_ids.map(Number))].filter(id => id !== req.player.id);
      if (newIds.length === 0) {
        await client.query('ROLLBACK');
        return res.json({ added: 0, message: 'No new players to add' });
      }
      // GPS check-in gate: each must be checked in at the course within 2 hours
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const coCheckins = await client.query(
        `SELECT DISTINCT player_id FROM checkins
         WHERE player_id = ANY($1::int[]) AND course_id = $2 AND checked_in_at >= $3`,
        [newIds, round.course_id, twoHoursAgo.toISOString()]
      );
      const checkedInIds = new Set(coCheckins.rows.map(r => r.player_id));
      const missing = newIds.filter(id => !checkedInIds.has(id));
      if (missing.length > 0) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          error: 'Co-player GPS check-in required',
          message: 'All players must be checked in at this course.',
          missing_player_ids: missing,
        });
      }
      // Insert round_players rows (skip duplicates)
      let added = 0;
      for (const coId of newIds) {
        const ins = await client.query(
          `INSERT INTO round_players (round_id, player_id, is_host) VALUES ($1, $2, FALSE)
           ON CONFLICT (round_id, player_id) DO NOTHING RETURNING id`,
          [roundId, coId]
        );
        if (ins.rows.length > 0) added++;
      }
      await client.query('COMMIT');
      // Return total group size (host + all co-players) for accurate display
      const sizeResult = await pool.query(
        `SELECT COUNT(*) as total FROM round_players WHERE round_id = $1`,
        [roundId]
      );
      const group_size = parseInt(sizeResult.rows[0].total);
      res.json({ added, group_size });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Add players error:', err.message);
      res.status(500).json({ error: 'Failed to add players' });
    } finally {
      client.release();
    }
  });

  // GET /api/rounds/active — get the in-progress round for the player
  // Returns the round, scored holes, and layout holes (for per-hole par/distance display).
  router.get('/rounds/active', requireAuth(pool), async (req, res) => {
    try {
      const roundResult = await pool.query(
        `SELECT r.*, co.name as course_name, co.city, co.state, co.holes as course_holes,
                cl.name as layout_name
         FROM rounds r
         LEFT JOIN courses co ON co.id = r.course_id
         LEFT JOIN course_layouts cl ON cl.id = r.layout_id
         WHERE r.player_id = $1 AND r.status = 'in_progress'
         ORDER BY r.started_at DESC LIMIT 1`,
        [req.player.id]
      );

      if (roundResult.rows.length === 0) {
        return res.json({ round: null });
      }

      const round = roundResult.rows[0];

      const [holesResult, layoutHolesResult] = await Promise.all([
        pool.query(
          `SELECT id, round_id, hole_number, par, score FROM round_holes WHERE round_id = $1 ORDER BY hole_number ASC`,
          [round.id]
        ),
        round.layout_id ? pool.query(
          `SELECT hole_number, par, distance_ft, notes
           FROM course_holes WHERE layout_id = $1 ORDER BY hole_number ASC`,
          [round.layout_id]
        ) : Promise.resolve({ rows: [] }),
      ]);

      res.json({ round, holes: holesResult.rows, layout_holes: layoutHolesResult.rows });
    } catch (err) {
      console.error('Get active round error:', err.message);
      res.status(500).json({ error: 'Failed to get active round' });
    }
  });

  // GET /api/rounds/:id/players — get all players and their per-hole scores for a group round
  // Returns the full group scorecard: host holes from round_holes, co-player holes from round_player_holes.
  router.get('/rounds/:id/players', requireAuth(pool), async (req, res) => {
    const roundId = parseInt(req.params.id);
    try {
      // Verify the requesting player is part of this round (host or co-player)
      const membership = await pool.query(
        `SELECT rp.is_host, r.player_id as host_player_id, r.course_id, r.holes_count, r.status
         FROM round_players rp
         JOIN rounds r ON r.id = rp.round_id
         WHERE rp.round_id = $1 AND rp.player_id = $2`,
        [roundId, req.player.id]
      );
      if (membership.rows.length === 0) {
        // Also allow if they are the host (for backward compat with rounds before round_players existed)
        const directCheck = await pool.query(
          `SELECT id FROM rounds WHERE id = $1 AND player_id = $2`,
          [roundId, req.player.id]
        );
        if (directCheck.rows.length === 0) {
          return res.status(404).json({ error: 'Round not found or you are not in this group' });
        }
      }

      // Get all group members
      const rosterResult = await pool.query(
        `SELECT rp.player_id, rp.is_host, p.display_name, p.profile_photo_url as avatar_url, p.xp, p.level
         FROM round_players rp
         JOIN players p ON p.id = rp.player_id
         WHERE rp.round_id = $1
         ORDER BY rp.is_host DESC, rp.joined_at ASC`,
        [roundId]
      );

      // Get host's holes
      const hostHoles = await pool.query(
        `SELECT hole_number, par, score FROM round_holes WHERE round_id = $1 ORDER BY hole_number`,
        [roundId]
      );

      // Get co-player holes
      const coPlayerHoles = await pool.query(
        `SELECT player_id, hole_number, par, score FROM round_player_holes
         WHERE round_id = $1 ORDER BY player_id, hole_number`,
        [roundId]
      );

      // Get the host round for reference
      const roundInfo = await pool.query(
        `SELECT r.*, co.name as course_name, co.city, co.state
         FROM rounds r LEFT JOIN courses co ON co.id = r.course_id
         WHERE r.id = $1`,
        [roundId]
      );

      // Index co-player holes by player_id
      const coPlayerHoleMap = {};
      for (const h of coPlayerHoles.rows) {
        if (!coPlayerHoleMap[h.player_id]) coPlayerHoleMap[h.player_id] = [];
        coPlayerHoleMap[h.player_id].push({ hole_number: h.hole_number, par: h.par, score: h.score });
      }

      // Attach holes to roster
      const players = rosterResult.rows.map(rp => ({
        player_id: rp.player_id,
        display_name: rp.display_name,
        avatar_url: rp.avatar_url,
        xp: rp.xp,
        level: rp.level,
        is_host: rp.is_host,
        holes: rp.is_host ? hostHoles.rows : (coPlayerHoleMap[rp.player_id] || []),
      }));

      res.json({
        round: roundInfo.rows[0] || null,
        players,
      });
    } catch (err) {
      console.error('Get round players error:', err.message);
      res.status(500).json({ error: 'Failed to get round players' });
    }
  });

  // POST /api/rounds/:id/hole — log or update a hole score (solo or group)
  // Only the round host may submit. Host score goes to round_holes; co-player scores
  // go to round_player_holes.
  // Body: { hole_number, par, score, player_scores?: [{player_id, score}] }
  // player_scores — optional array of co-player scores for this hole.
  router.post('/rounds/:id/hole', requireAuth(pool), async (req, res) => {
    const roundId = parseInt(req.params.id);
    const { hole_number, par, score, player_scores = [] } = req.body;

    // score is optional when only co-player scores are being saved (host hasn't scored this hole yet)
    const hasHostScore = score != null;
    if (!hole_number || !par) {
      return res.status(400).json({ error: 'hole_number and par are required' });
    }
    if (hasHostScore && (score < 1 || score > 15)) {
      return res.status(400).json({ error: 'Score must be between 1 and 15' });
    }
    if (par < 2 || par > 6) {
      return res.status(400).json({ error: 'Par must be between 2 and 6' });
    }
    if (!hasHostScore && player_scores.length === 0) {
      return res.status(400).json({ error: 'score is required when no player_scores provided' });
    }

    // Validate co-player scores if provided
    for (const ps of player_scores) {
      if (!ps.player_id || !ps.score) return res.status(400).json({ error: 'Each player_score needs player_id and score' });
      if (ps.score < 1 || ps.score > 15) return res.status(400).json({ error: `Score out of range for player ${ps.player_id}` });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify host ownership — only the round creator advances the scorecard
      const roundResult = await client.query(
        `SELECT id FROM rounds WHERE id = $1 AND player_id = $2 AND status = 'in_progress'`,
        [roundId, req.player.id]
      );
      if (roundResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Active round not found or you are not the host' });
      }

      // Host score → round_holes (only when host has a score; co-player-only saves skip this)
      let result = { rows: [null] };
      if (hasHostScore) {
        result = await client.query(
          `INSERT INTO round_holes (round_id, hole_number, par, score)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (round_id, hole_number)
           DO UPDATE SET par = EXCLUDED.par, score = EXCLUDED.score
           RETURNING *`,
          [roundId, hole_number, par, score]
        );
      }

      // Co-player scores → round_player_holes (only for registered group members)
      if (player_scores.length > 0) {
        // Verify the submitted player IDs are actually in this round's group
        const rosterResult = await client.query(
          `SELECT player_id FROM round_players WHERE round_id = $1 AND is_host = FALSE`,
          [roundId]
        );
        const rosterIds = new Set(rosterResult.rows.map(r => r.player_id));

        for (const ps of player_scores) {
          if (!rosterIds.has(ps.player_id)) continue; // silently skip non-members
          await client.query(
            `INSERT INTO round_player_holes (round_id, player_id, hole_number, par, score)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (round_id, player_id, hole_number)
             DO UPDATE SET par = EXCLUDED.par, score = EXCLUDED.score`,
            [roundId, ps.player_id, hole_number, par, ps.score]
          );
        }
      }

      await client.query('COMMIT');

      // Return updated hole count for host
      const countResult = await pool.query(
        `SELECT COUNT(*) as logged FROM round_holes WHERE round_id = $1`,
        [roundId]
      );

      res.json({
        hole: result.rows[0],
        holes_logged: parseInt(countResult.rows[0].logged),
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Log hole error:', err.message);
      res.status(500).json({ error: 'Failed to log hole' });
    } finally {
      client.release();
    }
  });

  // POST /api/rounds/:id/complete — finish the round, compute totals, award XP
  // GPS check-in is required at round START only; completion is gated only by hole count.
  router.post('/rounds/:id/complete', requireAuth(pool), async (req, res) => {
    const roundId = parseInt(req.params.id);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get round + verify ownership
      const roundResult = await client.query(
        `SELECT r.*, COALESCE(co.hole_count, co.holes, 18) as course_holes,
                co.name as course_name, co.city as course_city, co.state as course_state
         FROM rounds r
         LEFT JOIN courses co ON co.id = r.course_id
         WHERE r.id = $1 AND r.player_id = $2 AND r.status = 'in_progress'`,
        [roundId, req.player.id]
      );
      if (roundResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Active round not found' });
      }
      const round = roundResult.rows[0];

      // Compute totals from logged holes
      const holesResult = await client.query(
        `SELECT SUM(score) as total_score, SUM(par) as total_par, COUNT(*) as holes_logged,
                COUNT(*) FILTER (WHERE score = 1 AND par >= 2) as aces,
                COUNT(*) FILTER (WHERE score <= par - 2 AND score > 1) as eagles,
                COUNT(*) FILTER (WHERE score = par - 1) as birdies,
                COUNT(*) FILTER (WHERE score = par) as pars,
                COUNT(*) FILTER (WHERE score = par + 1) as bogeys,
                COUNT(*) FILTER (WHERE score >= par + 2) as doubles_plus,
                MIN(score - par) as best_vs_par,
                MAX(score - par) as worst_vs_par
         FROM round_holes WHERE round_id = $1`,
        [roundId]
      );
      const allHolesResult = await client.query(
        `SELECT hole_number, par, score FROM round_holes WHERE round_id = $1 ORDER BY score - par ASC`,
        [roundId]
      );
      const { total_score, total_par, holes_logged, aces, eagles, birdies, pars, bogeys, doubles_plus } = holesResult.rows[0];

      if (parseInt(holes_logged) < 3) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Need at least 3 holes logged to complete a round' });
      }

      // ── HOLE COUNT VALIDATION ──
      // Only enforce for rounds that have a configured hole count.
      // Legacy rounds (holes_count IS NULL — pre-layout-selection era) have no
      // enforced hole target; skip validation to prevent false rejection.
      const expectedHoles = round.holes_count;
      if (expectedHoles !== null && expectedHoles !== undefined && parseInt(holes_logged) !== expectedHoles) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Hole count mismatch',
          message: `This round requires exactly ${expectedHoles} holes. You have logged ${parseInt(holes_logged)}.`,
          expected: expectedHoles,
          logged: parseInt(holes_logged),
        });
      }

      // Best/worst hole
      const allHoles = allHolesResult.rows;
      const bestHole = allHoles.length > 0 ? allHoles[0] : null;
      const worstHole = allHoles.length > 0 ? allHoles[allHoles.length - 1] : null;

      // Mark round complete
      await client.query(
        `UPDATE rounds
         SET status = 'completed', completed_at = NOW(),
             total_score = $2, total_par = $3
         WHERE id = $1`,
        [roundId, total_score, total_par]
      );

      // Increment total_rounds on player
      await client.query(
        `UPDATE players SET total_rounds = total_rounds + 1 WHERE id = $1`,
        [req.player.id]
      );
      const playerResult = await client.query(
        `SELECT total_rounds FROM players WHERE id = $1`,
        [req.player.id]
      );
      const totalRounds = playerResult.rows[0].total_rounds;

      // Fetch active boosts once, reuse for XP and gold
      let activeBoosts = [];
      try {
        activeBoosts = await getActiveBoosts(client, req.player.id);
      } catch (_e) { /* non-fatal */ }

      // Award round_complete XP (boost-aware)
      const xpResult = await grantXp(client, req.player.id, 'round_complete', {
        round_id: roundId,
        holes_logged: parseInt(holes_logged),
        score_vs_par: parseInt(total_score) - parseInt(total_par),
      }, activeBoosts);

      // Milestone XP
      let milestoneXp = null;
      const milestone = getRoundMilestone(totalRounds);
      if (milestone) {
        const mr = await grantXp(client, req.player.id, milestone, { total_rounds: totalRounds }, activeBoosts);
        milestoneXp = mr.amount;
      }

      // Award gold for round completion (boost-aware)
      let goldResult = null;
      try {
        goldResult = await awardGold(client, req.player.id, 'round_complete',
          GOLD_EVENTS.round_complete,
          activeBoosts,
          { round_id: roundId }
        );
      } catch (_e) { /* non-fatal — gold failures don't block round completion */ }

      // ── Personal best tracking ──────────────────────────────────────────────
      // Upsert player_course_bests; detect if this round sets a new course record
      let isNewCourseBest = false;
      if (round.course_id && total_score != null && total_par != null) {
        const scoreVsPar = parseInt(total_score) - parseInt(total_par);
        const existingBest = await client.query(
          `SELECT best_score_vs_par FROM player_course_bests
           WHERE player_id = $1 AND course_id = $2`,
          [req.player.id, round.course_id]
        );
        if (existingBest.rows.length === 0) {
          // First round at this course
          await client.query(
            `INSERT INTO player_course_bests (player_id, course_id, best_score_vs_par, best_round_id)
             VALUES ($1, $2, $3, $4)`,
            [req.player.id, round.course_id, scoreVsPar, roundId]
          );
          isNewCourseBest = totalRounds > 1; // first-ever round at course is only a "best" if not literally their first ever
        } else if (scoreVsPar < existingBest.rows[0].best_score_vs_par) {
          isNewCourseBest = true;
          await client.query(
            `UPDATE player_course_bests
             SET best_score_vs_par = $3, best_round_id = $4, recorded_at = NOW()
             WHERE player_id = $1 AND course_id = $2`,
            [req.player.id, round.course_id, scoreVsPar, roundId]
          );
        }
      }

      // ── Detect first ace (all-time) ─────────────────────────────────────────
      const isFirstAce = parseInt(aces) > 0 && (() => {
        // Non-blocking check: we'll do this after commit
        return false; // placeholder — computed below after commit
      })();

      await client.query('COMMIT');

      // Roll for item drop (fire-and-forget after commit)
      let itemDrop = null;
      try {
        const dropped = await rollItemDrop(pool, req.player.id, activeBoosts);
        if (dropped) {
          const dropClient = await pool.connect();
          try {
            await dropClient.query('BEGIN');
            await addToInventory(dropClient, req.player.id, dropped.id, 'drop');
            await dropClient.query('COMMIT');
            itemDrop = {
              name: dropped.name,
              icon: dropped.icon,
              rarity: dropped.rarity,
              description: dropped.description,
            };
          } catch (_e) {
            await dropClient.query('ROLLBACK');
          } finally {
            dropClient.release();
          }
        }
      } catch (_e) { /* non-fatal */ }

      // ── Personal records detection (post-commit, non-fatal) ────────────────
      const personalRecords = [];
      try {
        // New best round at this course
        if (isNewCourseBest) {
          const cname = round.course_name || 'this course';
          personalRecords.push({ type: 'course_best', message: `New best round at ${cname}! 🏆` });
        }

        // First ace ever
        if (parseInt(aces) > 0) {
          const prevAces = await pool.query(
            `SELECT COUNT(DISTINCT ro.id) AS cnt
             FROM rounds ro JOIN round_holes rh ON rh.round_id = ro.id
             WHERE ro.player_id = $1 AND ro.status = 'completed'
               AND ro.id != $2 AND rh.score = 1 AND rh.par >= 2`,
            [req.player.id, roundId]
          );
          if (parseInt(prevAces.rows[0].cnt) === 0) {
            personalRecords.push({ type: 'first_ace', message: 'Your first ACE ever! 🎯🔥' });
          }
        }

        // Compute birdie streak for highlight (max consecutive birdies in this round)
        const allHolesOrdered = await pool.query(
          `SELECT score, par FROM round_holes WHERE round_id = $1 ORDER BY hole_number ASC`,
          [roundId]
        );
        let maxStreak = 0; let streak = 0;
        for (const h of allHolesOrdered.rows) {
          if (h.score <= h.par - 1) { streak++; maxStreak = Math.max(maxStreak, streak); }
          else { streak = 0; }
        }
        if (maxStreak >= 3) {
          personalRecords.push({ type: 'birdie_streak', message: `${maxStreak}-birdie streak in this round! 🔥` });
        }

        // Count challenges newly completed this round (fire-and-forget data)
        const completedChallenges = await pool.query(
          `SELECT COUNT(*) AS cnt FROM player_challenge_slots
           WHERE player_id = $1 AND completed = TRUE AND claimed = FALSE`,
          [req.player.id]
        );
        const unclaimedChallenges = parseInt(completedChallenges.rows[0].cnt);
        if (unclaimedChallenges > 0) {
          personalRecords.push({ type: 'challenges_ready', message: `${unclaimedChallenges} challenge${unclaimedChallenges > 1 ? 's' : ''} ready to claim! ⚡`, count: unclaimedChallenges });
        }
      } catch (_e) { /* non-fatal */ }

      // Fire-and-forget: sync challenge, battle, and crew war progress (non-blocking)
      syncRoundChallenges(pool, req.player.id, round.course_id);
      syncBattleProgress(pool, req.player.id, roundId, { total_score: parseInt(total_score) });
      syncWarProgress(pool, req.player.id, roundId, { total_score: parseInt(total_score) });

      // ── Story Mode Quest Checking (non-blocking) ─────────────────────────────
      const scoreVsPar = parseInt(total_score) - parseInt(total_par);
      const completedAt = new Date().toISOString();
      const eventData = {
        courseId: round.course_id,
        holesLogged: parseInt(holes_logged),
        scoreVsPar,
        birdies: parseInt(birdies),
        aces: parseInt(aces),
        eagles: parseInt(eagles),
        bogeys: parseInt(bogeys),
        doublesPlus: parseInt(doubles_plus),
        completedAt,
        playerId: req.player.id,
      };

      // Fire quest checks for all applicable round events
      checkQuestCompletion(pool, req.player.id, 'ROUND_UNDER_PAR', eventData).catch(e => console.error('Story quest ROUND_UNDER_PAR error:', e.message));
      checkQuestCompletion(pool, req.player.id, 'ROUND_AT_PAR', eventData).catch(e => console.error('Story quest ROUND_AT_PAR error:', e.message));
      checkQuestCompletion(pool, req.player.id, 'ROUND_18_HOLES', eventData).catch(e => console.error('Story quest ROUND_18_HOLES error:', e.message));
      checkQuestCompletion(pool, req.player.id, 'HOLES_LOGGED', eventData).catch(e => console.error('Story quest HOLES_LOGGED error:', e.message));
      checkQuestCompletion(pool, req.player.id, 'ROUND_BIRDIE_COUNT', eventData).catch(e => console.error('Story quest ROUND_BIRDIE_COUNT error:', e.message));
      checkQuestCompletion(pool, req.player.id, 'ROUND_WEEKEND', eventData).catch(e => console.error('Story quest ROUND_WEEKEND error:', e.message));
      checkQuestCompletion(pool, req.player.id, 'ROUND_TIME_MORNING', eventData).catch(e => console.error('Story quest ROUND_TIME_MORNING error:', e.message));
      checkQuestCompletion(pool, req.player.id, 'ROUND_TIME_EARLY', eventData).catch(e => console.error('Story quest ROUND_TIME_EARLY error:', e.message));
      checkQuestCompletion(pool, req.player.id, 'ROUND_TIME_LATE', eventData).catch(e => console.error('Story quest ROUND_TIME_LATE error:', e.message));
      checkQuestCompletion(pool, req.player.id, 'ROUND_ACE', eventData).catch(e => console.error('Story quest ROUND_ACE error:', e.message));
      checkQuestCompletion(pool, req.player.id, 'ROUND_EAGLE', eventData).catch(e => console.error('Story quest ROUND_EAGLE error:', e.message));
      checkQuestCompletion(pool, req.player.id, 'ROUND_CLEAN', eventData).catch(e => console.error('Story quest ROUND_CLEAN error:', e.message));
      // ROUND_COMPLETE quests are handled by DB trigger (trg_round_complete_quest)
      // COURSE_REPEAT quests are handled in checkQuestCompletion when courseId is set

      // ── AWARD CO-PLAYERS: create completed rounds + grant XP/gold ──
      // Runs after commit so host round is already finalized.
      // Each co-player gets their own completed round row and XP/gold.
      completeCoPlayerRounds(pool, roundId, round).catch(err => {
        console.error('Co-player round completion error (non-fatal):', err.message);
      });

      // Distance analytics + achievements (async, returns data for finish screen)
      let distanceAnalytics = null;
      let newDistanceAchievements = [];
      try {
        const distResult = await processRoundDistanceAnalytics(pool, roundId, req.player.id, round.course_id);
        distanceAnalytics = distResult.analytics;
        newDistanceAchievements = distResult.newAchievements;
      } catch (_e) { /* non-fatal */ }

      res.json({
        round_id: roundId,
        holes_logged: parseInt(holes_logged),
        total_score: parseInt(total_score),
        total_par: parseInt(total_par),
        score_vs_par: parseInt(total_score) - parseInt(total_par),
        total_rounds: totalRounds,
        xp_granted: xpResult.amount,
        xp_base: xpResult.baseAmount,
        xp_boost_percent: xpResult.boostPercent,
        xp_boost_label: xpResult.boostLabel,
        milestone_xp: milestoneXp,
        new_xp: xpResult.newXp,
        new_level: xpResult.newLevel,
        // Gold
        gold_earned: goldResult?.finalAmount ?? 0,
        gold_base: goldResult?.baseAmount ?? 0,
        gold_boost_percent: goldResult?.boostPercent ?? 0,
        new_gold_balance: goldResult?.newBalance ?? null,
        // Item drop
        item_drop: itemDrop,
        // Hole breakdown for finish screen
        breakdown: {
          aces: parseInt(aces) || 0,
          eagles: parseInt(eagles) || 0,
          birdies: parseInt(birdies) || 0,
          pars: parseInt(pars) || 0,
          bogeys: parseInt(bogeys) || 0,
          doubles_plus: parseInt(doubles_plus) || 0,
        },
        best_hole: bestHole ? { hole_number: bestHole.hole_number, par: parseInt(bestHole.par), score: parseInt(bestHole.score), vs_par: parseInt(bestHole.score) - parseInt(bestHole.par) } : null,
        worst_hole: worstHole ? { hole_number: worstHole.hole_number, par: parseInt(worstHole.par), score: parseInt(worstHole.score), vs_par: parseInt(worstHole.score) - parseInt(worstHole.par) } : null,
        // Distance analytics
        distance_analytics: distanceAnalytics,
        new_distance_achievements: newDistanceAchievements,
        // Round duration (start → submit)
        round_duration_seconds: round.started_at
          ? Math.round((Date.now() - new Date(round.started_at).getTime()) / 1000)
          : null,
        // Personal records + highlights for finish screen
        personal_records: personalRecords,
        course_name: round.course_name || null,
        course_city: round.course_city || null,
        course_state: round.course_state || null,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Complete round error:', err.message);
      res.status(500).json({ error: 'Failed to complete round' });
    } finally {
      client.release();
    }
  });

  // POST /api/rounds/abandon — abandon the current in-progress round
  router.post('/rounds/abandon', requireAuth(pool), async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE rounds SET status = 'abandoned' WHERE player_id = $1 AND status = 'in_progress' RETURNING id`,
        [req.player.id]
      );
      res.json({ abandoned: result.rowCount, round_ids: result.rows.map(r => r.id) });
    } catch (err) {
      console.error('Abandon round error:', err.message);
      res.status(500).json({ error: 'Failed to abandon round' });
    }
  });

  // GET /api/rounds/history — completed rounds with optional filters
  // Query params: course_id, from (ISO date), to (ISO date), limit (default 50)
  router.get('/rounds/history', requireAuth(pool), async (req, res) => {
    try {
      const { course_id, from, to, limit = 50 } = req.query;
      const params = [req.player.id];
      let filters = `r.player_id = $1 AND r.status = 'completed'`;
      if (course_id) { params.push(parseInt(course_id)); filters += ` AND r.course_id = $${params.length}`; }
      if (from)      { params.push(from);                  filters += ` AND r.completed_at >= $${params.length}`; }
      if (to)        { params.push(to);                    filters += ` AND r.completed_at <= $${params.length}`; }
      params.push(Math.min(parseInt(limit) || 50, 200));
      const result = await pool.query(
        `SELECT r.id, r.course_id, r.holes_count, r.total_score, r.total_par,
                r.started_at, r.completed_at,
                r.total_score - r.total_par as score_vs_par,
                co.name as course_name, co.city, co.state, co.lat as course_lat, co.lng as course_lng
         FROM rounds r
         LEFT JOIN courses co ON co.id = r.course_id
         WHERE ${filters}
         ORDER BY r.completed_at DESC
         LIMIT $${params.length}`,
        params
      );
      res.json({ rounds: result.rows });
    } catch (err) {
      console.error('Round history error:', err.message);
      res.status(500).json({ error: 'Failed to get round history' });
    }
  });

  // GET /api/rounds/stats — aggregate round stats for the authenticated player
  router.get('/rounds/stats', requireAuth(pool), async (req, res) => {
    try {
      const agg = await pool.query(
        `SELECT
           COUNT(*)::int                                                   AS total_rounds,
           ROUND(AVG(total_score - total_par), 1)::float                  AS avg_score_vs_par,
           MIN(total_score - total_par)::int                              AS best_score_vs_par,
           SUM(total_score)::int                                          AS total_strokes,
           COUNT(DISTINCT course_id)::int                                 AS courses_played
         FROM rounds
         WHERE player_id = $1 AND status = 'completed'`,
        [req.player.id]
      );
      // Total birdies and aces from round_holes across all completed rounds
      const breakdown = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE rh.score = 1 AND rh.par >= 2)::int            AS total_aces,
           COUNT(*) FILTER (WHERE rh.score = rh.par - 1)::int                   AS total_birdies,
           COUNT(*) FILTER (WHERE rh.score <= rh.par - 2 AND rh.score > 1)::int AS total_eagles,
           COUNT(*) FILTER (WHERE rh.score = rh.par)::int                       AS total_pars,
           COUNT(*) FILTER (WHERE rh.score = rh.par + 1)::int                   AS total_bogeys
         FROM round_holes rh
         JOIN rounds r ON r.id = rh.round_id
         WHERE r.player_id = $1 AND r.status = 'completed'`,
        [req.player.id]
      );
      res.json({ ...agg.rows[0], ...breakdown.rows[0] });
    } catch (err) {
      console.error('Round stats error:', err.message);
      res.status(500).json({ error: 'Failed to get round stats' });
    }
  });

  // GET /api/rounds/course-compare/:course_id — your average at a course vs a given round
  // Query params: round_id (the round to compare against)
  router.get('/rounds/course-compare/:course_id', requireAuth(pool), async (req, res) => {
    const courseId = parseInt(req.params.course_id);
    const { round_id } = req.query;
    try {
      // Average score_vs_par across all completed rounds at this course (excluding current if provided)
      const params = [req.player.id, courseId];
      let excludeClause = '';
      if (round_id) { params.push(parseInt(round_id)); excludeClause = ` AND id != $${params.length}`; }
      const avgResult = await pool.query(
        `SELECT
           COUNT(*)::int                                                AS prev_rounds,
           ROUND(AVG(total_score - total_par), 1)::float               AS avg_score_vs_par,
           MIN(total_score - total_par)::int                           AS best_score_vs_par
         FROM rounds
         WHERE player_id = $1 AND course_id = $2 AND status = 'completed'${excludeClause}`,
        params
      );
      res.json(avgResult.rows[0]);
    } catch (err) {
      console.error('Course compare error:', err.message);
      res.status(500).json({ error: 'Failed to get course comparison' });
    }
  });

  // POST /api/rounds/:id/track — record a GPS point during an active round
  router.post('/rounds/:id/track', requireAuth(pool), async (req, res) => {
    const roundId = parseInt(req.params.id);
    const { lat, lng, recorded_at } = req.body;
    if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
    try {
      // Verify round belongs to player and is in_progress
      const roundCheck = await pool.query(
        `SELECT id FROM rounds WHERE id = $1 AND player_id = $2 AND status = 'in_progress'`,
        [roundId, req.player.id]
      );
      if (roundCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Active round not found' });
      }
      const ts = recorded_at ? new Date(recorded_at) : new Date();
      await pool.query(
        `INSERT INTO round_tracking (round_id, lat, lng, recorded_at) VALUES ($1, $2, $3, $4)`,
        [roundId, lat, lng, ts]
      );
      res.json({ ok: true });
    } catch (err) {
      console.error('Track round GPS error:', err.message);
      res.status(500).json({ error: 'Failed to record GPS point' });
    }
  });

  // POST /api/rounds/:id/track-batch — removed (battery optimization reverted)

  // GET /api/rounds/:id/path — get GPS path, hole scores, and analytics for a completed round
  // Returns: round info, GPS path points, hole-by-hole scores, per-hole distance/time estimates,
  // course comparison (player avg at this course), and personal best status.
  router.get('/rounds/:id/path', requireAuth(pool), async (req, res) => {
    const roundId = parseInt(req.params.id);
    try {
      // Verify round belongs to player
      const roundResult = await pool.query(
        `SELECT r.id, r.status, r.total_score, r.total_par, r.holes_count,
                r.started_at, r.completed_at, r.course_id,
                co.name as course_name, co.city, co.state,
                co.lat as course_lat, co.lng as course_lng
         FROM rounds r LEFT JOIN courses co ON co.id = r.course_id
         WHERE r.id = $1 AND r.player_id = $2`,
        [roundId, req.player.id]
      );
      if (roundResult.rows.length === 0) {
        return res.status(404).json({ error: 'Round not found' });
      }
      const round = roundResult.rows[0];

      // Fetch GPS path and hole scores in parallel
      const [pathResult, holesResult, avgResult, bestResult] = await Promise.all([
        pool.query(
          `SELECT lat, lng, recorded_at FROM round_tracking
           WHERE round_id = $1 ORDER BY recorded_at ASC`,
          [roundId]
        ),
        pool.query(
          `SELECT hole_number, par, score FROM round_holes
           WHERE round_id = $1 ORDER BY hole_number ASC`,
          [roundId]
        ),
        // Player average at this course (excluding this round) for comparison
        round.course_id ? pool.query(
          `SELECT COUNT(*)::int as prev_rounds,
                  ROUND(AVG(total_score - total_par), 1)::float as avg_score_vs_par
           FROM rounds
           WHERE player_id = $1 AND course_id = $2 AND status = 'completed' AND id != $3`,
          [req.player.id, round.course_id, roundId]
        ) : Promise.resolve({ rows: [{ prev_rounds: 0, avg_score_vs_par: null }] }),
        // Personal best at this course
        round.course_id ? pool.query(
          `SELECT best_score_vs_par FROM player_course_bests
           WHERE player_id = $1 AND course_id = $2`,
          [req.player.id, round.course_id]
        ) : Promise.resolve({ rows: [] }),
      ]);

      const path = pathResult.rows;
      const holes = holesResult.rows;
      const courseAvg = avgResult.rows[0];
      const courseBest = bestResult.rows[0] || null;

      // Compute per-hole distance and time estimates using GPS timestamps.
      // Strategy: divide the GPS path proportionally across holes using recorded_at timestamps.
      // Each hole gets the GPS points that fall in its time window.
      let holeStats = [];
      if (path.length >= 2 && holes.length > 0) {
        const startTime = new Date(path[0].recorded_at).getTime();
        const endTime = new Date(path[path.length - 1].recorded_at).getTime();
        const totalMs = endTime - startTime;
        const msPerHole = totalMs / holes.length;

        // Haversine helper (meters)
        const haversine = (lat1, lng1, lat2, lng2) => {
          const R = 6371000;
          const dLat = (lat2 - lat1) * Math.PI / 180;
          const dLng = (lng2 - lng1) * Math.PI / 180;
          const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        };

        holeStats = holes.map((h, i) => {
          const holeStartMs = startTime + i * msPerHole;
          const holeEndMs = startTime + (i + 1) * msPerHole;

          // Collect path points that fall in this hole's time window
          const holePts = path.filter(p => {
            const t = new Date(p.recorded_at).getTime();
            return t >= holeStartMs && t < holeEndMs;
          });

          // Compute distance walked for this hole
          let distanceM = 0;
          for (let j = 1; j < holePts.length; j++) {
            distanceM += haversine(
              parseFloat(holePts[j-1].lat), parseFloat(holePts[j-1].lng),
              parseFloat(holePts[j].lat), parseFloat(holePts[j].lng)
            );
          }

          return {
            hole_number: h.hole_number,
            par: h.par,
            score: h.score,
            vs_par: h.score - h.par,
            distance_m: Math.round(distanceM),
            duration_seconds: Math.round(msPerHole / 1000),
            // GPS points for this hole segment (for map drawing)
            path_segment: holePts.map(p => ({ lat: parseFloat(p.lat), lng: parseFloat(p.lng) })),
          };
        });
      } else {
        // No GPS or no holes — return basic hole data without distance
        holeStats = holes.map(h => ({
          hole_number: h.hole_number,
          par: h.par,
          score: h.score,
          vs_par: h.score - h.par,
          distance_m: null,
          duration_seconds: null,
          path_segment: [],
        }));
      }

      const scoreVsPar = round.total_score != null && round.total_par != null
        ? parseInt(round.total_score) - parseInt(round.total_par)
        : null;

      // Personal best comparison text
      let bestComparison = null;
      if (courseBest && courseAvg.prev_rounds > 0 && scoreVsPar != null) {
        const isBest = scoreVsPar <= courseBest.best_score_vs_par;
        if (isBest) {
          bestComparison = { type: 'best', message: '🏆 New best round at this course!' };
        } else if (courseAvg.avg_score_vs_par != null) {
          const diff = scoreVsPar - courseAvg.avg_score_vs_par;
          if (diff < -1) bestComparison = { type: 'above_avg', message: `⬆️ ${Math.abs(diff.toFixed(1))} better than your average here` };
          else if (diff > 1) bestComparison = { type: 'below_avg', message: `📈 ${diff.toFixed(1)} over your average here` };
          else bestComparison = { type: 'on_avg', message: `✅ Right on your average for this course` };
        }
      }

      res.json({
        round: {
          ...round,
          score_vs_par: scoreVsPar,
        },
        path,
        holes: holeStats,
        course_comparison: {
          prev_rounds: courseAvg.prev_rounds,
          avg_score_vs_par: courseAvg.avg_score_vs_par,
          best_score_vs_par: courseBest ? courseBest.best_score_vs_par : null,
        },
        best_comparison: bestComparison,
      });
    } catch (err) {
      console.error('Get round path error:', err.message);
      res.status(500).json({ error: 'Failed to get path data' });
    }
  });

  // GET /api/rounds/:id/summary — shareable round summary card data
  // Returns player info, course, score, hole breakdown, birdie streak, personal best flag.
  router.get('/rounds/:id/summary', requireAuth(pool), async (req, res) => {
    const roundId = parseInt(req.params.id);
    try {
      const roundResult = await pool.query(
        `SELECT r.id, r.total_score, r.total_par, r.holes_count, r.completed_at,
                co.name as course_name, co.city, co.state,
                p.display_name, p.avatar_url,
                cl.name as layout_name
         FROM rounds r
         LEFT JOIN courses co ON co.id = r.course_id
         LEFT JOIN players p ON p.id = r.player_id
         LEFT JOIN course_layouts cl ON cl.id = r.layout_id
         WHERE r.id = $1 AND r.player_id = $2 AND r.status = 'completed'`,
        [roundId, req.player.id]
      );
      if (roundResult.rows.length === 0) {
        return res.status(404).json({ error: 'Round not found' });
      }
      const round = roundResult.rows[0];

      const [holesResult, bestResult] = await Promise.all([
        pool.query(
          `SELECT hole_number, par, score FROM round_holes
           WHERE round_id = $1 ORDER BY hole_number ASC`,
          [roundId]
        ),
        round.course_id ? pool.query(
          `SELECT best_score_vs_par, best_round_id FROM player_course_bests
           WHERE player_id = $1 AND course_id = (
             SELECT course_id FROM rounds WHERE id = $2
           )`,
          [req.player.id, roundId]
        ) : Promise.resolve({ rows: [] }),
      ]);

      const holes = holesResult.rows;
      const courseBest = bestResult.rows[0] || null;

      // Hole breakdown
      let aces = 0, eagles = 0, birdies = 0, pars = 0, bogeys = 0;
      for (const h of holes) {
        const d = parseInt(h.score) - parseInt(h.par);
        if (parseInt(h.score) === 1 && parseInt(h.par) >= 2) aces++;
        else if (d <= -2) eagles++;
        else if (d === -1) birdies++;
        else if (d === 0) pars++;
        else if (d === 1) bogeys++;
      }

      // Longest birdie streak
      let maxStreak = 0; let streak = 0;
      for (const h of holes) {
        if (parseInt(h.score) <= parseInt(h.par) - 1) { streak++; maxStreak = Math.max(maxStreak, streak); }
        else { streak = 0; }
      }

      const scoreVsPar = round.total_score != null && round.total_par != null
        ? parseInt(round.total_score) - parseInt(round.total_par)
        : null;

      // Determine if this round IS the current personal best at this course
      const isPersonalBest = courseBest && courseBest.best_round_id === roundId;

      res.json({
        round_id: roundId,
        player_name: round.display_name || 'Disc Golfer',
        avatar_url: round.avatar_url || null,
        course_name: round.course_name || null,
        course_city: round.city || null,
        course_state: round.state || null,
        layout_name: round.layout_name || null,
        total_score: parseInt(round.total_score) || 0,
        total_par: parseInt(round.total_par) || 0,
        score_vs_par: scoreVsPar,
        holes_played: parseInt(round.holes_count) || holes.length,
        date_played: round.completed_at,
        breakdown: { aces, eagles, birdies, pars, bogeys },
        longest_birdie_streak: maxStreak,
        is_personal_best: isPersonalBest,
        course_best_score_vs_par: courseBest ? courseBest.best_score_vs_par : null,
        holes: holes.map(h => ({ hole: parseInt(h.hole_number), par: parseInt(h.par), score: parseInt(h.score) })),
      });
    } catch (err) {
      console.error('Round summary error:', err.message);
      res.status(500).json({ error: 'Failed to get round summary' });
    }
  });

  // GET /api/rounds/:id — get a specific round with holes
  router.get('/rounds/:id', requireAuth(pool), async (req, res) => {
    const roundId = parseInt(req.params.id);
    try {
      const roundResult = await pool.query(
        `SELECT r.*, co.name as course_name, co.city, co.state
         FROM rounds r LEFT JOIN courses co ON co.id = r.course_id
         WHERE r.id = $1 AND r.player_id = $2`,
        [roundId, req.player.id]
      );
      if (roundResult.rows.length === 0) {
        return res.status(404).json({ error: 'Round not found' });
      }
      const holesResult = await pool.query(
        `SELECT id, round_id, hole_number, par, score FROM round_holes WHERE round_id = $1 ORDER BY hole_number ASC`,
        [roundId]
      );
      res.json({ round: roundResult.rows[0], holes: holesResult.rows });
    } catch (err) {
      console.error('Get round error:', err.message);
      res.status(500).json({ error: 'Failed to get round' });
    }
  });

  return router;
};
