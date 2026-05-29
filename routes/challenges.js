const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { grantXp, grantGold, XP_EVENTS, evaluateBadges } = require('./xp-engine');
const { getActiveBoosts, awardGold, GOLD_EVENTS, addToInventory } = require('./vault');

// ── Challenge Item Reward Logic ────────────────────────────────────────────────

/**
 * Roll a guaranteed item reward for a challenge claim based on cadence.
 * Daily → Common, Weekly → Uncommon, Monthly → Rare (10% chance Epic)
 * Returns a vault_items row or null.
 */
async function rollChallengeItemReward(pool, cadence) {
  let rarity;
  if (cadence === 'daily') {
    rarity = 'common';
  } else if (cadence === 'weekly') {
    rarity = 'uncommon';
  } else if (cadence === 'monthly') {
    // 10% chance of epic, 90% rare
    rarity = Math.random() < 0.10 ? 'epic' : 'rare';
  } else {
    return null; // permanent challenges — no item reward
  }

  const result = await pool.query(
    `SELECT * FROM vault_items WHERE rarity = $1 ORDER BY RANDOM() LIMIT 1`,
    [rarity]
  );
  return result.rows[0] || null;
}

module.exports = ({ pool }) => {
  const router = express.Router();

  // ── GET /api/challenges/board — rotating daily/weekly/monthly + permanent ───
  router.get('/challenges/board', requireAuth(pool), async (req, res) => {
    try {
      // Ensure active slots exist for all cadences
      await ensureActiveSlots(pool);

      const now = new Date();

      // Fetch active slots for each cadence with challenge info + player progress
      const slotsResult = await pool.query(
        `SELECT
           acs.id as slot_id, acs.cadence, acs.period_start, acs.period_end,
           ch.id as challenge_id, ch.slug, ch.title, ch.description,
           ch.difficulty, ch.challenge_type, ch.target_value, ch.xp_reward,
           pcs.progress, pcs.completed, pcs.completed_at, pcs.claimed, pcs.claimed_at
         FROM active_challenge_slots acs
         JOIN challenges ch ON ch.id = acs.challenge_id
         LEFT JOIN player_challenge_slots pcs
           ON pcs.slot_id = acs.id AND pcs.player_id = $1
         WHERE acs.period_start <= $2 AND acs.period_end > $2
         ORDER BY acs.cadence, ch.difficulty ASC`,
        [req.player.id, now]
      );

      // Fetch permanent challenges with player progress (include course name for course-specific)
      const permResult = await pool.query(
        `SELECT ch.id, ch.slug, ch.title, ch.description, ch.difficulty,
                ch.challenge_type, ch.target_value, ch.xp_reward,
                ch.course_id, co.name AS course_name, co.city AS course_city,
                pc.progress, pc.completed, pc.completed_at, pc.claimed, pc.claimed_at
         FROM challenges ch
         LEFT JOIN courses co ON co.id = ch.course_id
         LEFT JOIN player_challenges pc ON pc.challenge_id = ch.id AND pc.player_id = $1
         WHERE ch.cadence = 'permanent' AND (ch.active_until IS NULL OR ch.active_until >= $2)
         ORDER BY ch.difficulty ASC, ch.slug ASC`,
        [req.player.id, now.toISOString().split('T')[0]]
      );

      // Compute progress for rotating slots that haven't been synced recently
      const slotRows = slotsResult.rows;
      for (const slot of slotRows) {
        const progress = await computeRotatingProgress(pool, req.player.id, slot);
        slot.progress = progress;
        // Upsert progress record
        await pool.query(
          `INSERT INTO player_challenge_slots (player_id, slot_id, progress, completed, completed_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (player_id, slot_id) DO UPDATE
             SET progress = EXCLUDED.progress,
                 completed = CASE WHEN EXCLUDED.completed THEN TRUE ELSE player_challenge_slots.completed END,
                 completed_at = CASE WHEN EXCLUDED.completed AND player_challenge_slots.completed_at IS NULL THEN NOW() ELSE player_challenge_slots.completed_at END`,
          [
            req.player.id,
            slot.slot_id,
            progress,
            progress >= slot.target_value,
            progress >= slot.target_value ? new Date() : null,
          ]
        );
        slot.completed = progress >= slot.target_value;
      }

      // Group by cadence
      const byGroup = { daily: [], weekly: [], monthly: [] };
      for (const slot of slotRows) {
        byGroup[slot.cadence]?.push(slot);
      }

      res.json({
        daily: byGroup.daily,
        weekly: byGroup.weekly,
        monthly: byGroup.monthly,
        permanent: permResult.rows,
      });
    } catch (err) {
      console.error('Challenge board error:', err.message);
      res.status(500).json({ error: 'Failed to get challenge board' });
    }
  });

  // ── POST /api/challenges/slots/:slotId/claim — claim XP for completed rotating challenge ──
  router.post('/challenges/slots/:slotId/claim', requireAuth(pool), async (req, res) => {
    const slotId = parseInt(req.params.slotId);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get slot + challenge info
      const slotResult = await client.query(
        `SELECT acs.*, ch.difficulty, ch.slug, ch.xp_reward, ch.challenge_type, ch.target_value
         FROM active_challenge_slots acs
         JOIN challenges ch ON ch.id = acs.challenge_id
         WHERE acs.id = $1`,
        [slotId]
      );
      if (slotResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Slot not found' });
      }
      const slot = slotResult.rows[0];

      // Get player progress
      const progressResult = await client.query(
        `SELECT * FROM player_challenge_slots WHERE player_id = $1 AND slot_id = $2`,
        [req.player.id, slotId]
      );
      if (progressResult.rows.length === 0 || !progressResult.rows[0].completed) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Challenge not completed yet' });
      }
      if (progressResult.rows[0].claimed) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Already claimed' });
      }

      // Determine XP event
      const diffToEvent = {
        easy: 'challenge_easy',
        medium: 'challenge_medium',
        hard: 'challenge_hard',
        legendary: 'challenge_legendary',
      };
      const event = diffToEvent[slot.difficulty] || 'challenge_medium';

      // Fetch active boosts for XP + gold boost application
      let activeBoosts = [];
      try { activeBoosts = await getActiveBoosts(client, req.player.id); } catch (_e) {}

      const xpResult = await grantXp(client, req.player.id, event, {
        slot_id: slotId,
        cadence: slot.cadence,
        challenge_slug: slot.slug,
      }, activeBoosts);

      // Award gold for challenge completion (cadence-based: daily=15, weekly=40, monthly=100)
      let goldResult = null;
      const cadenceGoldEvent = slot.cadence === 'daily' ? 'challenge_daily'
        : slot.cadence === 'weekly' ? 'challenge_weekly'
        : slot.cadence === 'monthly' ? 'challenge_monthly'
        : null;
      if (cadenceGoldEvent) {
        try {
          const gr = await grantGold(client, req.player.id, cadenceGoldEvent, { slot_id: slotId });
          goldResult = { finalAmount: gr.amount, newBalance: gr.newGold };
        } catch (_e) {}
      }

      // Roll item reward for rotating challenges (daily/weekly/monthly)
      let itemReward = null;
      try {
        const rolledItem = await rollChallengeItemReward(pool, slot.cadence);
        if (rolledItem) {
          await addToInventory(client, req.player.id, rolledItem.id, 'challenge');
          itemReward = {
            name: rolledItem.name,
            icon: rolledItem.icon,
            rarity: rolledItem.rarity,
            description: rolledItem.description,
          };
        }
      } catch (_e) { /* non-fatal — item reward failure doesn't block claim */ }

      // Mark claimed
      await client.query(
        `UPDATE player_challenge_slots SET claimed = TRUE, claimed_at = NOW()
         WHERE player_id = $1 AND slot_id = $2`,
        [req.player.id, slotId]
      );

      // Evaluate challenger badges
      const totalResult = await client.query(
        `SELECT
           (SELECT COUNT(*) FROM player_challenges WHERE player_id = $1 AND completed = TRUE) +
           (SELECT COUNT(*) FROM player_challenge_slots WHERE player_id = $1 AND completed = TRUE) AS total_completed`,
        [req.player.id]
      );
      const existingBadges = await client.query(
        'SELECT category, tier FROM player_badges WHERE player_id = $1',
        [req.player.id]
      );
      const existingSet = new Set(existingBadges.rows.map(r => `${r.category}:${r.tier}`));
      const newBadges = evaluateBadges(
        { uniqueCourses: 0, totalCheckins: 0, totalRounds: 0,
          challengesCompleted: parseInt(totalResult.rows[0].total_completed),
          battleWins: 0, bestStreak: 0, uniqueOpponents: 0,
          uniqueStates: 0, maxSameCourseVisits: 0, weekendRounds: 0,
          nightCheckins: 0, morningCheckins: 0, weatherCheckins: 0,
          trailblazerCourses: 0, seasonsPlayed: 0, completedCities: 0 },
        existingSet
      );
      for (const badge of newBadges) {
        await client.query(
          'INSERT INTO player_badges (player_id, category, tier) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [req.player.id, badge.category, badge.tier]
        );
      }

      await client.query('COMMIT');

      // Get updated gold balance
      const goldBalResult = await client.query('SELECT gold FROM players WHERE id = $1', [req.player.id]);

      res.json({
        claimed: true,
        xp_granted: xpResult.amount,
        xp_base: xpResult.baseAmount,
        xp_boost_percent: xpResult.boostPercent,
        new_xp: xpResult.newXp,
        new_level: xpResult.newLevel,
        gold_earned: goldResult?.finalAmount ?? 0,
        new_gold_balance: goldResult?.newBalance ?? null,
        new_badges: newBadges.map(b => ({ category: b.category, tier: b.tier })),
        item_reward: itemReward,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Claim challenge error:', err.message);
      res.status(500).json({ error: 'Failed to claim challenge' });
    } finally {
      client.release();
    }
  });

  // ── GET /api/challenges — original endpoint (permanent challenges) ────────
  router.get('/challenges', requireAuth(pool), async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const result = await pool.query(
        `SELECT ch.id, ch.slug, ch.title, ch.description, ch.difficulty,
                ch.challenge_type, ch.target_value, ch.xp_reward,
                ch.is_rotating, ch.active_from, ch.active_until,
                ch.course_id, co.name AS course_name, co.city AS course_city,
                pc.progress, pc.completed, pc.completed_at
         FROM challenges ch
         LEFT JOIN courses co ON co.id = ch.course_id
         LEFT JOIN player_challenges pc
           ON pc.challenge_id = ch.id AND pc.player_id = $1
         WHERE (ch.active_until IS NULL OR ch.active_until >= $2) AND ch.cadence = 'permanent'
         ORDER BY ch.difficulty ASC, ch.slug ASC`,
        [req.player.id, today]
      );
      res.json({ challenges: result.rows });
    } catch (err) {
      console.error('Get challenges error:', err.message);
      res.status(500).json({ error: 'Failed to get challenges' });
    }
  });

  // ── POST /api/challenges/:id/progress — sync permanent challenge progress ──
  router.post('/challenges/:id/progress', requireAuth(pool), async (req, res) => {
    const challengeId = parseInt(req.params.id);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const challengeResult = await client.query(
        'SELECT * FROM challenges WHERE id = $1',
        [challengeId]
      );
      if (challengeResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Challenge not found' });
      }
      const challenge = challengeResult.rows[0];

      const progress = await computePermanentProgress(client, req.player.id, challenge);

      const existing = await client.query(
        'SELECT id, progress, completed FROM player_challenges WHERE player_id = $1 AND challenge_id = $2',
        [req.player.id, challengeId]
      );

      const wasCompleted = existing.rows[0]?.completed;
      const nowCompleted = progress >= challenge.target_value;

      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO player_challenges (player_id, challenge_id, progress, completed, completed_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.player.id, challengeId, progress, nowCompleted, nowCompleted ? new Date() : null]
        );
      } else {
        await client.query(
          `UPDATE player_challenges SET progress = $3, completed = $4,
             completed_at = CASE WHEN $4 AND completed_at IS NULL THEN NOW() ELSE completed_at END
           WHERE player_id = $1 AND challenge_id = $2`,
          [req.player.id, challengeId, progress, nowCompleted]
        );
      }

      let xpGranted = null;
      let goldGranted = null;
      if (nowCompleted && !wasCompleted) {
        const eventKey = `challenge_${challenge.difficulty}`;
        const validEvents = ['challenge_easy', 'challenge_medium', 'challenge_hard', 'challenge_legendary'];
        const event = validEvents.includes(eventKey) ? eventKey : 'challenge_medium';

        let permBoosts = [];
        try { permBoosts = await getActiveBoosts(client, req.player.id); } catch (_e) {}

        const r = await grantXp(client, req.player.id, event, {
          challenge_id: challengeId,
          challenge_slug: challenge.slug,
        }, permBoosts);
        xpGranted = r.amount;

        // Award gold for permanent challenge completion
        try {
          const gr = await awardGold(client, req.player.id, eventKey,
            GOLD_EVENTS[eventKey] || 25, permBoosts,
            { challenge_id: challengeId }
          );
          goldGranted = gr.finalAmount;
        } catch (_e) {}

        // Mark as claimed since rewards were auto-granted
        await client.query(
          `UPDATE player_challenges SET claimed = TRUE, claimed_at = NOW()
           WHERE player_id = $1 AND challenge_id = $2`,
          [req.player.id, challengeId]
        );

        const challengesResult = await client.query(
          'SELECT COUNT(*) as cnt FROM player_challenges WHERE player_id = $1 AND completed = TRUE',
          [req.player.id]
        );
        const badgeStats = {
          uniqueCourses: 0, totalCheckins: 0, totalRounds: 0,
          challengesCompleted: parseInt(challengesResult.rows[0].cnt),
          battleWins: 0, bestStreak: 0, uniqueOpponents: 0,
          uniqueStates: 0, maxSameCourseVisits: 0, weekendRounds: 0,
          nightCheckins: 0, morningCheckins: 0, weatherCheckins: 0,
          trailblazerCourses: 0, seasonsPlayed: 0, completedCities: 0,
        };
        const existing2 = await client.query('SELECT category, tier FROM player_badges WHERE player_id = $1', [req.player.id]);
        const existingSet = new Set(existing2.rows.map(r2 => `${r2.category}:${r2.tier}`));
        const newBadges = evaluateBadges(badgeStats, existingSet);
        for (const badge of newBadges) {
          await client.query(
            'INSERT INTO player_badges (player_id, category, tier) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [req.player.id, badge.category, badge.tier]
          );
        }
      }

      await client.query('COMMIT');
      res.json({
        challenge_id: challengeId,
        progress,
        target: challenge.target_value,
        completed: nowCompleted,
        newly_completed: nowCompleted && !wasCompleted,
        xp_granted: xpGranted,
        gold_earned: goldGranted ?? 0,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Challenge progress error:', err.message);
      res.status(500).json({ error: 'Failed to update challenge progress' });
    } finally {
      client.release();
    }
  });

  // ── GET /api/challenges/leaderboard ───────────────────────────────────────
  router.get('/challenges/leaderboard', async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT p.id, p.display_name, p.level, p.xp,
                (
                  COALESCE((SELECT COUNT(*) FROM player_challenges pc WHERE pc.player_id = p.id AND pc.completed = TRUE), 0)
                  + COALESCE((SELECT COUNT(*) FROM player_challenge_slots pcs WHERE pcs.player_id = p.id AND pcs.completed = TRUE), 0)
                ) AS challenges_completed
         FROM players p
         ORDER BY challenges_completed DESC, p.xp DESC
         LIMIT 50`
      );
      res.json({ leaderboard: result.rows });
    } catch (err) {
      console.error('Challenges leaderboard error:', err.message);
      res.status(500).json({ error: 'Failed to get leaderboard' });
    }
  });

  return router;
};

// ── Period helpers ────────────────────────────────────────────────────────────

function getPeriodBounds(cadence) {
  const now = new Date();

  if (cadence === 'daily') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
  }

  if (cadence === 'weekly') {
    // ISO week: Monday = day 1
    const dow = now.getUTCDay(); // 0=Sun, 1=Mon...
    const daysSinceMonday = (dow + 6) % 7;
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday));
    const nextMonday = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000);
    return { start: monday, end: nextMonday };
  }

  if (cadence === 'monthly') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { start, end };
  }

  throw new Error(`Unknown cadence: ${cadence}`);
}

// ── Ensure active slots exist for current periods ─────────────────────────────

async function ensureActiveSlots(pool) {
  const cadences = [
    { name: 'daily',   count: 3 },
    { name: 'weekly',  count: 4 },
    { name: 'monthly', count: 3 },
  ];

  for (const { name, count } of cadences) {
    const { start, end } = getPeriodBounds(name);

    // Check if slots already exist for this period
    const existing = await pool.query(
      `SELECT COUNT(*) as cnt FROM active_challenge_slots
       WHERE cadence = $1 AND period_start = $2`,
      [name, start]
    );

    if (parseInt(existing.rows[0].cnt) >= count) continue;

    // Get pool for this cadence
    const poolResult = await pool.query(
      `SELECT id FROM challenges WHERE cadence = $1 AND is_pool_member = TRUE ORDER BY RANDOM() LIMIT $2`,
      [name, count]
    );

    if (poolResult.rows.length === 0) continue;

    for (const ch of poolResult.rows) {
      await pool.query(
        `INSERT INTO active_challenge_slots (challenge_id, cadence, period_start, period_end)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (challenge_id, period_start) DO NOTHING`,
        [ch.id, name, start, end]
      );
    }
  }
}

// ── Compute rotating challenge progress (within current period) ───────────────

async function computeRotatingProgress(pool, playerId, slot) {
  const { challenge_type, period_start, period_end } = slot;

  switch (challenge_type) {
    case 'daily_checkins':
    case 'weekly_unique_courses': {
      // Count distinct courses checked in during period
      const r = await pool.query(
        `SELECT COUNT(DISTINCT course_id) AS cnt FROM checkins
         WHERE player_id = $1 AND checked_in_at >= $2 AND checked_in_at < $3`,
        [playerId, period_start, period_end]
      );
      return challenge_type === 'daily_checkins'
        ? Math.min(parseInt(r.rows[0].cnt), slot.target_value)
        : parseInt(r.rows[0].cnt);
    }

    case 'daily_rounds':
    case 'weekly_rounds':
    case 'monthly_rounds': {
      const r = await pool.query(
        `SELECT COUNT(*) AS cnt FROM rounds
         WHERE player_id = $1 AND status = 'completed'
           AND completed_at >= $2 AND completed_at < $3`,
        [playerId, period_start, period_end]
      );
      return parseInt(r.rows[0].cnt);
    }

    case 'daily_holes':
    case 'weekly_holes':
    case 'monthly_holes': {
      const r = await pool.query(
        `SELECT COUNT(*) AS cnt FROM round_holes rh
         JOIN rounds ro ON ro.id = rh.round_id
         WHERE ro.player_id = $1 AND ro.started_at >= $2 AND ro.started_at < $3`,
        [playerId, period_start, period_end]
      );
      return parseInt(r.rows[0].cnt);
    }

    case 'daily_birdies':
    case 'weekly_birdies':
    case 'monthly_birdies': {
      // Birdie = score < par (by exactly 1 in disc golf context, but score = par-1 is a birdie)
      const r = await pool.query(
        `SELECT COUNT(*) AS cnt FROM round_holes rh
         JOIN rounds ro ON ro.id = rh.round_id
         WHERE ro.player_id = $1 AND ro.started_at >= $2 AND ro.started_at < $3
           AND rh.score = rh.par - 1`,
        [playerId, period_start, period_end]
      );
      return parseInt(r.rows[0].cnt);
    }

    case 'daily_pars':
    case 'weekly_pars':
    case 'monthly_pars': {
      const r = await pool.query(
        `SELECT COUNT(*) AS cnt FROM round_holes rh
         JOIN rounds ro ON ro.id = rh.round_id
         WHERE ro.player_id = $1 AND ro.started_at >= $2 AND ro.started_at < $3
           AND rh.score = rh.par`,
        [playerId, period_start, period_end]
      );
      return parseInt(r.rows[0].cnt);
    }

    case 'weekly_new_courses': {
      // Courses checked into during this period that were never checked into before
      const r = await pool.query(
        `SELECT COUNT(DISTINCT ci.course_id) AS cnt FROM checkins ci
         WHERE ci.player_id = $1 AND ci.checked_in_at >= $2 AND ci.checked_in_at < $3
           AND ci.course_id NOT IN (
             SELECT DISTINCT course_id FROM checkins
             WHERE player_id = $1 AND checked_in_at < $2
           )`,
        [playerId, period_start, period_end]
      );
      return parseInt(r.rows[0].cnt);
    }

    case 'monthly_unique_courses': {
      const r = await pool.query(
        `SELECT COUNT(DISTINCT course_id) AS cnt FROM checkins
         WHERE player_id = $1 AND checked_in_at >= $2 AND checked_in_at < $3`,
        [playerId, period_start, period_end]
      );
      return parseInt(r.rows[0].cnt);
    }

    // ── Score-based (new) ──────────────────────────────────────────────────
    case 'round_under_par': {
      // Count rounds completed under par during period
      const r = await pool.query(
        `SELECT COUNT(*) AS cnt FROM rounds
         WHERE player_id = $1 AND status = 'completed'
           AND completed_at >= $2 AND completed_at < $3
           AND total_score < total_par`,
        [playerId, period_start, period_end]
      );
      return parseInt(r.rows[0].cnt);
    }

    case 'round_birdies_single': {
      // Max birdies in a single round during this period
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
      return parseInt(r.rows[0].cnt);
    }

    case 'round_zero_bogeys': {
      // Count rounds with zero bogeys during period
      const r = await pool.query(
        `SELECT COUNT(*) AS cnt FROM (
           SELECT ro.id
           FROM rounds ro
           JOIN round_holes rh ON rh.round_id = ro.id
           WHERE ro.player_id = $1 AND ro.status = 'completed'
             AND ro.completed_at >= $2 AND ro.completed_at < $3
           GROUP BY ro.id
           HAVING COUNT(*) FILTER (WHERE rh.score > rh.par) = 0
           AND COUNT(*) > 0
         ) t`,
        [playerId, period_start, period_end]
      );
      return parseInt(r.rows[0].cnt);
    }

    case 'round_clutch_finish': {
      // Count rounds where last hole score <= par - 1 (birdie or better) during period
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
      return parseInt(r.rows[0].cnt);
    }

    case 'round_ace': {
      // Count rounds with at least one ace during period
      const r = await pool.query(
        `SELECT COUNT(DISTINCT ro.id) AS cnt
         FROM rounds ro
         JOIN round_holes rh ON rh.round_id = ro.id
         WHERE ro.player_id = $1 AND ro.status = 'completed'
           AND ro.completed_at >= $2 AND ro.completed_at < $3
           AND rh.score = 1 AND rh.par >= 2`,
        [playerId, period_start, period_end]
      );
      return parseInt(r.rows[0].cnt);
    }

    case 'round_clean_sheet': {
      // Count 18-hole rounds with no double bogeys or worse during period
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
      return parseInt(r.rows[0].cnt);
    }

    case 'round_beat_best': {
      // Count rounds during period that beat the player's prior best at that course
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
      return parseInt(r.rows[0].cnt);
    }

    case 'round_birdie_streak': {
      // Check if any round in period has 3+ consecutive birdies
      // Returns count of qualifying rounds
      const rounds = await pool.query(
        `SELECT ro.id FROM rounds ro
         WHERE ro.player_id = $1 AND ro.status = 'completed'
           AND ro.completed_at >= $2 AND ro.completed_at < $3
         ORDER BY ro.completed_at DESC`,
        [playerId, period_start, period_end]
      );
      let count = 0;
      for (const round of rounds.rows) {
        const holes = await pool.query(
          `SELECT score, par FROM round_holes WHERE round_id = $1 ORDER BY hole_number ASC`,
          [round.id]
        );
        let streak = 0;
        let maxStreak = 0;
        for (const h of holes.rows) {
          if (h.score <= h.par - 1) { streak++; maxStreak = Math.max(maxStreak, streak); }
          else { streak = 0; }
        }
        if (maxStreak >= (slot.target_value || 3)) count++;
      }
      return count;
    }

    case 'round_consistency': {
      // Count rounds within ±2 of player's average at that course during period
      const r = await pool.query(
        `SELECT COUNT(*) AS cnt FROM (
           SELECT ro.id
           FROM rounds ro
           JOIN (
             SELECT course_id,
                    AVG(total_score - total_par) AS avg_vpar
             FROM rounds
             WHERE player_id = $1 AND status = 'completed'
               AND completed_at < $2
             GROUP BY course_id
             HAVING COUNT(*) >= 2
           ) avg_data ON avg_data.course_id = ro.course_id
           WHERE ro.player_id = $1 AND ro.status = 'completed'
             AND ro.completed_at >= $2 AND ro.completed_at < $3
             AND ABS((ro.total_score - ro.total_par) - avg_data.avg_vpar) <= 2
         ) t`,
        [playerId, period_start, period_end]
      );
      return parseInt(r.rows[0].cnt);
    }

    // ── Streak-based (new) ─────────────────────────────────────────────────
    case 'streak_days_played': {
      // Count distinct days with at least one completed round during period
      const r = await pool.query(
        `SELECT COUNT(DISTINCT DATE(completed_at)) AS cnt FROM rounds
         WHERE player_id = $1 AND status = 'completed'
           AND completed_at >= $2 AND completed_at < $3`,
        [playerId, period_start, period_end]
      );
      return parseInt(r.rows[0].cnt);
    }

    case 'streak_weekend': {
      // Count distinct weekend days (Sat=6, Sun=0) with a completed round during period
      const r = await pool.query(
        `SELECT COUNT(DISTINCT EXTRACT(DOW FROM completed_at)) AS cnt FROM rounds
         WHERE player_id = $1 AND status = 'completed'
           AND completed_at >= $2 AND completed_at < $3
           AND EXTRACT(DOW FROM completed_at) IN (0, 6)`,
        [playerId, period_start, period_end]
      );
      return parseInt(r.rows[0].cnt);
    }

    // ── Location-based (new) ───────────────────────────────────────────────
    case 'location_states': {
      // Count distinct states of courses played during period
      const r = await pool.query(
        `SELECT COUNT(DISTINCT co.state) AS cnt
         FROM rounds ro
         JOIN courses co ON co.id = ro.course_id
         WHERE ro.player_id = $1 AND ro.status = 'completed'
           AND ro.completed_at >= $2 AND ro.completed_at < $3
           AND co.state IS NOT NULL`,
        [playerId, period_start, period_end]
      );
      return parseInt(r.rows[0].cnt);
    }

    case 'location_new_courses': {
      // Count distinct courses checked in during period not checked into before
      const r = await pool.query(
        `SELECT COUNT(DISTINCT ci.course_id) AS cnt FROM checkins ci
         WHERE ci.player_id = $1 AND ci.checked_in_at >= $2 AND ci.checked_in_at < $3
           AND ci.course_id NOT IN (
             SELECT DISTINCT course_id FROM checkins
             WHERE player_id = $1 AND checked_in_at < $2
           )`,
        [playerId, period_start, period_end]
      );
      return parseInt(r.rows[0].cnt);
    }

    case 'location_same_course': {
      // Max plays at any single course during period (rounds completed)
      const r = await pool.query(
        `SELECT COALESCE(MAX(cnt), 0) AS cnt FROM (
           SELECT course_id, COUNT(*) AS cnt
           FROM rounds
           WHERE player_id = $1 AND status = 'completed'
             AND completed_at >= $2 AND completed_at < $3
           GROUP BY course_id
         ) t`,
        [playerId, period_start, period_end]
      );
      return parseInt(r.rows[0].cnt);
    }

    // ── All-time permanent (new) ────────────────────────────────────────────
    case 'round_ace_alltime': {
      const r = await pool.query(
        `SELECT COUNT(DISTINCT ro.id) AS cnt
         FROM rounds ro
         JOIN round_holes rh ON rh.round_id = ro.id
         WHERE ro.player_id = $1 AND ro.status = 'completed'
           AND rh.score = 1 AND rh.par >= 2`,
        [playerId]
      );
      return parseInt(r.rows[0].cnt);
    }

    default:
      return 0;
  }
}

// ── Compute permanent challenge progress (all-time) ───────────────────────────

async function computePermanentProgress(client, playerId, challenge) {
  const { challenge_type, course_id } = challenge;
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  switch (challenge_type) {
    case 'course_checkin': {
      // How many times has the player checked into this specific course?
      if (!course_id) return 0;
      const r = await client.query(
        `SELECT COUNT(*) AS cnt FROM checkins WHERE player_id = $1 AND course_id = $2`,
        [playerId, course_id]
      );
      return parseInt(r.rows[0].cnt);
    }
    case 'course_rounds': {
      // How many completed rounds has the player played at this specific course?
      if (!course_id) return 0;
      const r = await client.query(
        `SELECT COUNT(*) AS cnt FROM rounds WHERE player_id = $1 AND course_id = $2 AND status = 'completed'`,
        [playerId, course_id]
      );
      return parseInt(r.rows[0].cnt);
    }
    case 'courses_in_day': {
      const r = await client.query(`
        SELECT COALESCE(MAX(cnt), 0) AS max_day
        FROM (SELECT COUNT(DISTINCT course_id) AS cnt FROM checkins WHERE player_id = $1 GROUP BY DATE(checked_in_at)) t
      `, [playerId]);
      return parseInt(r.rows[0].max_day);
    }
    case 'unique_battles': {
      const r = await client.query(`
        SELECT COUNT(DISTINCT CASE WHEN challenger_id = $1 THEN opponent_id ELSE challenger_id END) AS cnt
        FROM battles WHERE (challenger_id = $1 OR opponent_id = $1)
      `, [playerId]);
      return parseInt(r.rows[0].cnt);
    }
    case 'weekend_rounds': {
      const r = await client.query(`
        SELECT COUNT(*) AS cnt FROM checkins
        WHERE player_id = $1 AND EXTRACT(DOW FROM checked_in_at) IN (0, 6)
      `, [playerId]);
      return parseInt(r.rows[0].cnt);
    }
    case 'new_courses_week': {
      const r = await client.query(`
        SELECT COUNT(DISTINCT course_id) AS cnt FROM checkins
        WHERE player_id = $1 AND checked_in_at >= $2
          AND course_id NOT IN (
            SELECT DISTINCT course_id FROM checkins WHERE player_id = $1 AND checked_in_at < $2
          )
      `, [playerId, weekAgo]);
      return parseInt(r.rows[0].cnt);
    }
    case 'same_course_visits': {
      const r = await client.query(`
        SELECT COALESCE(MAX(cnt), 0) AS max_visits
        FROM (SELECT COUNT(*) AS cnt FROM checkins WHERE player_id = $1 GROUP BY course_id) t
      `, [playerId]);
      return parseInt(r.rows[0].max_visits);
    }
    case 'full_rounds': {
      const r = await client.query('SELECT total_rounds AS cnt FROM players WHERE id = $1', [playerId]);
      return parseInt(r.rows[0].cnt);
    }
    case 'unique_states': {
      const r = await client.query(`
        SELECT COUNT(DISTINCT c.state) AS cnt FROM checkins ci JOIN courses c ON c.id = ci.course_id WHERE ci.player_id = $1
      `, [playerId]);
      return parseInt(r.rows[0].cnt);
    }
    case 'night_checkins': {
      const r = await client.query(`
        SELECT COUNT(*) AS cnt FROM checkins WHERE player_id = $1 AND EXTRACT(HOUR FROM checked_in_at) >= 20
      `, [playerId]);
      return parseInt(r.rows[0].cnt);
    }
    case 'morning_checkins': {
      const r = await client.query(`
        SELECT COUNT(*) AS cnt FROM checkins WHERE player_id = $1
        AND EXTRACT(HOUR FROM checked_in_at) >= 5 AND EXTRACT(HOUR FROM checked_in_at) < 9
      `, [playerId]);
      return parseInt(r.rows[0].cnt);
    }
    case 'full_rounds_week': {
      const r = await client.query(`
        SELECT COUNT(*) AS cnt FROM checkins WHERE player_id = $1 AND is_round_complete = TRUE AND checked_in_at >= $2
      `, [playerId, weekAgo]);
      return parseInt(r.rows[0].cnt);
    }
    case 'battle_wins': {
      const r = await client.query('SELECT battle_wins AS cnt FROM players WHERE id = $1', [playerId]);
      return parseInt(r.rows[0].cnt);
    }
    case 'login_streak': {
      const r = await client.query('SELECT login_streak AS cnt FROM players WHERE id = $1', [playerId]);
      return parseInt(r.rows[0].cnt);
    }
    default:
      return 0;
  }
}
