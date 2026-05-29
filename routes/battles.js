const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { grantXp, grantGold, evaluateBadges } = require('./xp-engine');
const { addToInventory } = require('./vault');
const { checkQuestCompletion } = require('./story');

// ── Battle Item Choice Helpers ─────────────────────────────────────────────────

/**
 * Rarity weights by battle type for item choice.
 * Daily: Common 50%, Uncommon 35%, Rare 15%
 * Weekly: Uncommon 40%, Rare 40%, Epic 20%
 * Monthly: Rare 40%, Epic 40%, Legendary 20%
 */
const BATTLE_ITEM_WEIGHTS = {
  daily: { common: 50, uncommon: 35, rare: 15, epic: 0, legendary: 0 },
  weekly: { common: 0, uncommon: 40, rare: 40, epic: 20, legendary: 0 },
  monthly: { common: 0, uncommon: 0, rare: 40, epic: 40, legendary: 20 },
};

/**
 * Generate 3 item options for a battle winner based on battle type.
 * Returns array of 3 vault_items rows (may have duplicates if item pool is small).
 */
async function generateBattleItemOptions(pool, battleType) {
  const weights = BATTLE_ITEM_WEIGHTS[battleType] || BATTLE_ITEM_WEIGHTS.daily;
  const items = await pool.query(`SELECT * FROM vault_items`);
  if (!items.rows.length) return [];

  // Build weighted pool
  const weightedPool = [];
  for (const item of items.rows) {
    const w = weights[item.rarity] || 0;
    for (let i = 0; i < w; i++) weightedPool.push(item);
  }
  if (!weightedPool.length) return [];

  // Pick 3 distinct items (by id if possible)
  const chosen = [];
  const chosenIds = new Set();
  let attempts = 0;
  while (chosen.length < 3 && attempts < 50) {
    const pick = weightedPool[Math.floor(Math.random() * weightedPool.length)];
    if (!chosenIds.has(pick.id)) {
      chosen.push(pick);
      chosenIds.add(pick.id);
    }
    attempts++;
  }
  // If pool too small, just repeat
  while (chosen.length < 3) {
    const pick = weightedPool[Math.floor(Math.random() * weightedPool.length)];
    chosen.push(pick);
  }

  return chosen.slice(0, 3).map(item => ({
    id: item.id,
    name: item.name,
    icon: item.icon,
    rarity: item.rarity,
    description: item.description,
  }));
}

/**
 * Create pending item choice record for a battle winner.
 * Called from resolveBattle after winner is determined.
 */
async function createBattleItemChoice(client, battleId, winnerId, battleType) {
  try {
    const options = await generateBattleItemOptions(client, battleType);
    if (!options.length) return;
    await client.query(
      `INSERT INTO battle_item_choices (battle_id, player_id, options)
       VALUES ($1, $2, $3)
       ON CONFLICT (battle_id, player_id) DO NOTHING`,
      [battleId, winnerId, JSON.stringify(options)]
    );
  } catch (e) {
    // non-fatal — item choice failures don't block battle resolution
    console.error('createBattleItemChoice error:', e.message);
  }
}

// ── Time Window Helpers ───────────────────────────────────────────────────────

// Duration in seconds for each battle type.
// Timer runs from the engagement moment, not from a PST clock reset.
const BATTLE_DURATION_SECONDS = {
  daily: 24 * 60 * 60,       // 24 h
  weekly: 7 * 24 * 60 * 60,  // 7 d
  monthly: 30 * 24 * 60 * 60, // 30 d
};

function durationSecondsForType(battleType) {
  return BATTLE_DURATION_SECONDS[battleType] || BATTLE_DURATION_SECONDS.daily;
}

// Returns ends_at = from + duration_seconds.
function computeEndsAtFromMoment(durationSeconds, from = new Date()) {
  return new Date(from.getTime() + durationSeconds * 1000);
}

function timeRemaining(endsAt) {
  // Open challenges have no ends_at until someone accepts.
  if (!endsAt) return 'Waiting for opponent';
  const ms = new Date(endsAt) - Date.now();
  if (ms <= 0) return 'Ended';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h >= 1) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── Battle Score Computation ──────────────────────────────────────────────────

async function computePlayerBattleValue(client, battleId, playerId, metric) {
  const r = await client.query(
    `SELECT total_score, birdies FROM battle_scores
     WHERE battle_id = $1 AND player_id = $2`,
    [battleId, playerId]
  );
  if (r.rows.length === 0) return null;

  if (metric === 'best_score') {
    return Math.min(...r.rows.map(row => parseInt(row.total_score)));
  } else if (metric === 'birdies') {
    return r.rows.reduce((sum, row) => sum + parseInt(row.birdies), 0);
  } else if (metric === 'rounds') {
    return r.rows.length;
  } else if (metric === 'average') {
    const avg = r.rows.reduce((sum, row) => sum + parseInt(row.total_score), 0) / r.rows.length;
    return Math.round(avg * 10) / 10;
  }
  return null;
}

function determineWinner(metric, challengerValue, opponentValue, challengerId, opponentId) {
  if (challengerValue === null && opponentValue === null) return null; // tie / no data
  if (challengerValue === null) return opponentId;
  if (opponentValue === null) return challengerId;

  // best_score and average: lower wins
  if (metric === 'best_score' || metric === 'average') {
    if (challengerValue < opponentValue) return challengerId;
    if (opponentValue < challengerValue) return opponentId;
    return null; // tie
  }
  // birdies and rounds: higher wins
  if (challengerValue > opponentValue) return challengerId;
  if (opponentValue > challengerValue) return opponentId;
  return null; // tie
}

// ── Battle Resolution ─────────────────────────────────────────────────────────

async function resolveBattle(client, battle) {
  if (battle.status === 'completed' || battle.status === 'declined') return;

  const challengerValue = await computePlayerBattleValue(client, battle.id, battle.challenger_id, battle.metric);
  const opponentValue = await computePlayerBattleValue(client, battle.id, battle.opponent_id, battle.metric);

  const winnerId = determineWinner(battle.metric, challengerValue, opponentValue, battle.challenger_id, battle.opponent_id);
  const loserId = winnerId === battle.challenger_id ? battle.opponent_id :
                  winnerId === battle.opponent_id ? battle.challenger_id : null;

  await client.query(
    `UPDATE battles SET status = 'completed', winner_id = $1, resolved_at = NOW() WHERE id = $2`,
    [winnerId, battle.id]
  );

  // XP grants
  const typeKey = battle.battle_type === 'daily' ? 'daily' :
                  battle.battle_type === 'weekly' ? 'weekly' : 'monthly';

  if (winnerId && loserId) {
    await grantXp(client, winnerId, `battle_victory_${typeKey}`, { battle_id: battle.id });
    await grantXp(client, loserId, `battle_participation_${typeKey}`, { battle_id: battle.id });
    // Gold: winner gets scaled gold, loser gets participation gold
    await grantGold(client, winnerId, `battle_win_${typeKey}`, { battle_id: battle.id });
    await grantGold(client, loserId, 'battle_loss', { battle_id: battle.id, cadence: typeKey });
    await client.query('UPDATE players SET battle_wins = battle_wins + 1, win_streak = win_streak + 1 WHERE id = $1', [winnerId]);
    const ws = await client.query('SELECT win_streak FROM players WHERE id = $1', [winnerId]);
    const newStreak = ws.rows[0].win_streak;
    await client.query('UPDATE players SET best_streak = GREATEST(best_streak, $1) WHERE id = $2', [newStreak, winnerId]);
    await client.query('UPDATE players SET battle_losses = battle_losses + 1, win_streak = 0 WHERE id = $1', [loserId]);
    // Create item choice for winner
    await createBattleItemChoice(client, battle.id, winnerId, battle.battle_type);
  } else {
    // Tie or no data — both get participation
    for (const pid of [battle.challenger_id, battle.opponent_id]) {
      await grantXp(client, pid, `battle_participation_${typeKey}`, { battle_id: battle.id, result: 'tie' });
      await grantGold(client, pid, 'battle_loss', { battle_id: battle.id, result: 'tie', cadence: typeKey });
    }
  }

  // Evaluate warrior + social badges for both participants
  for (const pid of [battle.challenger_id, battle.opponent_id]) {
    try {
      const pStats = await client.query(
        'SELECT battle_wins, best_streak, total_rounds FROM players WHERE id = $1', [pid]
      );
      const uniqueOpp = await client.query(`
        SELECT COUNT(DISTINCT CASE WHEN challenger_id = $1 THEN opponent_id ELSE challenger_id END) AS cnt
        FROM battles WHERE (challenger_id = $1 OR opponent_id = $1) AND status = 'completed'
      `, [pid]);
      const badgeStats = {
        uniqueCourses: 0, totalCheckins: 0, totalRounds: parseInt(pStats.rows[0]?.total_rounds || 0),
        challengesCompleted: 0, battleWins: parseInt(pStats.rows[0]?.battle_wins || 0),
        bestStreak: parseInt(pStats.rows[0]?.best_streak || 0),
        uniqueOpponents: parseInt(uniqueOpp.rows[0]?.cnt || 0),
        uniqueStates: 0, maxSameCourseVisits: 0, weekendRounds: 0,
        nightCheckins: 0, morningCheckins: 0, weatherCheckins: 0,
        trailblazerCourses: 0, seasonsPlayed: 0, completedCities: 0,
      };
      const existing = await client.query('SELECT category, tier FROM player_badges WHERE player_id = $1', [pid]);
      const existingSet = new Set(existing.rows.map(r => `${r.category}:${r.tier}`));
      const newBadges = evaluateBadges(badgeStats, existingSet);
      for (const badge of newBadges) {
        await client.query(
          'INSERT INTO player_badges (player_id, category, tier) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [pid, badge.category, badge.tier]
        );
      }
    } catch (e) {
      // badge eval is non-fatal
    }
  }
}

// ── Exported: called from rounds.js after round completion ────────────────────

async function syncBattleProgress(pool, playerId, roundId, roundData) {
  try {
    const now = new Date();

    // ── GPS CHECK-IN GATE for battle progress ──
    // Verify the round has a valid check-in at its course today
    const roundInfo = await pool.query(
      `SELECT course_id FROM rounds WHERE id = $1 AND player_id = $2`,
      [roundId, playerId]
    );
    if (roundInfo.rows.length === 0) return;
    const roundCourseId = roundInfo.rows[0].course_id;

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const checkinCheck = await pool.query(
      `SELECT id FROM checkins
       WHERE player_id = $1 AND course_id = $2 AND checked_in_at >= $3
       LIMIT 1`,
      [playerId, roundCourseId, todayStart.toISOString()]
    );
    if (checkinCheck.rows.length === 0) {
      // No valid check-in — don't sync battle progress
      return;
    }

    // Find all active battles this player is in where we're within the window
    // AND the battle's course matches the round's course
    const battlesResult = await pool.query(
      `SELECT id, challenger_id, opponent_id, metric, battle_type, course_id
       FROM battles
       WHERE status = 'active'
         AND (challenger_id = $1 OR opponent_id = $1)
         AND started_at IS NOT NULL
         AND ends_at > $2
         AND course_id = $3`,
      [playerId, now, roundCourseId]
    );

    for (const battle of battlesResult.rows) {
      // Compute birdies: join to course_holes via default layout for accurate per-hole par.
      // Fall back to round_holes.par for courses without layout data.
      const birdiesResult = await pool.query(
        `SELECT COUNT(*) AS birdies
         FROM round_holes rh
         JOIN rounds r ON r.id = rh.round_id
         JOIN course_layouts cl ON cl.course_id = r.course_id AND cl.is_default = TRUE
         JOIN course_holes ch ON ch.layout_id = cl.id AND ch.hole_number = rh.hole_number
         WHERE rh.round_id = $1 AND rh.score = ch.par - 1
         UNION ALL
         SELECT COUNT(*) AS birdies
         FROM round_holes rh
         WHERE rh.round_id = $1
           AND NOT EXISTS (
             SELECT 1 FROM rounds r
             JOIN course_layouts cl ON cl.course_id = r.course_id AND cl.is_default = TRUE
             JOIN course_holes ch ON ch.layout_id = cl.id AND ch.hole_number = rh.hole_number
             WHERE r.id = rh.round_id
           )
           AND rh.score = rh.par - 1`,
        [roundId]
      );
      // Sum both halves (first: courses with layout data, second: courses without)
      const birdies = birdiesResult.rows.reduce((sum, row) => sum + parseInt(row.birdies || 0), 0);

      await pool.query(
        `INSERT INTO battle_scores (battle_id, player_id, round_id, total_score, birdies)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (battle_id, player_id, round_id) DO NOTHING`,
        [battle.id, playerId, roundId, roundData.total_score, birdies]
      );
    }
  } catch (err) {
    // Non-fatal
    console.error('syncBattleProgress error:', err.message);
  }
}

// ── Periodic Resolution (called from server.js) ───────────────────────────────

async function resolveExpiredBattles(pool) {
  let client;
  try {
    client = await pool.connect();
    // Resolve active battles that have expired
    const expired = await client.query(
      `SELECT * FROM battles WHERE status = 'active' AND ends_at < NOW() LIMIT 20`
    );
    for (const battle of expired.rows) {
      try {
        await client.query('BEGIN');
        await resolveBattle(client, battle);
        await client.query('COMMIT');

        // ── Story Mode Quest Checking (fire-and-forget) ──────────────────────
        try {
          // Get resolved battle data
          const resolved = await pool.query(
            `SELECT winner_id, challenger_id, opponent_id, battle_type FROM battles WHERE id = $1`,
            [battle.id]
          );
          if (resolved.rows.length > 0) {
            const { winner_id, challenger_id, opponent_id, battle_type } = resolved.rows[0];
            const winnerStreak = await pool.query(
              `SELECT win_streak, best_streak FROM players WHERE id = $1`,
              [winner_id]
            );
            const streak = winnerStreak.rows[0]?.win_streak || 0;
            const eventData = { battleType: battle_type, streak };

            // Check BATTLE_WIN quests for winner
            if (winner_id) {
              checkQuestCompletion(pool, winner_id, 'BATTLE_WIN', eventData)
                .catch(e => console.error('Story BATTLE_WIN quest error:', e.message));
              checkQuestCompletion(pool, winner_id, 'BATTLE_WIN_STREAK', eventData)
                .catch(e => console.error('Story BATTLE_WIN_STREAK quest error:', e.message));
            }
            // Check BATTLE_COMPLETE for both players
            for (const pid of [challenger_id, opponent_id]) {
              if (pid) {
                checkQuestCompletion(pool, pid, 'BATTLE_COMPLETE', { battleType: battle_type })
                  .catch(e => console.error('Story BATTLE_COMPLETE quest error:', e.message));
              }
            }
          }
        } catch (qe) {
          console.error('Story quest check error:', qe.message);
        }
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('Battle auto-resolve error:', e.message, 'battle_id:', battle.id);
      }
    }
    // Clean up expired open/pending battles that were never accepted
    await client.query(
      `UPDATE battles SET status = 'expired'
       WHERE status IN ('open', 'pending') AND ends_at < NOW()`
    );
    // Open challenges: timer starts on acceptance, not on creation.
    // Expire open challenges older than 30 days that were never accepted.
    const openExpireDays = 30;
    await client.query(
      `UPDATE battles SET status = 'expired'
       WHERE status = 'open'
         AND created_at < NOW() - ($1 || ' days')::interval`,
      [openExpireDays]
    );
  } catch (err) {
    console.error('resolveExpiredBattles error:', err.message);
  } finally {
    if (client) client.release();
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

module.exports = ({ pool }) => {
  const router = express.Router();

  // GET /api/players/search?q= — search players by username or display_name
  router.get('/players/search', requireAuth(pool), async (req, res) => {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ players: [] });
    try {
      const result = await pool.query(
        `SELECT id, display_name, username, level, battle_wins
         FROM players
         WHERE id != $1 AND (
           LOWER(display_name) LIKE $2
           OR LOWER(username) LIKE $2
         )
         ORDER BY battle_wins DESC, xp DESC
         LIMIT 10`,
        [req.player.id, `%${q.toLowerCase()}%`]
      );
      res.json({ players: result.rows });
    } catch (err) {
      console.error('Player search error:', err.message);
      res.status(500).json({ error: 'Search failed' });
    }
  });

  // POST /api/battles — create a new time-windowed battle challenge
  router.post('/battles', requireAuth(pool), async (req, res) => {
    const {
      opponent_id,
      battle_type = 'daily',
      metric = 'best_score',
      is_open = false,
      course_id,
      hole_count,
    } = req.body;

    if (!['daily', 'weekly', 'monthly'].includes(battle_type)) {
      return res.status(400).json({ error: 'battle_type must be daily, weekly, or monthly' });
    }
    if (!['best_score', 'birdies', 'rounds', 'average'].includes(metric)) {
      return res.status(400).json({ error: 'metric must be best_score, birdies, rounds, or average' });
    }
    if (!is_open && !opponent_id) {
      return res.status(400).json({ error: 'opponent_id required unless is_open=true' });
    }
    if (opponent_id && opponent_id === req.player.id) {
      return res.status(400).json({ error: 'Cannot battle yourself' });
    }
    if (!course_id) {
      return res.status(400).json({ error: 'course_id is required — select a course for this battle' });
    }
    if (!hole_count || isNaN(parseInt(hole_count, 10)) || parseInt(hole_count, 10) < 1) {
      return res.status(400).json({ error: 'hole_count is required — select a hole count for this battle' });
    }

    try {
      // Validate course exists and hole_count is valid for course
      const courseCheck = await pool.query(
        'SELECT id, name, city, state, COALESCE(hole_count, holes) AS total_holes FROM courses WHERE id = $1',
        [course_id]
      );
      if (courseCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Course not found' });
      }
      const course = courseCheck.rows[0];
      const holeCountInt = parseInt(hole_count, 10);
      if (course.total_holes && holeCountInt > course.total_holes) {
        return res.status(400).json({ error: `hole_count cannot exceed course total (${course.total_holes})` });
      }

      if (opponent_id) {
        const opp = await pool.query('SELECT id, display_name FROM players WHERE id = $1', [opponent_id]);
        if (opp.rows.length === 0) return res.status(404).json({ error: 'Opponent not found' });


      }

      const durationSecs = durationSecondsForType(battle_type);
      const status = is_open ? 'open' : 'pending';

      // 1v1 direct challenge: timer starts NOW (when the challenge is sent).
      // Open challenge: timer starts when someone accepts — ends_at is null until then.
      const now = new Date();
      const endsAt = is_open ? null : computeEndsAtFromMoment(durationSecs, now);
      const startedAt = is_open ? null : now;

      const result = await pool.query(
        `INSERT INTO battles
           (challenger_id, opponent_id, battle_type, metric, status, is_open,
            started_at, ends_at, duration_seconds, course_id, hole_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [req.player.id, opponent_id || null, battle_type, metric, status, !!is_open,
         startedAt, endsAt, durationSecs, course_id, holeCountInt]
      );

      res.status(201).json({ battle: result.rows[0] });
    } catch (err) {
      console.error('Create battle error:', err.message);
      res.status(500).json({ error: 'Failed to create battle' });
    }
  });

  // POST /api/battles/:id/accept — opponent accepts a pending challenge
  router.post('/battles/:id/accept', requireAuth(pool), async (req, res) => {
    const battleId = parseInt(req.params.id);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query('SELECT * FROM battles WHERE id = $1 FOR UPDATE', [battleId]);
      if (r.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Battle not found' }); }
      const battle = r.rows[0];

      // Open challenges: anyone can accept — timer starts NOW (engagement moment).
      if (battle.is_open && battle.status === 'open') {
        if (battle.challenger_id === req.player.id) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Cannot accept your own open challenge' });
        }
        // Compute ends_at from duration_seconds stored on the battle.
        const durationSecs = battle.duration_seconds || durationSecondsForType(battle.battle_type);
        const endsAt = computeEndsAtFromMoment(durationSecs);
        await client.query(
          `UPDATE battles
           SET opponent_id = $1, status = 'active', started_at = NOW(), ends_at = $2
           WHERE id = $3`,
          [req.player.id, endsAt, battleId]
        );
      } else if (!battle.is_open && battle.status === 'pending' && battle.opponent_id === req.player.id) {
        // 1v1 direct: timer already started when challenge was sent — just flip to active.
        await client.query(
          `UPDATE battles SET status = 'active' WHERE id = $1`,
          [battleId]
        );
      } else {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Cannot accept this battle' });
      }

      await client.query('COMMIT');
      const updated = await pool.query('SELECT * FROM battles WHERE id = $1', [battleId]);
      res.json({ battle: updated.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Accept battle error:', err.message);
      res.status(500).json({ error: 'Failed to accept battle' });
    } finally {
      client.release();
    }
  });

  // POST /api/battles/:id/decline — opponent declines
  router.post('/battles/:id/decline', requireAuth(pool), async (req, res) => {
    const battleId = parseInt(req.params.id);
    try {
      const r = await pool.query('SELECT * FROM battles WHERE id = $1', [battleId]);
      if (r.rows.length === 0) return res.status(404).json({ error: 'Battle not found' });
      const battle = r.rows[0];
      if (battle.opponent_id !== req.player.id || battle.status !== 'pending') {
        return res.status(403).json({ error: 'Cannot decline this battle' });
      }
      await pool.query(`UPDATE battles SET status = 'declined' WHERE id = $1`, [battleId]);
      res.json({ success: true });
    } catch (err) {
      console.error('Decline battle error:', err.message);
      res.status(500).json({ error: 'Failed to decline battle' });
    }
  });

  // GET /api/battles/active — current player's active battles with live scores
  router.get('/battles/active', requireAuth(pool), async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT b.*,
                ch.display_name AS challenger_name, ch.level AS challenger_level,
                op.display_name AS opponent_name, op.level AS opponent_level,
                c.name AS course_name, c.city AS course_city, c.state AS course_state,
                COALESCE(c.hole_count, c.holes) AS course_holes, c.par AS course_par
         FROM battles b
         JOIN players ch ON ch.id = b.challenger_id
         LEFT JOIN players op ON op.id = b.opponent_id
         LEFT JOIN courses c ON c.id = b.course_id
         WHERE b.status = 'active'
           AND (b.challenger_id = $1 OR b.opponent_id = $1)
         ORDER BY b.ends_at ASC`,
        [req.player.id]
      );

      const battles = await Promise.all(result.rows.map(async (b) => {
        const myId = req.player.id;
        const oppId = b.challenger_id === myId ? b.opponent_id : b.challenger_id;

        const myValue = await computePlayerBattleValue(pool, b.id, myId, b.metric);
        const oppValue = oppId ? await computePlayerBattleValue(pool, b.id, oppId, b.metric) : null;

        // Count rounds submitted
        const myRounds = await pool.query(
          'SELECT COUNT(*) AS cnt FROM battle_scores WHERE battle_id = $1 AND player_id = $2',
          [b.id, myId]
        );
        const oppRounds = oppId ? await pool.query(
          'SELECT COUNT(*) AS cnt FROM battle_scores WHERE battle_id = $1 AND player_id = $2',
          [b.id, oppId]
        ) : null;

        return {
          id: b.id,
          battle_type: b.battle_type,
          metric: b.metric,
          ends_at: b.ends_at,
          time_remaining: timeRemaining(b.ends_at),
          started_at: b.started_at,
          is_challenger: b.challenger_id === myId,
          my_name: b.challenger_id === myId ? b.challenger_name : b.opponent_name,
          opp_name: b.challenger_id === myId ? b.opponent_name : b.challenger_name,
          opp_level: b.challenger_id === myId ? b.opponent_level : b.challenger_level,
          my_value: myValue,
          opp_value: oppValue,
          my_rounds: parseInt(myRounds.rows[0]?.cnt || 0),
          opp_rounds: oppRounds ? parseInt(oppRounds.rows[0]?.cnt || 0) : 0,
          course_name: b.course_name,
          course_city: b.course_city,
          course_state: b.course_state,
          course_holes: b.course_holes ? parseInt(b.course_holes) : null,
          course_par: b.course_par ? parseInt(b.course_par) : null,
          leading: myValue !== null && oppValue !== null
            ? (b.metric === 'best_score' || b.metric === 'average'
              ? (myValue < oppValue ? 'me' : myValue > oppValue ? 'opp' : 'tied')
              : (myValue > oppValue ? 'me' : myValue < oppValue ? 'opp' : 'tied'))
            : (myValue !== null ? 'me' : oppValue !== null ? 'opp' : 'tied'),
        };
      }));

      res.json({ battles });
    } catch (err) {
      console.error('Get active battles error:', err.message);
      res.status(500).json({ error: 'Failed to get active battles' });
    }
  });

  // GET /api/battles/incoming — pending challenges sent TO me
  router.get('/battles/incoming', requireAuth(pool), async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT b.id, b.battle_type, b.metric, b.ends_at, b.created_at,
                ch.display_name AS challenger_name, ch.level AS challenger_level,
                ch.battle_wins AS challenger_wins,
                c.name AS course_name, c.city AS course_city, c.state AS course_state,
                COALESCE(c.hole_count, c.holes) AS course_holes, c.par AS course_par
         FROM battles b
         JOIN players ch ON ch.id = b.challenger_id
         LEFT JOIN courses c ON c.id = b.course_id
         WHERE b.status = 'pending' AND b.opponent_id = $1
           AND b.ends_at > NOW()
         ORDER BY b.created_at DESC`,
        [req.player.id]
      );
      res.json({ challenges: result.rows.map(b => ({
        ...b,
        time_remaining: timeRemaining(b.ends_at),
      })) });
    } catch (err) {
      console.error('Get incoming error:', err.message);
      res.status(500).json({ error: 'Failed to get incoming challenges' });
    }
  });

  // GET /api/battles/outgoing — pending + open challenges I sent
  router.get('/battles/outgoing', requireAuth(pool), async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT b.id, b.battle_type, b.metric, b.ends_at, b.created_at,
                b.status, b.is_open, b.duration_seconds,
                op.display_name AS opponent_name, op.level AS opponent_level,
                c.name AS course_name, c.city AS course_city, c.state AS course_state,
                COALESCE(c.hole_count, c.holes) AS course_holes, c.par AS course_par
         FROM battles b
         LEFT JOIN players op ON op.id = b.opponent_id
         LEFT JOIN courses c ON c.id = b.course_id
         WHERE b.status IN ('pending', 'open')
           AND b.challenger_id = $1
           AND (b.ends_at IS NULL OR b.ends_at > NOW())
         ORDER BY b.created_at DESC`,
        [req.player.id]
      );
      res.json({ challenges: result.rows.map(b => ({
        ...b,
        time_remaining: timeRemaining(b.ends_at),
      })) });
    } catch (err) {
      console.error('Get outgoing error:', err.message);
      res.status(500).json({ error: 'Failed to get outgoing challenges' });
    }
  });

  // GET /api/battles/open — open challenges anyone can accept
  router.get('/battles/open', requireAuth(pool), async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT b.id, b.battle_type, b.metric, b.ends_at, b.created_at,
                b.duration_seconds,
                ch.display_name AS challenger_name, ch.level AS challenger_level,
                ch.battle_wins AS challenger_wins,
                c.name AS course_name, c.city AS course_city, c.state AS course_state,
                COALESCE(c.hole_count, c.holes) AS course_holes, c.par AS course_par
         FROM battles b
         JOIN players ch ON ch.id = b.challenger_id
         LEFT JOIN courses c ON c.id = b.course_id
         WHERE b.status = 'open'
           AND b.challenger_id != $1
           AND b.created_at > NOW() - INTERVAL '30 days'
         ORDER BY b.created_at DESC
         LIMIT 20`,
        [req.player.id]
      );
      res.json({ open: result.rows.map(b => ({
        ...b,
        time_remaining: timeRemaining(b.ends_at),
      })) });
    } catch (err) {
      console.error('Get open battles error:', err.message);
      res.status(500).json({ error: 'Failed to get open challenges' });
    }
  });

  // GET /api/battles/me — full battle history for current player
  router.get('/battles/me', requireAuth(pool), async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT b.id, b.status, b.battle_type, b.metric, b.created_at, b.resolved_at,
                b.ends_at, b.winner_id, b.challenger_id, b.opponent_id,
                ch.display_name AS challenger_name,
                op.display_name AS opponent_name,
                c.name AS course_name, c.city AS course_city, c.state AS course_state,
                COALESCE(c.hole_count, c.holes) AS course_holes, c.par AS course_par
         FROM battles b
         JOIN players ch ON ch.id = b.challenger_id
         LEFT JOIN players op ON op.id = b.opponent_id
         LEFT JOIN courses c ON c.id = b.course_id
         WHERE b.status = 'completed'
           AND (b.challenger_id = $1 OR b.opponent_id = $1)
         ORDER BY b.resolved_at DESC
         LIMIT 50`,
        [req.player.id]
      );

      const battles = await Promise.all(result.rows.map(async (b) => {
        const myId = req.player.id;
        const oppId = b.challenger_id === myId ? b.opponent_id : b.challenger_id;
        const myValue = await computePlayerBattleValue(pool, b.id, myId, b.metric);
        const oppValue = oppId ? await computePlayerBattleValue(pool, b.id, oppId, b.metric) : null;
        return {
          id: b.id,
          battle_type: b.battle_type,
          metric: b.metric,
          ended_at: b.resolved_at,
          opponent_name: b.challenger_id === myId ? b.opponent_name : b.challenger_name,
          my_value: myValue,
          opp_value: oppValue,
          won: b.winner_id === myId,
          was_tie: b.winner_id === null,
          course_name: b.course_name,
          course_city: b.course_city,
          course_state: b.course_state,
          course_holes: b.course_holes ? parseInt(b.course_holes) : null,
          course_par: b.course_par ? parseInt(b.course_par) : null,
        };
      }));

      res.json({ battles });
    } catch (err) {
      console.error('Get battle history error:', err.message);
      res.status(500).json({ error: 'Failed to get battle history' });
    }
  });

  // GET /api/battles/pending-item-choice — check if I have an unclaimed item choice
  // MUST be before /:id to avoid route capture
  router.get('/battles/pending-item-choice', requireAuth(pool), async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT bic.id, bic.battle_id, bic.options, b.battle_type,
                op.display_name AS opponent_name
         FROM battle_item_choices bic
         JOIN battles b ON b.id = bic.battle_id
         LEFT JOIN players op ON op.id = (
           CASE WHEN b.challenger_id = $1 THEN b.opponent_id ELSE b.challenger_id END
         )
         WHERE bic.player_id = $1 AND bic.claimed_at IS NULL
         ORDER BY bic.created_at DESC
         LIMIT 1`,
        [req.player.id]
      );
      if (result.rows.length === 0) {
        return res.json({ pending: null });
      }
      const row = result.rows[0];
      res.json({
        pending: {
          choice_id: row.id,
          battle_id: row.battle_id,
          battle_type: row.battle_type,
          opponent_name: row.opponent_name,
          options: row.options,
        },
      });
    } catch (err) {
      console.error('pending-item-choice error:', err.message);
      res.status(500).json({ error: 'Failed to get pending choice' });
    }
  });

  // POST /api/battles/claim-item — player picks one of the 3 options
  // MUST be before /:id
  router.post('/battles/claim-item', requireAuth(pool), async (req, res) => {
    const { choice_id, item_id } = req.body;
    if (!choice_id || !item_id) {
      return res.status(400).json({ error: 'choice_id and item_id required' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `SELECT * FROM battle_item_choices WHERE id = $1 AND player_id = $2 FOR UPDATE`,
        [choice_id, req.player.id]
      );
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Choice not found' });
      }
      const choice = result.rows[0];
      if (choice.claimed_at) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Already claimed' });
      }

      // Verify item_id is one of the options
      const validIds = choice.options.map(o => o.id);
      if (!validIds.includes(item_id)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid item selection' });
      }

      // Add to inventory
      await addToInventory(client, req.player.id, item_id, 'battle_reward');

      // Mark claimed
      await client.query(
        `UPDATE battle_item_choices SET chosen_item_id = $1, claimed_at = NOW() WHERE id = $2`,
        [item_id, choice_id]
      );

      await client.query('COMMIT');

      // Return the chosen item details
      const chosen = choice.options.find(o => o.id === item_id);
      res.json({ success: true, item: chosen });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('claim-item error:', err.message);
      res.status(500).json({ error: 'Failed to claim item' });
    } finally {
      client.release();
    }
  });

  // GET /api/battles/leaderboard — top battlers
  // MUST be before /:id to avoid route capture
  router.get('/battles/leaderboard', async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT p.id, p.display_name, p.battle_wins, p.battle_losses, p.win_streak,
                p.level, p.xp,
                ROUND(p.battle_wins::numeric / NULLIF(p.battle_wins + p.battle_losses, 0) * 100, 1) AS win_rate
         FROM players p
         WHERE p.battle_wins > 0
         ORDER BY p.battle_wins DESC
         LIMIT 50`
      );
      res.json({ leaderboard: result.rows });
    } catch (err) {
      console.error('Battle leaderboard error:', err.message);
      res.status(500).json({ error: 'Failed to get leaderboard' });
    }
  });

  // GET /api/battles/:id — single battle detail
  // MUST be after all named routes (leaderboard, me, active, etc.)
  router.get('/battles/:id', requireAuth(pool), async (req, res) => {
    const battleId = parseInt(req.params.id);
    try {
      const r = await pool.query(
        `SELECT b.*,
                ch.display_name AS challenger_name, ch.level AS challenger_level,
                op.display_name AS opponent_name, op.level AS opponent_level
         FROM battles b
         JOIN players ch ON ch.id = b.challenger_id
         LEFT JOIN players op ON op.id = b.opponent_id
         WHERE b.id = $1
           AND (b.challenger_id = $2 OR b.opponent_id = $2 OR b.is_open = TRUE)`,
        [battleId, req.player.id]
      );
      if (r.rows.length === 0) return res.status(404).json({ error: 'Battle not found' });
      const b = r.rows[0];

      const scores = await pool.query(
        `SELECT bs.*, r.total_score AS round_score, r.completed_at
         FROM battle_scores bs
         JOIN rounds r ON r.id = bs.round_id
         WHERE bs.battle_id = $1
         ORDER BY bs.recorded_at ASC`,
        [battleId]
      );

      res.json({
        battle: { ...b, time_remaining: timeRemaining(b.ends_at) },
        scores: scores.rows,
      });
    } catch (err) {
      console.error('Get battle detail error:', err.message);
      res.status(500).json({ error: 'Failed to get battle' });
    }
  });

  return router;
};

module.exports.syncBattleProgress = syncBattleProgress;
module.exports.resolveExpiredBattles = resolveExpiredBattles;
