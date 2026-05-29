/**
 * Crews Route — Disc Golf Go
 * Owns: crew CRUD, membership, invites, browse, join-requests, kick, boss transfer,
 *       manager role (promote/demote), crew round history, crew group play sessions,
 *       captain analytics, crew vault (gold + item distribution)
 * Does NOT own: gold award logic (see vault.js), player auth (see middleware/auth.js),
 *               round hole scoring (see rounds.js), crew wars/rewards (see crew-wars.js)
 *
 * Roles: boss > manager > member
 *   boss: all permissions including disband, transfer-boss, promote/demote managers
 *   manager: invite, kick, accept requests, start wars, view analytics — NOT disband/transfer
 *   member: view crew, view roster, play rounds
 *
 * IMPORTANT: Literal routes (e.g. /crews/join, /crews/invite/:token, /crews)
 * are defined BEFORE wildcard routes (/crews/:id) to prevent Express from
 * capturing them with the :id parameter first.
 */

const express = require('express');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');
const { sanitizeFields } = require('../middleware/security');

const CREW_CREATION_COST = 500; // gold deducted from boss on crew creation

const routerFactory = ({ pool }) => {
  const router = express.Router();

  // ─────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────

  // Returns the member row if player is in crew, null otherwise
  async function getMembership(crewId, playerId) {
    const r = await pool.query(
      'SELECT id, role FROM crew_members WHERE crew_id = $1 AND player_id = $2',
      [crewId, playerId]
    );
    return r.rows[0] || null;
  }

  // True if the member has boss or manager privileges
  function isBossOrManager(membership) {
    return membership && ['boss', 'manager'].includes(membership.role);
  }

  // ─────────────────────────────────────────────────────
  // GET /api/crews — browse all active crews (with optional search)
  // Query: ?search=<text>   (matches name or home course name)
  // NOTE: Must be defined before /crews/:id to avoid route conflict
  // ─────────────────────────────────────────────────────
  router.get('/crews', requireAuth(pool), async (req, res) => {
    const { search } = req.query;
    try {
      const r = await pool.query(
        `SELECT c.id, c.name, c.logo_url, c.created_at,
                co.name AS home_course_name,
                p.username AS boss_name,
                COUNT(cm.id)::int AS member_count
         FROM crews c
         JOIN players p ON p.id = c.boss_id
         LEFT JOIN courses co ON co.id = c.home_course_id
         LEFT JOIN crew_members cm ON cm.crew_id = c.id
         WHERE c.disbanded_at IS NULL
           AND ($1::text IS NULL OR c.name ILIKE '%' || $1 || '%'
                OR co.name ILIKE '%' || $1 || '%')
         GROUP BY c.id, co.name, p.username
         ORDER BY COUNT(cm.id) DESC, c.created_at DESC
         LIMIT 50`,
        [search || null]
      );
      res.json({ crews: r.rows });
    } catch (err) {
      console.error('GET /crews error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────
  // POST /api/crews — create a new crew (costs 500 gold)
  // ─────────────────────────────────────────────────────
  router.post('/crews', requireAuth(pool), sanitizeFields('name', 'description'), async (req, res) => {
    const { name, home_course_id, logo_url } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock player row and check gold balance
      const playerRes = await client.query(
        'SELECT id, gold FROM players WHERE id = $1 FOR UPDATE',
        [req.player.id]
      );
      if (!playerRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Player not found' });
      }
      const { gold } = playerRes.rows[0];
      if (gold < CREW_CREATION_COST) {
        await client.query('ROLLBACK');
        return res.status(402).json({
          error: 'Not enough gold',
          gold,
          cost: CREW_CREATION_COST,
          shortfall: CREW_CREATION_COST - gold,
        });
      }

      // Deduct gold + record transaction (mirrors vault.js buy pattern)
      await client.query(
        'UPDATE players SET gold = gold - $1 WHERE id = $2',
        [CREW_CREATION_COST, req.player.id]
      );
      await client.query(
        `INSERT INTO gold_transactions (player_id, amount, event_type, metadata)
         VALUES ($1, $2, 'crew_creation', $3)`,
        [req.player.id, -CREW_CREATION_COST, JSON.stringify({ action: 'create_crew', name })]
      );

      // Create crew
      const crewRes = await client.query(
        `INSERT INTO crews (name, boss_id, home_course_id, logo_url)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [name.trim(), req.player.id, home_course_id || null, logo_url || null]
      );
      const crew = crewRes.rows[0];

      // Add boss as first member
      await client.query(
        `INSERT INTO crew_members (crew_id, player_id, role) VALUES ($1, $2, 'boss')`,
        [crew.id, req.player.id]
      );

      // Initialize crew treasury
      await client.query(
        'INSERT INTO crew_gold (crew_id, gold) VALUES ($1, 0)',
        [crew.id]
      );

      await client.query('COMMIT');

      res.status(201).json({ crew: { ...crew, member_count: 1 } });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Crew name already taken' });
      }
      console.error('POST /crews error:', err.message);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  });

  // ─────────────────────────────────────────────────────
  // POST /api/crews/join — accept an invite token
  // Body: { token }
  // NOTE: Must be defined before /crews/:id/* to avoid route conflict
  // ─────────────────────────────────────────────────────
  router.post('/crews/join', requireAuth(pool), async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token is required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Validate token
      const inviteRes = await client.query(
        `SELECT ci.id, ci.crew_id, ci.accepted_at, ci.expires_at
         FROM crew_invites ci
         JOIN crews c ON c.id = ci.crew_id
         WHERE ci.token = $1 AND c.disbanded_at IS NULL`,
        [token]
      );
      if (!inviteRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Invite not found' });
      }
      const invite = inviteRes.rows[0];

      if (invite.accepted_at) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Invite already used' });
      }
      if (new Date(invite.expires_at) < new Date()) {
        await client.query('ROLLBACK');
        return res.status(410).json({ error: 'Invite expired' });
      }

      // Reject if already a member
      const existing = await client.query(
        'SELECT id FROM crew_members WHERE crew_id = $1 AND player_id = $2',
        [invite.crew_id, req.player.id]
      );
      if (existing.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Already a member of this crew' });
      }

      // Add member
      await client.query(
        `INSERT INTO crew_members (crew_id, player_id, role) VALUES ($1, $2, 'member')`,
        [invite.crew_id, req.player.id]
      );

      // Mark invite accepted
      await client.query(
        'UPDATE crew_invites SET accepted_at = NOW() WHERE id = $1',
        [invite.id]
      );

      await client.query('COMMIT');
      res.json({ success: true, crew_id: invite.crew_id });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('POST /crews/join error:', err.message);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  });

  // ─────────────────────────────────────────────────────
  // GET /api/crews/invite/:token — look up invite (for join page)
  // NOTE: Must be defined before /crews/:id to avoid route conflict
  // ─────────────────────────────────────────────────────
  router.get('/crews/invite/:token', async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT ci.token, ci.expires_at, ci.accepted_at,
                c.id AS crew_id, c.name AS crew_name, c.logo_url AS crew_logo_url,
                co.name AS home_course_name,
                COUNT(cm.id)::int AS member_count
         FROM crew_invites ci
         JOIN crews c ON c.id = ci.crew_id AND c.disbanded_at IS NULL
         LEFT JOIN courses co ON co.id = c.home_course_id
         LEFT JOIN crew_members cm ON cm.crew_id = c.id
         WHERE ci.token = $1
         GROUP BY ci.token, ci.expires_at, ci.accepted_at, c.id, c.name, c.logo_url, co.name`,
        [req.params.token]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Invite not found' });
      const invite = r.rows[0];
      if (invite.accepted_at) return res.status(409).json({ error: 'Invite already used' });
      if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'Invite expired' });
      res.json({ invite });
    } catch (err) {
      console.error('GET /crews/invite/:token error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────
  // GET /api/players/:id/crew — player's current crew
  // NOTE: Must be defined before /crews/:id to avoid any ambiguity
  // ─────────────────────────────────────────────────────
  router.get('/players/:id/crew', requireAuth(pool), async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT c.id, c.name, c.logo_url, c.created_at, cm.role, cm.joined_at,
                co.name AS home_course_name,
                boss.username AS boss_name,
                cg.gold AS crew_gold,
                COUNT(all_cm.id)::int AS member_count
         FROM crew_members cm
         JOIN crews c ON c.id = cm.crew_id AND c.disbanded_at IS NULL
         LEFT JOIN courses co ON co.id = c.home_course_id
         JOIN players boss ON boss.id = c.boss_id
         LEFT JOIN crew_gold cg ON cg.crew_id = c.id
         LEFT JOIN crew_members all_cm ON all_cm.crew_id = c.id
         WHERE cm.player_id = $1
         GROUP BY c.id, co.name, boss.username, cg.gold, cm.role, cm.joined_at, c.logo_url`,
        [req.params.id]
      );
      if (!r.rows.length) return res.json({ crew: null });
      res.json({ crew: r.rows[0] });
    } catch (err) {
      console.error('GET /players/:id/crew error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────
  // GET /api/crews/:id — crew profile
  // ─────────────────────────────────────────────────────
  router.get('/crews/:id', requireAuth(pool), async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT c.id, c.name, c.logo_url, c.created_at, c.disbanded_at,
                co.name AS home_course_name,
                p.username AS boss_name,
                cg.gold AS crew_gold,
                COUNT(cm.id)::int AS member_count
         FROM crews c
         LEFT JOIN courses co ON co.id = c.home_course_id
         JOIN players p ON p.id = c.boss_id
         LEFT JOIN crew_gold cg ON cg.crew_id = c.id
         LEFT JOIN crew_members cm ON cm.crew_id = c.id
         WHERE c.id = $1
         GROUP BY c.id, co.name, p.username, cg.gold`,
        [req.params.id]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Crew not found' });
      res.json({ crew: r.rows[0] });
    } catch (err) {
      console.error('GET /crews/:id error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────
  // PATCH /api/crews/:id/logo — boss/manager updates crew logo
  // Body: { logo_url: string | null }
  // ─────────────────────────────────────────────────────
  router.patch('/crews/:id/logo', requireAuth(pool), async (req, res) => {
    try {
      const membership = await getMembership(req.params.id, req.player.id);
      if (!membership) return res.status(403).json({ error: 'Not a crew member' });
      if (!['boss', 'manager'].includes(membership.role)) {
        return res.status(403).json({ error: 'Only boss or manager can update logo' });
      }

      const { logo_url } = req.body;
      if (logo_url !== null && typeof logo_url !== 'string') {
        return res.status(400).json({ error: 'logo_url must be a string or null' });
      }
      if (logo_url && !/^https?:\/\/.+/.test(logo_url)) {
        return res.status(400).json({ error: 'logo_url must be a valid HTTP(S) URL' });
      }

      await pool.query(
        'UPDATE crews SET logo_url = $1 WHERE id = $2',
        [logo_url || null, req.params.id]
      );
      res.json({ success: true, logo_url: logo_url || null });
    } catch (err) {
      console.error('PATCH /crews/:id/logo error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────
  // GET /api/crews/:id/members — roster, member-gated
  // ─────────────────────────────────────────────────────
  router.get('/crews/:id/members', requireAuth(pool), async (req, res) => {
    try {
      const membership = await getMembership(req.params.id, req.player.id);
      if (!membership) return res.status(403).json({ error: 'Not a crew member' });

      const r = await pool.query(
        `SELECT cm.id, cm.role, cm.joined_at,
                p.id AS player_id, p.username, p.level, p.xp
         FROM crew_members cm
         JOIN players p ON p.id = cm.player_id
         WHERE cm.crew_id = $1
         ORDER BY p.level DESC, p.xp DESC`,
        [req.params.id]
      );
      res.json({ members: r.rows });
    } catch (err) {
      console.error('GET /crews/:id/members error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────
  // GET /api/crews/:id/join-requests — pending join requests (boss/captain)
  // ─────────────────────────────────────────────────────
  router.get('/crews/:id/join-requests', requireAuth(pool), async (req, res) => {
    try {
      const membership = await getMembership(req.params.id, req.player.id);
      if (!membership) return res.status(403).json({ error: 'Not a crew member' });
      if (!isBossOrManager(membership)) {
        return res.status(403).json({ error: 'Only boss or manager can view requests' });
      }

      // Join requests are stored as crew_invites with token starting 'req_'
      const r = await pool.query(
        `SELECT ci.token AS request_id, ci.created_at,
                p.id AS player_id, p.username, p.level, p.xp
         FROM crew_invites ci
         JOIN players p ON p.id = ci.created_by
         WHERE ci.crew_id = $1
           AND ci.token LIKE 'req_%'
           AND ci.accepted_at IS NULL
           AND ci.expires_at > NOW()
         ORDER BY ci.created_at ASC`,
        [req.params.id]
      );
      res.json({ requests: r.rows });
    } catch (err) {
      console.error('GET /crews/:id/join-requests error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────
  // GET /api/crews/:id/rounds — completed rounds at home course (all members see)
  // Returns both solo rounds and crew group rounds for crew members
  // ─────────────────────────────────────────────────────
  router.get('/crews/:id/rounds', requireAuth(pool), async (req, res) => {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = Math.max(0, parseInt(req.query.offset) || 0);

    try {
      const membership = await getMembership(req.params.id, req.player.id);
      if (!membership) return res.status(403).json({ error: 'Not a crew member' });

      const crewRes = await pool.query(
        'SELECT home_course_id FROM crews WHERE id = $1 AND disbanded_at IS NULL',
        [req.params.id]
      );
      if (!crewRes.rows.length) return res.status(404).json({ error: 'Crew not found' });
      const { home_course_id } = crewRes.rows[0];

      const r = await pool.query(
        `SELECT r.id AS round_id, r.course_id, r.player_id, p.username AS player_name,
                (r.total_score - r.total_par) AS score_vs_par, r.total_score, r.total_par,
                r.holes_count, r.completed_at AS date, r.is_group, r.crew_round_id,
                co.name AS course_name, co.city, co.state
         FROM rounds r
         JOIN players p ON p.id = r.player_id
         JOIN crew_members cm ON cm.player_id = r.player_id AND cm.crew_id = $1
         LEFT JOIN courses co ON co.id = r.course_id
         WHERE r.status = 'completed'
           AND ($2::integer IS NULL OR r.course_id = $2)
         ORDER BY r.completed_at DESC
         LIMIT $3 OFFSET $4`,
        [req.params.id, home_course_id, limit + 1, offset]
      );

      const hasMore = r.rows.length > limit;
      const rounds_rows = hasMore ? r.rows.slice(0, limit) : r.rows;

      res.json({ rounds: rounds_rows, limit, offset });
    } catch (err) {
      console.error('GET /crews/:id/rounds error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────
  // GET /api/crews/:id/analytics — captain analytics dashboard
  // Boss-only: per-member stats at home course
  // ─────────────────────────────────────────────────────
  router.get('/crews/:id/analytics', requireAuth(pool), async (req, res) => {
    try {
      const membership = await getMembership(req.params.id, req.player.id);
      if (!membership) return res.status(403).json({ error: 'Not a crew member' });
      if (!isBossOrManager(membership)) {
        return res.status(403).json({ error: 'Only boss or manager can view analytics' });
      }

      const crewRes = await pool.query(
        'SELECT id, name, home_course_id FROM crews WHERE id = $1 AND disbanded_at IS NULL',
        [req.params.id]
      );
      if (!crewRes.rows.length) return res.status(404).json({ error: 'Crew not found' });
      const { home_course_id } = crewRes.rows[0];

      // Per-member stats at home course
      const memberStats = await pool.query(
        `SELECT p.id AS player_id, p.username, p.level, p.xp, cm.role, cm.joined_at,
                COUNT(r.id)::int AS rounds_at_home,
                ROUND(AVG(r.total_score - r.total_par), 1)::float AS avg_score_vs_par,
                MIN(r.total_score - r.total_par)::int AS best_score_vs_par,
                MAX(r.completed_at) AS last_active
         FROM crew_members cm
         JOIN players p ON p.id = cm.player_id
         LEFT JOIN rounds r ON r.player_id = cm.player_id
           AND r.status = 'completed'
           AND ($2::integer IS NULL OR r.course_id = $2)
         WHERE cm.crew_id = $1
         GROUP BY p.id, p.username, p.level, p.xp, cm.role, cm.joined_at
         ORDER BY rounds_at_home DESC, p.level DESC`,
        [req.params.id, home_course_id]
      );

      // Crew-wide summary
      const summary = await pool.query(
        `SELECT COUNT(DISTINCT r.id)::int AS total_rounds,
                COUNT(DISTINCT r.player_id)::int AS active_players,
                MIN(r.total_score - r.total_par)::int AS crew_best_score_vs_par,
                ROUND(AVG(r.total_score - r.total_par), 1)::float AS crew_avg_score_vs_par,
                COUNT(DISTINCT cr.id)::int AS group_rounds_played
         FROM crew_members cm
         LEFT JOIN rounds r ON r.player_id = cm.player_id
           AND r.status = 'completed'
           AND ($2::integer IS NULL OR r.course_id = $2)
         LEFT JOIN crew_rounds cr ON cr.crew_id = $1
         WHERE cm.crew_id = $1`,
        [req.params.id, home_course_id]
      );

      res.json({
        member_stats: memberStats.rows,
        summary: summary.rows[0],
        home_course_id,
      });
    } catch (err) {
      console.error('GET /crews/:id/analytics error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────
  // GET /api/crews/:id/players/:playerId/stats — member stats for captain
  // Boss-only: detailed round history for a specific member
  // ─────────────────────────────────────────────────────
  router.get('/crews/:id/players/:playerId/stats', requireAuth(pool), async (req, res) => {
    try {
      const membership = await getMembership(req.params.id, req.player.id);
      if (!membership) return res.status(403).json({ error: 'Not a crew member' });
      if (!isBossOrManager(membership)) {
        return res.status(403).json({ error: 'Only boss or manager can view member stats' });
      }

      // Confirm target player is in this crew
      const targetMember = await getMembership(req.params.id, parseInt(req.params.playerId));
      if (!targetMember) return res.status(404).json({ error: 'Player is not in this crew' });

      const crewRes = await pool.query(
        'SELECT home_course_id FROM crews WHERE id = $1 AND disbanded_at IS NULL',
        [req.params.id]
      );
      const { home_course_id } = crewRes.rows[0] || {};

      // Aggregate stats
      const stats = await pool.query(
        `SELECT COUNT(r.id)::int AS total_rounds,
                ROUND(AVG(r.total_score - r.total_par), 1)::float AS avg_score_vs_par,
                MIN(r.total_score - r.total_par)::int AS best_score_vs_par,
                MAX(r.completed_at) AS last_played,
                COUNT(DISTINCT r.course_id)::int AS courses_played
         FROM rounds r
         WHERE r.player_id = $1 AND r.status = 'completed'
           AND ($2::integer IS NULL OR r.course_id = $2)`,
        [req.params.playerId, home_course_id]
      );

      // Last 10 rounds
      const recentRounds = await pool.query(
        `SELECT r.id, r.total_score, r.total_par,
                (r.total_score - r.total_par) AS score_vs_par,
                r.holes_count, r.completed_at, r.is_group,
                co.name AS course_name
         FROM rounds r LEFT JOIN courses co ON co.id = r.course_id
         WHERE r.player_id = $1 AND r.status = 'completed'
           AND ($2::integer IS NULL OR r.course_id = $2)
         ORDER BY r.completed_at DESC LIMIT 10`,
        [req.params.playerId, home_course_id]
      );

      // Player info
      const playerInfo = await pool.query(
        `SELECT p.id, p.username, p.level, p.xp FROM players p WHERE p.id = $1`,
        [req.params.playerId]
      );

      res.json({
        player: playerInfo.rows[0] || null,
        stats: stats.rows[0],
        recent_rounds: recentRounds.rows,
      });
    } catch (err) {
      console.error('GET /crews/:id/players/:playerId/stats error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────
  // POST /api/crews/:id/start-round — start a crew group round
  // Any crew member can start; attaches crew context to the round
  // Body: { round_id } — the host's already-started round_id to tag as a crew round
  // ─────────────────────────────────────────────────────
  router.post('/crews/:id/start-round', requireAuth(pool), async (req, res) => {
    const { round_id } = req.body;
    if (!round_id) return res.status(400).json({ error: 'round_id required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Must be a crew member
      const membership = await getMembership(req.params.id, req.player.id);
      if (!membership) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Not a crew member' });
      }

      // Confirm crew exists
      const crewRes = await client.query(
        'SELECT id, home_course_id FROM crews WHERE id = $1 AND disbanded_at IS NULL',
        [req.params.id]
      );
      if (!crewRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Crew not found' });
      }

      // Confirm round belongs to the requesting player and is in_progress
      const roundRes = await client.query(
        `SELECT id, course_id FROM rounds WHERE id = $1 AND player_id = $2 AND status = 'in_progress'`,
        [round_id, req.player.id]
      );
      if (!roundRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Active round not found or not yours' });
      }
      const round = roundRes.rows[0];

      // Create crew_rounds session
      const crewRoundRes = await client.query(
        `INSERT INTO crew_rounds (crew_id, course_id, host_round_id)
         VALUES ($1, $2, $3) RETURNING id`,
        [req.params.id, round.course_id, round_id]
      );
      const crewRoundId = crewRoundRes.rows[0].id;

      // Tag the round as group + link to crew session
      await client.query(
        `UPDATE rounds SET is_group = TRUE, crew_round_id = $1 WHERE id = $2`,
        [crewRoundId, round_id]
      );

      // Add host to crew_round_players
      await client.query(
        `INSERT INTO crew_round_players (crew_round_id, player_id, round_id, is_host)
         VALUES ($1, $2, $3, TRUE) ON CONFLICT DO NOTHING`,
        [crewRoundId, req.player.id, round_id]
      );

      await client.query('COMMIT');
      res.status(201).json({ crew_round_id: crewRoundId });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('POST /crews/:id/start-round error:', err.message);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  });

  // ─────────────────────────────────────────────────────
  // POST /api/crews/:id/invite — generate invite (boss or captain)
  // ─────────────────────────────────────────────────────
  router.post('/crews/:id/invite', requireAuth(pool), async (req, res) => {
    try {
      const membership = await getMembership(req.params.id, req.player.id);
      if (!membership) return res.status(403).json({ error: 'Not a crew member' });
      if (!isBossOrManager(membership)) {
        return res.status(403).json({ error: 'Only boss or manager can invite' });
      }

      // Confirm crew exists and is active
      const crewRes = await pool.query(
        'SELECT id FROM crews WHERE id = $1 AND disbanded_at IS NULL',
        [req.params.id]
      );
      if (!crewRes.rows.length) return res.status(404).json({ error: 'Crew not found or disbanded' });

      const token = crypto.randomUUID().replace(/-/g, '');
      await pool.query(
        `INSERT INTO crew_invites (crew_id, token, created_by)
         VALUES ($1, $2, $3)`,
        [req.params.id, token, req.player.id]
      );

      res.status(201).json({ invite_url: `/crew/join?token=${token}` });
    } catch (err) {
      console.error('POST /crews/:id/invite error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────
  // POST /api/crews/:id/join-request — request to join (no invite)
  // ─────────────────────────────────────────────────────
  router.post('/crews/:id/join-request', requireAuth(pool), async (req, res) => {
    try {
      // Confirm crew exists
      const crewRes = await pool.query(
        'SELECT id FROM crews WHERE id = $1 AND disbanded_at IS NULL',
        [req.params.id]
      );
      if (!crewRes.rows.length) return res.status(404).json({ error: 'Crew not found' });

      // Reject if already a member
      const existing = await pool.query(
        'SELECT id FROM crew_members WHERE crew_id = $1 AND player_id = $2',
        [req.params.id, req.player.id]
      );
      if (existing.rows.length) return res.status(409).json({ error: 'Already a member of this crew' });

      // Store as join request token (req_ prefix distinguishes from standard invites)
      const token = 'req_' + crypto.randomUUID().replace(/-/g, '');
      await pool.query(
        `INSERT INTO crew_invites (crew_id, token, created_by, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '30 days')`,
        [req.params.id, token, req.player.id]
      );
      res.status(201).json({ success: true, request_id: token });
    } catch (err) {
      console.error('POST /crews/:id/join-request error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────
  // PUT /api/crews/:id/join-request/:requestId — approve or decline
  // Body: { action: 'approve' | 'decline' }
  // ─────────────────────────────────────────────────────
  router.put('/crews/:id/join-request/:requestId', requireAuth(pool), async (req, res) => {
    const { action } = req.body;
    if (!['approve', 'decline'].includes(action)) {
      return res.status(400).json({ error: 'action must be approve or decline' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const membership = await getMembership(req.params.id, req.player.id);
      if (!membership || !isBossOrManager(membership)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Only boss or manager can manage requests' });
      }

      // Fetch the request
      const reqRes = await client.query(
        `SELECT ci.id, ci.crew_id, ci.created_by AS player_id
         FROM crew_invites ci
         WHERE ci.token = $1 AND ci.crew_id = $2 AND ci.accepted_at IS NULL AND ci.expires_at > NOW()`,
        [req.params.requestId, req.params.id]
      );
      if (!reqRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Request not found or already handled' });
      }
      const joinReq = reqRes.rows[0];

      if (action === 'approve') {
        // Add as member
        await client.query(
          `INSERT INTO crew_members (crew_id, player_id, role) VALUES ($1, $2, 'member')
           ON CONFLICT DO NOTHING`,
          [req.params.id, joinReq.player_id]
        );
        // Mark request used
        await client.query(
          'UPDATE crew_invites SET accepted_at = NOW() WHERE id = $1',
          [joinReq.id]
        );
      } else {
        // Decline: expire the request token immediately
        await client.query(
          'UPDATE crew_invites SET expires_at = NOW() WHERE id = $1',
          [joinReq.id]
        );
      }

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('PUT /crews/:id/join-request/:requestId error:', err.message);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  });

  // ─────────────────────────────────────────────────────
  // POST /api/crews/:id/kick/:playerId — boss or manager kicks a member
  // Managers cannot kick the boss or other managers
  // ─────────────────────────────────────────────────────
  router.post('/crews/:id/kick/:playerId', requireAuth(pool), async (req, res) => {
    try {
      const membership = await getMembership(req.params.id, req.player.id);
      if (!membership || !isBossOrManager(membership)) {
        return res.status(403).json({ error: 'Only boss or manager can kick members' });
      }
      if (parseInt(req.params.playerId) === req.player.id) {
        return res.status(400).json({ error: 'Cannot kick yourself' });
      }

      // Managers cannot kick boss or other managers
      const targetMembership = await getMembership(req.params.id, parseInt(req.params.playerId));
      if (targetMembership && membership.role === 'manager' &&
          ['boss', 'manager'].includes(targetMembership.role)) {
        return res.status(403).json({ error: 'Managers cannot kick the boss or other managers' });
      }

      const r = await pool.query(
        'DELETE FROM crew_members WHERE crew_id = $1 AND player_id = $2 RETURNING id',
        [req.params.id, req.params.playerId]
      );
      if (!r.rowCount) return res.status(404).json({ error: 'Player not in crew' });
      res.json({ success: true });
    } catch (err) {
      console.error('POST /crews/:id/kick/:playerId error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────
  // PATCH /api/crews/:id/transfer-boss — transfer boss role
  // Body: { new_boss_player_id }
  // ─────────────────────────────────────────────────────
  router.patch('/crews/:id/transfer-boss', requireAuth(pool), async (req, res) => {
    const { new_boss_player_id } = req.body;
    if (!new_boss_player_id) return res.status(400).json({ error: 'new_boss_player_id required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const membership = await getMembership(req.params.id, req.player.id);
      if (!membership || membership.role !== 'boss') {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Only the boss can transfer the boss role' });
      }

      // Confirm new boss is a member
      const newBossRes = await client.query(
        'SELECT id FROM crew_members WHERE crew_id = $1 AND player_id = $2',
        [req.params.id, new_boss_player_id]
      );
      if (!newBossRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'New boss must be a crew member' });
      }

      // Demote current boss, promote new boss
      await client.query(
        `UPDATE crew_members SET role = 'member' WHERE crew_id = $1 AND player_id = $2`,
        [req.params.id, req.player.id]
      );
      await client.query(
        `UPDATE crew_members SET role = 'boss' WHERE crew_id = $1 AND player_id = $2`,
        [req.params.id, new_boss_player_id]
      );
      // Update crews.boss_id to match
      await client.query(
        'UPDATE crews SET boss_id = $1 WHERE id = $2',
        [new_boss_player_id, req.params.id]
      );

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('PATCH /crews/:id/transfer-boss error:', err.message);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  });

  // ─────────────────────────────────────────────────────
  // DELETE /api/crews/:id/leave — leave a crew
  // Boss must transfer first
  // ─────────────────────────────────────────────────────
  router.delete('/crews/:id/leave', requireAuth(pool), async (req, res) => {
    try {
      const membership = await getMembership(req.params.id, req.player.id);
      if (!membership) return res.status(403).json({ error: 'Not a crew member' });
      if (membership.role === 'boss') {
        return res.status(400).json({ error: 'Boss must transfer role before leaving' });
      }

      await pool.query(
        'DELETE FROM crew_members WHERE crew_id = $1 AND player_id = $2',
        [req.params.id, req.player.id]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('DELETE /crews/:id/leave error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────
  // DELETE /api/crews/:id — disband crew (boss only)
  // Soft-delete via disbanded_at; removes all members
  // ─────────────────────────────────────────────────────
  router.delete('/crews/:id', requireAuth(pool), async (req, res) => {
    try {
      const membership = await getMembership(req.params.id, req.player.id);
      if (!membership) return res.status(403).json({ error: 'Not a crew member' });
      if (membership.role !== 'boss') {
        return res.status(403).json({ error: 'Only the boss can disband' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'UPDATE crews SET disbanded_at = NOW() WHERE id = $1',
          [req.params.id]
        );
        await client.query(
          'DELETE FROM crew_members WHERE crew_id = $1',
          [req.params.id]
        );
        await client.query('COMMIT');
        res.json({ success: true });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('DELETE /crews/:id error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────
  // PATCH /api/crews/:id/members/:playerId/role — promote to manager or demote to member
  // Boss-only. Body: { role: 'manager' | 'member' }
  // ─────────────────────────────────────────────────────
  router.patch('/crews/:id/members/:playerId/role', requireAuth(pool), async (req, res) => {
    const { role } = req.body;
    if (!['manager', 'member'].includes(role)) {
      return res.status(400).json({ error: 'role must be manager or member' });
    }

    try {
      const membership = await getMembership(req.params.id, req.player.id);
      if (!membership || membership.role !== 'boss') {
        return res.status(403).json({ error: 'Only the boss can promote or demote members' });
      }

      const targetId = parseInt(req.params.playerId);
      if (targetId === req.player.id) {
        return res.status(400).json({ error: 'Cannot change your own role' });
      }

      const target = await getMembership(req.params.id, targetId);
      if (!target) return res.status(404).json({ error: 'Player not in crew' });
      if (target.role === 'boss') {
        return res.status(400).json({ error: 'Cannot change the boss role — use transfer-boss' });
      }

      await pool.query(
        'UPDATE crew_members SET role = $1 WHERE crew_id = $2 AND player_id = $3',
        [role, req.params.id, targetId]
      );
      res.json({ success: true, player_id: targetId, role });
    } catch (err) {
      console.error('PATCH /crews/:id/members/:playerId/role error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────
  // GET /api/crew-rounds/:crewRoundId — get crew round session details
  // Returns all players in the group and their round_ids
  // ─────────────────────────────────────────────────────
  router.get('/crew-rounds/:crewRoundId', requireAuth(pool), async (req, res) => {
    try {
      // Verify the requesting player is a member of this crew session
      const sessionCheck = await pool.query(
        `SELECT crp.player_id FROM crew_round_players crp
         WHERE crp.crew_round_id = $1 AND crp.player_id = $2`,
        [req.params.crewRoundId, req.player.id]
      );
      if (!sessionCheck.rows.length) {
        return res.status(403).json({ error: 'Not in this crew round' });
      }

      const sessionRes = await pool.query(
        `SELECT cr.id, cr.crew_id, cr.course_id, cr.host_round_id, cr.created_at, cr.completed_at,
                c.name AS crew_name, co.name AS course_name
         FROM crew_rounds cr
         JOIN crews c ON c.id = cr.crew_id
         LEFT JOIN courses co ON co.id = cr.course_id
         WHERE cr.id = $1`,
        [req.params.crewRoundId]
      );
      if (!sessionRes.rows.length) return res.status(404).json({ error: 'Crew round not found' });

      const playersRes = await pool.query(
        `SELECT crp.player_id, crp.round_id, crp.is_host, crp.joined_at,
                p.username, p.level, p.xp,
                r.status AS round_status,
                r.total_score, r.total_par
         FROM crew_round_players crp
         JOIN players p ON p.id = crp.player_id
         LEFT JOIN rounds r ON r.id = crp.round_id
         WHERE crp.crew_round_id = $1
         ORDER BY crp.is_host DESC, crp.joined_at ASC`,
        [req.params.crewRoundId]
      );

      res.json({
        session: sessionRes.rows[0],
        players: playersRes.rows,
      });
    } catch (err) {
      console.error('GET /crew-rounds/:crewRoundId error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────
  // POST /api/crew-rounds/:crewRoundId/join — crew member joins existing crew round
  // Requires: own active in_progress round at the same course
  // Body: { round_id }
  // ─────────────────────────────────────────────────────
  router.post('/crew-rounds/:crewRoundId/join', requireAuth(pool), async (req, res) => {
    const { round_id } = req.body;
    if (!round_id) return res.status(400).json({ error: 'round_id required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get crew round session
      const sessionRes = await client.query(
        `SELECT cr.id, cr.crew_id, cr.course_id, cr.completed_at
         FROM crew_rounds cr WHERE cr.id = $1`,
        [req.params.crewRoundId]
      );
      if (!sessionRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Crew round not found' });
      }
      const session = sessionRes.rows[0];
      if (session.completed_at) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Crew round already completed' });
      }

      // Must be a crew member
      const membership = await getMembership(session.crew_id, req.player.id);
      if (!membership) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Not a crew member' });
      }

      // Confirm round belongs to player and is in_progress at same course
      const roundRes = await client.query(
        `SELECT id, course_id FROM rounds
         WHERE id = $1 AND player_id = $2 AND status = 'in_progress'`,
        [round_id, req.player.id]
      );
      if (!roundRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Active round not found or not yours' });
      }
      if (roundRes.rows[0].course_id !== session.course_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Round must be at the same course as the crew session' });
      }

      // Tag round as group + link to crew session
      await client.query(
        `UPDATE rounds SET is_group = TRUE, crew_round_id = $1 WHERE id = $2`,
        [session.id, round_id]
      );

      // Add to crew_round_players
      await client.query(
        `INSERT INTO crew_round_players (crew_round_id, player_id, round_id, is_host)
         VALUES ($1, $2, $3, FALSE)
         ON CONFLICT (crew_round_id, player_id) DO UPDATE SET round_id = EXCLUDED.round_id`,
        [session.id, req.player.id, round_id]
      );

      await client.query('COMMIT');
      res.json({ success: true, crew_round_id: session.id });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('POST /crew-rounds/:crewRoundId/join error:', err.message);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  });

  // ─────────────────────────────────────────────────────
  // GET /api/crews/:id/vault — crew gold balance + item inventory (boss/manager only)
  // ─────────────────────────────────────────────────────
  router.get('/crews/:id/vault', requireAuth(pool), async (req, res) => {
    try {
      const membership = await getMembership(req.params.id, req.player.id);
      if (!membership) return res.status(403).json({ error: 'Not a crew member' });
      if (!isBossOrManager(membership)) {
        return res.status(403).json({ error: 'Only boss or manager can view vault' });
      }

      const goldRes = await pool.query(
        'SELECT gold FROM crew_gold WHERE crew_id = $1',
        [req.params.id]
      );

      const itemsRes = await pool.query(
        `SELECT ci.id, ci.item_type, ci.item_name, ci.awarded_at, ci.assigned_at,
                ci.war_id, p.username AS assigned_to_username, ci.assigned_to
         FROM crew_items ci
         LEFT JOIN players p ON p.id = ci.assigned_to
         WHERE ci.crew_id = $1
         ORDER BY ci.awarded_at DESC`,
        [req.params.id]
      );

      // Member list for distribution target picker
      const membersRes = await pool.query(
        `SELECT cm.id AS membership_id, p.id AS player_id, p.username, cm.role, cm.xp AS crew_xp
         FROM crew_members cm
         JOIN players p ON p.id = cm.player_id
         WHERE cm.crew_id = $1
         ORDER BY p.username ASC`,
        [req.params.id]
      );

      res.json({
        gold: goldRes.rows[0]?.gold || 0,
        items: itemsRes.rows,
        members: membersRes.rows,
      });
    } catch (err) {
      console.error('GET /crews/:id/vault error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────
  // POST /api/crews/:id/vault/distribute-gold — send gold from crew treasury to a member
  // Body: { player_id, amount }
  // Boss/manager only. Deducts from crew_gold, credits player.gold.
  // ─────────────────────────────────────────────────────
  router.post('/crews/:id/vault/distribute-gold', requireAuth(pool), async (req, res) => {
    const { player_id, amount } = req.body;
    const amt = parseInt(amount);
    if (!player_id || !amt || amt <= 0) {
      return res.status(400).json({ error: 'player_id and positive amount required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const membership = await getMembership(req.params.id, req.player.id);
      if (!membership || !isBossOrManager(membership)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Only boss or manager can distribute gold' });
      }

      // Confirm target is a crew member
      const targetRes = await client.query(
        'SELECT id FROM crew_members WHERE crew_id = $1 AND player_id = $2',
        [req.params.id, player_id]
      );
      if (!targetRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Player is not in this crew' });
      }

      const goldRes = await client.query(
        'SELECT gold FROM crew_gold WHERE crew_id = $1 FOR UPDATE',
        [req.params.id]
      );
      const balance = goldRes.rows[0]?.gold || 0;
      if (balance < amt) {
        await client.query('ROLLBACK');
        return res.status(402).json({ error: 'Not enough crew gold', available: balance });
      }

      await client.query(
        'UPDATE crew_gold SET gold = gold - $1 WHERE crew_id = $2',
        [amt, req.params.id]
      );
      await client.query(
        'UPDATE players SET gold = gold + $1 WHERE id = $2',
        [amt, player_id]
      );

      await client.query('COMMIT');
      res.json({ success: true, distributed: amt });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('POST /crews/:id/vault/distribute-gold error:', err.message);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  });

  // ─────────────────────────────────────────────────────
  // POST /api/crews/:id/vault/assign-item — assign a crew item to a specific member
  // Body: { item_id, player_id }
  // Boss/manager only. Sets crew_items.assigned_to.
  // ─────────────────────────────────────────────────────
  router.post('/crews/:id/vault/assign-item', requireAuth(pool), async (req, res) => {
    const { item_id, player_id } = req.body;
    if (!item_id || !player_id) {
      return res.status(400).json({ error: 'item_id and player_id required' });
    }

    try {
      const membership = await getMembership(req.params.id, req.player.id);
      if (!membership || !isBossOrManager(membership)) {
        return res.status(403).json({ error: 'Only boss or manager can assign items' });
      }

      // Confirm target is a crew member
      const targetRes = await pool.query(
        'SELECT id FROM crew_members WHERE crew_id = $1 AND player_id = $2',
        [req.params.id, player_id]
      );
      if (!targetRes.rows.length) {
        return res.status(404).json({ error: 'Player is not in this crew' });
      }

      // Confirm item belongs to this crew and is not already assigned
      const itemRes = await pool.query(
        `UPDATE crew_items SET assigned_to = $1, assigned_at = NOW()
         WHERE id = $2 AND crew_id = $3 AND assigned_to IS NULL
         RETURNING id, item_name`,
        [player_id, item_id, req.params.id]
      );
      if (!itemRes.rows.length) {
        return res.status(404).json({ error: 'Item not found, already assigned, or not in this crew' });
      }

      res.json({ success: true, item: itemRes.rows[0] });
    } catch (err) {
      console.error('POST /crews/:id/vault/assign-item error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
};

module.exports = routerFactory;
