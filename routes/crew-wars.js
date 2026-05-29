/**
 * Crew Wars Route — Disc Golf Go
 * Owns: crew-vs-crew war challenges (create, accept, decline, scoring, resolution)
 * Does NOT own: individual round scoring (rounds.js), gold transactions (vault.js),
 *               crew membership/roles (crews.js), 1v1 battles (battles.js),
 *               crew vault distribution (crews.js)
 *
 * Challenge types:
 *   target — boss/manager challenges a specific crew; they accept/decline
 *   open   — challenge is open; first crew to join becomes the defender
 *
 * Reward model (platform-funded — no entry fee):
 *   Winner earns 200 gold in crew treasury + random item in crew vault
 *   All participants earn 50 XP (tracked in crew_members.xp, non-transferable)
 *
 * Permissions:
 *   Boss or Manager: initiate, accept, decline wars
 *   Any crew member: play rounds that auto-count toward active war
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');

// Platform-funded victory rewards — no entry fee from crews
const WAR_VICTORY_GOLD = 200;
const WAR_PARTICIPANT_XP = 50;
const WAR_ITEM_POOL = [
  { item_type: 'xp_boost',   item_name: 'XP Boost' },
  { item_type: 'gold_boost', item_name: 'Gold Boost' },
  { item_type: 'cosmetic',   item_name: 'War Banner' },
  { item_type: 'badge',      item_name: 'War Victor Badge' },
  { item_type: 'cosmetic',   item_name: 'Victory Disc Skin' },
];

function timeRemaining(endsAt) {
  if (!endsAt) return 'Waiting for start';
  const ms = new Date(endsAt) - Date.now();
  if (ms <= 0) return 'Ended';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h >= 1) return `${h}h ${m}m`;
  return `${m}m`;
}

async function getMembership(pool, crewId, playerId) {
  const r = await pool.query(
    'SELECT id, role FROM crew_members WHERE crew_id = $1 AND player_id = $2',
    [crewId, playerId]
  );
  return r.rows[0] || null;
}

function isBossOrManager(membership) {
  return membership && ['boss', 'manager'].includes(membership.role);
}

async function getCrewWarScore(pool, warId, crewId) {
  const r = await pool.query(
    `SELECT COALESCE(SUM(cwp.score_vs_par), 0) AS combined_score,
            COUNT(cwp.id)::int AS player_count
     FROM crew_war_players cwp
     WHERE cwp.war_id = $1 AND cwp.crew_id = $2`,
    [warId, crewId]
  );
  return r.rows[0] || { combined_score: 0, player_count: 0 };
}

// Send a notification to all crew members (boss + manager roles)
async function notifyCrew(pool, crewId, title, message, type, warId) {
  try {
    // Insert notification for the crew
    await pool.query(
      `INSERT INTO crew_notifications (crew_id, title, message, type, war_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [crewId, title, message, type, warId]
    );
  } catch (err) {
    console.error('notifyCrew error:', err.message);
  }
}

async function resolveWar(pool, war) {
  const client = await safeConnect(pool);
  try {
    await client.query('BEGIN');

    const challengerScore = await getCrewWarScore(client, war.id, war.challenging_crew_id);
    const defenderScore = await getCrewWarScore(client, war.id, war.defending_crew_id);

    let winnerId = null;
    if (challengerScore.player_count === 0 && defenderScore.player_count === 0) {
      winnerId = null;
    } else if (challengerScore.player_count === 0) {
      winnerId = war.defending_crew_id;
    } else if (defenderScore.player_count === 0) {
      winnerId = war.challenging_crew_id;
    } else if (challengerScore.combined_score < defenderScore.combined_score) {
      winnerId = war.challenging_crew_id;
    } else if (defenderScore.combined_score < challengerScore.combined_score) {
      winnerId = war.defending_crew_id;
    }

    await client.query(
      `UPDATE crew_wars SET status = 'completed', winner_crew_id = $1, resolved_at = NOW()
       WHERE id = $2`,
      [winnerId, war.id]
    );

    // Award XP to all war participants (crew_war_players) — non-transferable, per-member
    await client.query(
      `UPDATE crew_members cm
       SET xp = cm.xp + $1
       FROM crew_war_players cwp
       WHERE cwp.war_id = $2
         AND cwp.player_id = cm.player_id
         AND cwp.crew_id = cm.crew_id`,
      [WAR_PARTICIPANT_XP, war.id]
    );

    let notifyWinnerId = null;
    let notifyWinnerName = '';
    let notifyItemName = '';

    if (winnerId) {
      // Platform-funded gold reward — no deduction from loser
      await client.query(
        `UPDATE crew_gold SET gold = gold + $1 WHERE crew_id = $2`,
        [WAR_VICTORY_GOLD, winnerId]
      );

      // Award random item to winning crew
      const item = WAR_ITEM_POOL[Math.floor(Math.random() * WAR_ITEM_POOL.length)];
      await client.query(
        `INSERT INTO crew_items (crew_id, item_type, item_name, war_id)
         VALUES ($1, $2, $3, $4)`,
        [winnerId, item.item_type, item.item_name, war.id]
      );

      const winRes = await client.query('SELECT name FROM crews WHERE id = $1', [winnerId]);
      notifyWinnerId = winnerId;
      notifyWinnerName = winRes.rows[0]?.name || 'Crew';
      notifyItemName = item.item_name;
    }

    await client.query('COMMIT');

    // Notify winner AFTER commit — fire-and-forget, never throws
    if (notifyWinnerId) {
      try {
        await notifyCrew(pool, notifyWinnerId,
          `🏆 War Won!`,
          `Your crew "${notifyWinnerName}" won the war! +${WAR_VICTORY_GOLD} gold + "${notifyItemName}" added to your vault.`,
          'war_ended', war.id);
      } catch (e) {
        console.error('notify winner failed:', e.message);
      }
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('resolveWar error:', err.message, 'war_id:', war.id);
  } finally {
    client.release();
  }
}

async function syncWarProgress(pool, playerId, roundId, roundData) {
  try {
    const roundInfo = await pool.query(
      `SELECT course_id, total_score, total_par FROM rounds WHERE id = $1 AND player_id = $2`,
      [roundId, playerId]
    );
    if (!roundInfo.rows.length) return;
    const { course_id, total_score, total_par } = roundInfo.rows[0];
    const scoreVsPar = (total_score || 0) - (total_par || 0);

    const activeWars = await pool.query(
      `SELECT cw.id, cw.challenging_crew_id, cw.defending_crew_id, cm.crew_id
       FROM crew_wars cw
       JOIN crew_members cm ON cm.player_id = $1
         AND cm.crew_id IN (cw.challenging_crew_id, cw.defending_crew_id)
       WHERE cw.status = 'active'
         AND cw.course_id = $2
         AND cw.ends_at > NOW()`,
      [playerId, course_id]
    );

    for (const war of activeWars.rows) {
      await pool.query(
        `INSERT INTO crew_war_players (war_id, player_id, crew_id, round_id, total_score, score_vs_par)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (war_id, player_id) DO UPDATE
           SET round_id = EXCLUDED.round_id,
               total_score = EXCLUDED.total_score,
               score_vs_par = EXCLUDED.score_vs_par,
               submitted_at = NOW()
           WHERE EXCLUDED.score_vs_par < crew_war_players.score_vs_par`,
        [war.id, playerId, war.crew_id, roundId, total_score, scoreVsPar]
      );
    }
  } catch (err) {
    console.error('syncWarProgress error:', err.message);
  }
}

async function resolveExpiredWars(pool) {
  try {
    const expired = await pool.query(
      `SELECT * FROM crew_wars WHERE status = 'active' AND ends_at < NOW() LIMIT 10`
    );
    for (const war of expired.rows) {
      await resolveWar(pool, war);
    }
    // Expire pending target wars never accepted after 48h
    await pool.query(
      `UPDATE crew_wars SET status = 'expired'
       WHERE status = 'pending'
         AND challenge_type = 'target'
         AND created_at < NOW() - INTERVAL '48 hours'`
    );
    // Expire open challenges that were never joined after the full window_duration_hours + 24h grace
    await pool.query(
      `UPDATE crew_wars SET status = 'expired'
       WHERE status = 'pending'
         AND challenge_type = 'open'
         AND window_duration_hours IS NOT NULL
         AND created_at < NOW() - (window_duration_hours || ' hours')::interval - INTERVAL '24 hours'`
    );
  } catch (err) {
    console.error('resolveExpiredWars error:', err.message);
  }
}

// Safely acquire a client from the pool, attach an error listener to prevent
// unhandled 'error' events on checked-out connections (PostgreSQL may kill
// idle-in-transaction connections, firing an async error that crashes Node
// if no listener is attached).
async function safeConnect(pool) {
  const client = await pool.connect();
  client.on('error', (err) => {
    console.error('[client] Connection error on checked-out client:', err.message);
  });
  return client;
}

module.exports = ({ pool }) => {
  const router = express.Router();

  // ─────────────────────────────────────────────────────
  // POST /api/crew/wars/challenge — create a target OR open challenge
  // Body: { challenge_type, target_crew_id?, course_id, duration_hours?,
  //         window_duration_hours?, scheduled_start_at?, layout_id?, holes_count? }
  // ─────────────────────────────────────────────────────
  router.post('/crew/wars/challenge', requireAuth(pool), async (req, res) => {
    const {
      challenge_type = 'target',
      target_crew_id,
      course_id,
      duration_hours = 48,
      window_duration_hours,
      scheduled_start_at,
      layout_id,
      holes_count,
    } = req.body;

    if (!course_id) return res.status(400).json({ error: 'course_id required' });
    if (!['target', 'open'].includes(challenge_type)) {
      return res.status(400).json({ error: 'challenge_type must be "target" or "open"' });
    }

    if (challenge_type === 'target' && (!target_crew_id || parseInt(target_crew_id) <= 0 || isNaN(parseInt(target_crew_id)))) {
      return res.status(400).json({ error: 'target_crew_id must be a positive integer for target challenges' });
    }
    if (challenge_type === 'open' && !window_duration_hours) {
      return res.status(400).json({ error: 'window_duration_hours required for open challenges' });
    }
    if (![24, 48, 72].includes(parseInt(duration_hours))) {
      return res.status(400).json({ error: 'duration_hours must be 24, 48, or 72' });
    }
    if (challenge_type === 'open' && ![72, 168, 720].includes(parseInt(window_duration_hours))) {
      return res.status(400).json({ error: 'window_duration_hours must be 72, 168, or 720' });
    }

    const client = await safeConnect(pool);
    try {
      await client.query('BEGIN');

      const memberRes = await client.query(
        `SELECT cm.crew_id, cm.role FROM crew_members cm
         JOIN crews c ON c.id = cm.crew_id AND c.disbanded_at IS NULL
         WHERE cm.player_id = $1 AND cm.role IN ('boss', 'manager')
         LIMIT 1`,
        [req.player.id]
      );
      if (!memberRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Only crew boss or manager can challenge other crews' });
      }
      const myCrew = memberRes.rows[0];

      if (challenge_type === 'target') {
        if (parseInt(target_crew_id) === myCrew.crew_id) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Cannot challenge your own crew' });
        }
        const targetRes = await client.query(
          'SELECT id FROM crews WHERE id = $1 AND disbanded_at IS NULL',
          [target_crew_id]
        );
        if (!targetRes.rows.length) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Target crew not found' });
        }
      }

      const courseRes = await client.query('SELECT id, name FROM courses WHERE id = $1', [course_id]);
      if (!courseRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Course not found' });
      }

      // For open challenges: defending_crew_id is NULL (any crew can join)
      // For target challenges: defending_crew_id is the target
      const defendingCrewId = challenge_type === 'target' ? target_crew_id : null;

      let scheduledStart = null;
      if (scheduled_start_at && challenge_type === 'target') {
        const d = new Date(scheduled_start_at);
        if (isNaN(d.getTime()) || d <= new Date()) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'scheduled_start_at must be a future date/time' });
        }
        scheduledStart = d;
      }

      const warRes = await client.query(
        `INSERT INTO crew_wars
           (challenging_crew_id, defending_crew_id, course_id,
            challenge_type, duration_hours, window_duration_hours,
            status, created_by_player_id, scheduled_start_at, layout_id, holes_count)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, $10)
         RETURNING *`,
        [myCrew.crew_id, defendingCrewId, course_id,
         challenge_type, parseInt(duration_hours), parseInt(window_duration_hours) || null,
         req.player.id, scheduledStart, layout_id || null,
         holes_count ? parseInt(holes_count) : null]
      );

      const createdWar = warRes.rows[0];
      const createdCourseName = courseRes.rows[0].name;

      await client.query('COMMIT');

      // Notify after commit to avoid holding transaction open
      if (challenge_type === 'open') {
        try {
          await notifyCrew(pool, myCrew.crew_id,
            `🎯 Open Challenge Posted!`,
            `Your crew posted an open challenge at ${createdCourseName}. First crew to join becomes your opponent!`,
            'war_challenge', createdWar.id);
        } catch (e) {
          console.error('notify open challenge failed:', e.message);
        }
      }

      res.status(201).json({ war: createdWar });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('POST /crew/wars/challenge error:', err.message);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  });

  // ─────────────────────────────────────────────────────
  // GET /api/crew/wars/open — all open challenges (excluding my crew's)
  // ─────────────────────────────────────────────────────
  router.get('/crew/wars/open', requireAuth(pool), async (req, res) => {
    try {
      const crewRes = await pool.query(
        `SELECT cm.crew_id FROM crew_members cm
         JOIN crews c ON c.id = cm.crew_id AND c.disbanded_at IS NULL
         WHERE cm.player_id = $1 LIMIT 1`,
        [req.player.id]
      );
      const myCrewId = crewRes.rows[0]?.crew_id || null;

      // Exclude my crew's challenges; show challenges that could still be joined
      // (pending + within expiry window)
      const r = await pool.query(
        `SELECT cw.*,
                ch.name AS challenger_crew_name, ch.logo_url AS challenger_crew_logo_url,
                co.name AS course_name, co.city AS course_city, co.state AS course_state,
                p.username AS created_by_username
         FROM crew_wars cw
         JOIN crews ch ON ch.id = cw.challenging_crew_id
         LEFT JOIN courses co ON co.id = cw.course_id
         JOIN players p ON p.id = cw.created_by_player_id
         WHERE cw.challenge_type = 'open'
           AND cw.status = 'pending'
           AND cw.created_at > NOW() - (COALESCE(cw.window_duration_hours, 72) || ' hours')::interval
           AND (cw.challenging_crew_id != $1 OR $1 IS NULL)
         ORDER BY cw.created_at DESC`,
        [myCrewId]
      );

      res.json({ wars: r.rows });
    } catch (err) {
      console.error('GET /crew/wars/open error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────
  // POST /api/crew/wars/:id/join — crew joins an open challenge as defender
  // ─────────────────────────────────────────────────────
  router.post('/crew/wars/:id/join', requireAuth(pool), async (req, res) => {
    const warId = parseInt(req.params.id);
    const client = await safeConnect(pool);
    try {
      await client.query('BEGIN');

      const warRes = await client.query(
        'SELECT * FROM crew_wars WHERE id = $1 FOR UPDATE',
        [warId]
      );
      if (!warRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'War not found' });
      }
      const war = warRes.rows[0];

      if (war.challenge_type !== 'open') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'This endpoint is only for open challenges. Use /accept for target challenges.' });
      }
      if (war.status !== 'pending') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'War is no longer open for joining' });
      }

      const memberRes = await client.query(
        `SELECT cm.crew_id, cm.role FROM crew_members cm
         JOIN crews c ON c.id = cm.crew_id AND c.disbanded_at IS NULL
         WHERE cm.player_id = $1 AND cm.role IN ('boss', 'manager')
         LIMIT 1`,
        [req.player.id]
      );
      if (!memberRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Only crew boss or manager can join open challenges' });
      }
      const myCrew = memberRes.rows[0];

      if (war.challenging_crew_id === myCrew.crew_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Cannot join your own challenge' });
      }

      // Calculate ends_at based on window_duration_hours
      const windowHrs = war.window_duration_hours || 72;
      const endsAt = new Date(Date.now() + windowHrs * 3600 * 1000);

      await client.query(
        `UPDATE crew_wars
           SET status = 'active', defending_crew_id = $1,
               started_at = NOW(), ends_at = $2
           WHERE id = $3`,
        [myCrew.crew_id, endsAt, warId]
      );

      // Gather notification data inside transaction, send after commit
      const courseRes = await client.query('SELECT name FROM courses WHERE id = $1', [war.course_id]);
      const courseName = courseRes.rows[0]?.name || 'the course';
      const defendingCrewRes = await client.query('SELECT name FROM crews WHERE id = $1', [myCrew.crew_id]);
      const defendingName = defendingCrewRes.rows[0]?.name || 'A crew';
      const challengerRes = await client.query('SELECT name FROM crews WHERE id = $1', [war.challenging_crew_id]);
      const challengerName = challengerRes.rows[0]?.name || 'a crew';

      await client.query('COMMIT');

      // Fire-and-forget notifications AFTER commit
      try {
        await notifyCrew(pool, war.challenging_crew_id,
          `⚔️ War Has Begun!`,
          `An opponent accepted your open challenge! "${defendingName}" is now your opponent at ${courseName}. War timer is running — play now!`,
          'war_started', war.id);
      } catch (e) {
        console.error('notify challenger failed:', e.message);
      }
      try {
        await notifyCrew(pool, myCrew.crew_id,
          `⚔️ War Has Begun!`,
          `You joined an open challenge against "${challengerName}" at ${courseName}! Play your rounds now — timer is running!`,
          'war_started', war.id);
      } catch (e) {
        console.error('notify defender failed:', e.message);
      }

      res.json({ success: true, ends_at: endsAt });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('POST /crew/wars/:id/join error:', err.message);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  });

  // ─────────────────────────────────────────────────────
  // GET /api/crew/wars/pending — target challenges awaiting my crew
  // (also shows open challenges my crew has posted)
  // ─────────────────────────────────────────────────────
  router.get('/crew/wars/pending', requireAuth(pool), async (req, res) => {
    try {
      const crewRes = await pool.query(
        `SELECT cm.crew_id FROM crew_members cm
         JOIN crews c ON c.id = cm.crew_id AND c.disbanded_at IS NULL
         WHERE cm.player_id = $1 LIMIT 1`,
        [req.player.id]
      );
      if (!crewRes.rows.length) return res.json({ wars: [] });
      const crewId = crewRes.rows[0].crew_id;

      // Only return target challenges specifically aimed at my crew — remove the
      // OR IS NULL clause that previously leaked all orphaned target wars to every user
      const r = await pool.query(
        `SELECT cw.*,
                ch.name AS challenger_crew_name, ch.logo_url AS challenger_crew_logo_url,
                def.name AS defending_crew_name, def.logo_url AS defending_crew_logo_url,
                co.name AS course_name, co.city AS course_city, co.state AS course_state,
                p.username AS created_by_username
         FROM crew_wars cw
         JOIN crews ch ON ch.id = cw.challenging_crew_id
         LEFT JOIN crews def ON def.id = cw.defending_crew_id
         LEFT JOIN courses co ON co.id = cw.course_id
         JOIN players p ON p.id = cw.created_by_player_id
         WHERE cw.status = 'pending'
           AND cw.challenge_type = 'target'
           AND cw.defending_crew_id = $1
           AND cw.created_at > NOW() - INTERVAL '48 hours'
         ORDER BY cw.created_at DESC`,
        [crewId]
      );
      res.json({ wars: r.rows });
    } catch (err) {
      console.error('GET /crew/wars/pending error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────
  // POST /api/crew/wars/:id/accept — target crew accepts (unchanged logic, updated for deferred start)
  // ─────────────────────────────────────────────────────
  router.post('/crew/wars/:id/accept', requireAuth(pool), async (req, res) => {
    const warId = parseInt(req.params.id);
    console.log(`[accept] war=${warId} player=${req.player.id}`);
    const client = await safeConnect(pool);
    try {
      await client.query('BEGIN');

      const warRes = await client.query(
        'SELECT * FROM crew_wars WHERE id = $1 FOR UPDATE',
        [warId]
      );
      if (!warRes.rows.length) {
        await client.query('ROLLBACK');
        console.log(`[accept] war=${warId} not found`);
        return res.status(404).json({ error: 'War not found' });
      }
      const war = warRes.rows[0];
      if (war.challenge_type !== 'target') {
        await client.query('ROLLBACK');
        console.log(`[accept] war=${warId} not target (${war.challenge_type})`);
        return res.status(400).json({ error: 'Use /join to join open challenges' });
      }
      if (war.status !== 'pending') {
        await client.query('ROLLBACK');
        console.log(`[accept] war=${warId} status=${war.status}, expected pending`);
        return res.status(400).json({ error: 'War is no longer pending' });
      }

      const membership = await getMembership(client, war.defending_crew_id, req.player.id);
      if (!isBossOrManager(membership)) {
        await client.query('ROLLBACK');
        console.log(`[accept] war=${warId} player=${req.player.id} not boss/manager of defending crew ${war.defending_crew_id}`);
        return res.status(403).json({ error: 'Only defending crew boss or manager can accept' });
      }

      // Determine when war should end: use duration_hours from creation
      let endsAt;
      if (war.scheduled_start_at) {
        const scheduled = new Date(war.scheduled_start_at);
        if (scheduled > new Date()) {
          endsAt = new Date(scheduled.getTime() + war.duration_hours * 3600 * 1000);
        } else {
          endsAt = new Date(Date.now() + war.duration_hours * 3600 * 1000);
        }
      } else {
        endsAt = new Date(Date.now() + war.duration_hours * 3600 * 1000);
      }

      await client.query(
        `UPDATE crew_wars SET status = 'active', started_at = NOW(), ends_at = $1 WHERE id = $2`,
        [endsAt, warId]
      );

      // Notify crews (fire-and-forget, use pool not client to avoid holding transaction)
      const courseRes = await client.query('SELECT name FROM courses WHERE id = $1', [war.course_id]);
      const courseName = courseRes.rows[0]?.name || 'the course';
      const defCrewRes = await client.query('SELECT name FROM crews WHERE id = $1', [war.defending_crew_id]);
      const defName = defCrewRes.rows[0]?.name || 'A crew';
      const chalCrewRes = await client.query('SELECT name FROM crews WHERE id = $1', [war.challenging_crew_id]);
      const chalName = chalCrewRes.rows[0]?.name || 'a crew';

      await client.query('COMMIT');
      console.log(`[accept] war=${warId} → active, ends_at=${endsAt.toISOString()}`);

      // Send notifications AFTER commit so transaction isn't held open during notifyCrew
      try {
        await notifyCrew(pool, war.challenging_crew_id,
          `⚔️ War Has Begun!`,
          `Your challenge at ${courseName} has been accepted by "${defName}"! Timer is running — get out there!`,
          'war_started', war.id);
      } catch (e) {
        console.error('notify challenger on accept failed:', e.message);
      }
      try {
        await notifyCrew(pool, war.defending_crew_id,
          `⚔️ War Has Begun!`,
          `You accepted the challenge from "${chalName}" at ${courseName}! Play now — timer is running!`,
          'war_started', war.id);
      } catch (e) {
        console.error('notify defender on accept failed:', e.message);
      }

      res.json({ success: true, ends_at: endsAt });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('POST /crew/wars/:id/accept error:', err.message);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  });

  // ─────────────────────────────────────────────────────
  // POST /api/crew/wars/:id/decline — target crew declines (refunds challenger)
  // ─────────────────────────────────────────────────────
  router.post('/crew/wars/:id/decline', requireAuth(pool), async (req, res) => {
    const warId = parseInt(req.params.id);
    const client = await safeConnect(pool);
    try {
      await client.query('BEGIN');

      const warRes = await client.query(
        'SELECT * FROM crew_wars WHERE id = $1 FOR UPDATE',
        [warId]
      );
      if (!warRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'War not found' });
      }
      const war = warRes.rows[0];
      if (war.challenge_type !== 'target') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Open challenges cannot be declined — just avoid joining' });
      }
      if (war.status !== 'pending') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'War is no longer pending' });
      }

      const membership = await getMembership(client, war.defending_crew_id, req.player.id);
      if (!isBossOrManager(membership)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Only defending crew boss or manager can decline' });
      }

      await client.query(
        `UPDATE crew_wars SET status = 'declined', resolved_at = NOW() WHERE id = $1`,
        [warId]
      );

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('POST /crew/wars/:id/decline error:', err.message);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  });

  // ─────────────────────────────────────────────────────
  // POST /api/crew/wars/:id/cancel — challenger cancels their own pending challenge
  // ─────────────────────────────────────────────────────
  router.post('/crew/wars/:id/cancel', requireAuth(pool), async (req, res) => {
    const warId = parseInt(req.params.id);
    const client = await safeConnect(pool);
    try {
      await client.query('BEGIN');

      const warRes = await client.query(
        'SELECT * FROM crew_wars WHERE id = $1 FOR UPDATE',
        [warId]
      );
      if (!warRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'War not found' });
      }
      const war = warRes.rows[0];
      if (war.status !== 'pending') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'War is no longer pending' });
      }

      const memberRes = await client.query(
        `SELECT cm.crew_id FROM crew_members cm
         JOIN crews c ON c.id = cm.crew_id AND c.disbanded_at IS NULL
         WHERE cm.player_id = $1 AND cm.role IN ('boss', 'manager')
         LIMIT 1`,
        [req.player.id]
      );
      if (!memberRes.rows.length || memberRes.rows[0].crew_id !== war.challenging_crew_id) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Only the challenging crew boss/manager can cancel' });
      }

      await client.query(
        `UPDATE crew_wars SET status = 'cancelled', resolved_at = NOW() WHERE id = $1`,
        [warId]
      );

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('POST /crew/wars/:id/cancel error:', err.message);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  });

  // ─────────────────────────────────────────────────────
  // GET /api/crew/wars/active — active wars for my crew
  // ─────────────────────────────────────────────────────
  router.get('/crew/wars/active', requireAuth(pool), async (req, res) => {
    try {
      const crewRes = await pool.query(
        `SELECT cm.crew_id FROM crew_members cm
         JOIN crews c ON c.id = cm.crew_id AND c.disbanded_at IS NULL
         WHERE cm.player_id = $1 LIMIT 1`,
        [req.player.id]
      );
      if (!crewRes.rows.length) return res.json({ wars: [] });
      const crewId = crewRes.rows[0].crew_id;

      const r = await pool.query(
        `SELECT cw.*,
                ch.name AS challenger_crew_name, ch.logo_url AS challenger_crew_logo_url,
                def.name AS defending_crew_name, def.logo_url AS defending_crew_logo_url,
                co.name AS course_name, co.city AS course_city, co.state AS course_state
         FROM crew_wars cw
         JOIN crews ch ON ch.id = cw.challenging_crew_id
         LEFT JOIN crews def ON def.id = cw.defending_crew_id
         LEFT JOIN courses co ON co.id = cw.course_id
         WHERE cw.status = 'active'
           AND (cw.challenging_crew_id = $1 OR cw.defending_crew_id = $1)
         ORDER BY cw.ends_at ASC`,
        [crewId]
      );

      const wars = await Promise.all(r.rows.map(async (war) => {
        const myScore = await getCrewWarScore(pool, war.id, crewId);
        const oppId = war.challenging_crew_id === crewId
          ? war.defending_crew_id : war.challenging_crew_id;
        const oppScore = await getCrewWarScore(pool, war.id, oppId);
        return {
          ...war,
          time_remaining: timeRemaining(war.ends_at),
          my_crew_id: crewId,
          my_combined_score: myScore.combined_score,
          my_player_count: myScore.player_count,
          opp_combined_score: oppScore.combined_score,
          opp_player_count: oppScore.player_count,
          leading: myScore.player_count === 0 && oppScore.player_count === 0 ? 'tied'
            : myScore.player_count === 0 ? 'opp'
            : oppScore.player_count === 0 ? 'me'
            : myScore.combined_score < oppScore.combined_score ? 'me'
            : myScore.combined_score > oppScore.combined_score ? 'opp' : 'tied',
        };
      }));

      res.json({ wars });
    } catch (err) {
      console.error('GET /crew/wars/active error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────
  // GET /api/crew/wars/history — past wars for my crew
  // ─────────────────────────────────────────────────────
  router.get('/crew/wars/history', requireAuth(pool), async (req, res) => {
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 10));
    const offset = Math.max(0, parseInt(req.query.offset) || 0);

    try {
      const crewRes = await pool.query(
        `SELECT cm.crew_id FROM crew_members cm
         JOIN crews c ON c.id = cm.crew_id AND c.disbanded_at IS NULL
         WHERE cm.player_id = $1 LIMIT 1`,
        [req.player.id]
      );
      if (!crewRes.rows.length) return res.json({ wars: [] });
      const crewId = crewRes.rows[0].crew_id;

      const r = await pool.query(
        `SELECT cw.*,
                ch.name AS challenger_crew_name, ch.logo_url AS challenger_crew_logo_url,
                def.name AS defending_crew_name, def.logo_url AS defending_crew_logo_url,
                wc.name AS winner_crew_name,
                co.name AS course_name, co.city AS course_city, co.state AS course_state
         FROM crew_wars cw
         JOIN crews ch ON ch.id = cw.challenging_crew_id
         LEFT JOIN crews def ON def.id = cw.defending_crew_id
         LEFT JOIN crews wc ON wc.id = cw.winner_crew_id
         LEFT JOIN courses co ON co.id = cw.course_id
         WHERE cw.status IN ('completed', 'declined', 'expired', 'cancelled')
           AND (cw.challenging_crew_id = $1 OR cw.defending_crew_id = $1)
         ORDER BY cw.resolved_at DESC NULLS LAST
         LIMIT $2 OFFSET $3`,
        [crewId, limit + 1, offset]
      );

      const hasMore = r.rows.length > limit;
      const wars_rows = hasMore ? r.rows.slice(0, limit) : r.rows;

      const wars = wars_rows.map(war => ({
        ...war,
        won: war.winner_crew_id === crewId,
        was_draw: war.status === 'completed' && war.winner_crew_id === null,
        my_crew_id: crewId,
      }));

      res.json({ wars, limit, offset });
    } catch (err) {
      console.error('GET /crew/wars/history error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────
  // GET /api/crew/wars/my-posted — my crew's pending challenges (target + open)
  // ─────────────────────────────────────────────────────
  router.get('/crew/wars/my-posted', requireAuth(pool), async (req, res) => {
    try {
      const crewRes = await pool.query(
        `SELECT cm.crew_id FROM crew_members cm
         JOIN crews c ON c.id = cm.crew_id AND c.disbanded_at IS NULL
         WHERE cm.player_id = $1 LIMIT 1`,
        [req.player.id]
      );
      if (!crewRes.rows.length) return res.json({ wars: [] });
      const crewId = crewRes.rows[0].crew_id;

      const r = await pool.query(
        `SELECT cw.*,
                ch.name AS challenger_crew_name, ch.logo_url AS challenger_crew_logo_url,
                def.name AS defending_crew_name, def.logo_url AS defending_crew_logo_url,
                co.name AS course_name, co.city AS course_city, co.state AS course_state
         FROM crew_wars cw
         JOIN crews ch ON ch.id = cw.challenging_crew_id
         LEFT JOIN crews def ON def.id = cw.defending_crew_id
         LEFT JOIN courses co ON co.id = cw.course_id
         WHERE cw.challenging_crew_id = $1 AND cw.status = 'pending'
         ORDER BY cw.created_at DESC`,
        [crewId]
      );
      res.json({ wars: r.rows });
    } catch (err) {
      console.error('GET /crew/wars/my-posted error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────
  // GET /api/crew/notifications — crew notifications for current player
  // ─────────────────────────────────────────────────────
  router.get('/crew/notifications', requireAuth(pool), async (req, res) => {
    try {
      const crewRes = await pool.query(
        `SELECT cm.crew_id FROM crew_members cm
         JOIN crews c ON c.id = cm.crew_id AND c.disbanded_at IS NULL
         WHERE cm.player_id = $1 LIMIT 1`,
        [req.player.id]
      );
      if (!crewRes.rows.length) return res.json({ notifications: [] });
      const crewId = crewRes.rows[0].crew_id;

      const r = await pool.query(
        `SELECT cn.*, cw.course_id, co.name AS course_name
         FROM crew_notifications cn
         LEFT JOIN crew_wars cw ON cw.id = cn.war_id
         LEFT JOIN courses co ON co.id = cw.course_id
         WHERE cn.crew_id = $1
         ORDER BY cn.created_at DESC
         LIMIT 20`,
        [crewId]
      );
      res.json({ notifications: r.rows });
    } catch (err) {
      console.error('GET /crew/notifications error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────
  // PATCH /api/crew/notifications/:id/read — mark notification as read
  // ─────────────────────────────────────────────────────
  router.patch('/crew/notifications/:id/read', requireAuth(pool), async (req, res) => {
    const notifId = parseInt(req.params.id);
    try {
      const crewRes = await pool.query(
        `SELECT cm.crew_id FROM crew_members cm
         JOIN crews c ON c.id = cm.crew_id AND c.disbanded_at IS NULL
         WHERE cm.player_id = $1 LIMIT 1`,
        [req.player.id]
      );
      if (!crewRes.rows.length) return res.status(403).json({ error: 'Not in a crew' });
      const crewId = crewRes.rows[0].crew_id;

      const r = await pool.query(
        'UPDATE crew_notifications SET read_at = NOW() WHERE id = $1 AND crew_id = $2 RETURNING id',
        [notifId, crewId]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Notification not found' });
      res.json({ success: true });
    } catch (err) {
      console.error('PATCH /crew/notifications/:id/read error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────
  // GET /api/crew/wars/:id — war details (must be after all named routes)
  // ─────────────────────────────────────────────────────
  router.get('/crew/wars/:id', requireAuth(pool), async (req, res) => {
    const warId = parseInt(req.params.id);
    try {
      const warRes = await pool.query(
        `SELECT cw.*,
                ch.name AS challenger_crew_name, ch.logo_url AS challenger_crew_logo_url,
                def.name AS defending_crew_name, def.logo_url AS defending_crew_logo_url,
                wc.name AS winner_crew_name,
                co.name AS course_name, co.city AS course_city, co.state AS course_state,
                p.username AS created_by_username
         FROM crew_wars cw
         JOIN crews ch ON ch.id = cw.challenging_crew_id
         LEFT JOIN crews def ON def.id = cw.defending_crew_id
         LEFT JOIN crews wc ON wc.id = cw.winner_crew_id
         LEFT JOIN courses co ON co.id = cw.course_id
         JOIN players p ON p.id = cw.created_by_player_id
         WHERE cw.id = $1`,
        [warId]
      );
      if (!warRes.rows.length) return res.status(404).json({ error: 'War not found' });
      const war = warRes.rows[0];

      const crewRes = await pool.query(
        `SELECT cm.crew_id FROM crew_members cm
         WHERE cm.player_id = $1
           AND cm.crew_id IN ($2, $3)
         LIMIT 1`,
        [req.player.id, war.challenging_crew_id || 0, war.defending_crew_id || 0]
      );
      if (!crewRes.rows.length) {
        return res.status(403).json({ error: 'Not in either crew' });
      }
      const myCrewId = crewRes.rows[0].crew_id;

      const playersRes = await pool.query(
        `SELECT cwp.player_id, cwp.crew_id, cwp.round_id, cwp.total_score,
                cwp.score_vs_par, cwp.submitted_at, pl.username
         FROM crew_war_players cwp
         JOIN players pl ON pl.id = cwp.player_id
         WHERE cwp.war_id = $1
         ORDER BY cwp.crew_id, cwp.score_vs_par ASC`,
        [warId]
      );

      const challengerScore = await getCrewWarScore(pool, warId, war.challenging_crew_id);
      const defenderScore = await getCrewWarScore(pool, warId, war.defending_crew_id);

      res.json({
        war: {
          ...war,
          time_remaining: timeRemaining(war.ends_at),
          my_crew_id: myCrewId,
        },
        challenger_score: challengerScore,
        defender_score: defenderScore,
        players: playersRes.rows,
      });
    } catch (err) {
      console.error('GET /crew/wars/:id error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
};

module.exports.syncWarProgress = syncWarProgress;
module.exports.resolveExpiredWars = resolveExpiredWars;