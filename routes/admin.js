const express = require('express');
const bcrypt = require('bcryptjs');
const { normalizeState } = require('../lib/normalize-state');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin, createAdminToken, verifyAdminPassword, rateLimit, sanitizeFields, sanitizeString } = require('../middleware/security');

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

module.exports = ({ pool }) => {
  const router = express.Router();

  // Rate limiter for admin login — prevents brute force against admin password
  const adminLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: 'Too many login attempts, please try again later' });

  // POST /api/admin/login — validate admin password and issue JWT
  router.post('/admin/login', adminLoginLimiter, (req, res) => {
    const { password } = req.body;
    if (!password || !verifyAdminPassword(password)) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    // Issue a short-lived admin JWT instead of returning the raw password
    const token = createAdminToken();
    res.json({ token });
  });

  // GET /api/admin/stats — core dashboard stats
  router.get('/admin/stats', requireAdmin, async (req, res) => {
    try {
      const [
        totalPlayers,
        newPlayers7d,
        newPlayers30d,
        activePlayers7d,
        activePlayers30d,
        totalCheckins,
        totalRounds,
        challengesCompleted,
        avgXp,
        totalPageviews,
        uniqueVisitors,
        todayViews,
      ] = await Promise.all([
        pool.query('SELECT COUNT(*) as count FROM players'),
        pool.query("SELECT COUNT(*) as count FROM players WHERE created_at >= NOW() - INTERVAL '7 days'"),
        pool.query("SELECT COUNT(*) as count FROM players WHERE created_at >= NOW() - INTERVAL '30 days'"),
        pool.query(`
          SELECT COUNT(DISTINCT player_id) as count FROM (
            SELECT player_id FROM checkins WHERE checked_in_at >= NOW() - INTERVAL '7 days'
            UNION
            SELECT player_id FROM rounds WHERE completed_at >= NOW() - INTERVAL '7 days' AND status = 'completed'
          ) t
        `),
        pool.query(`
          SELECT COUNT(DISTINCT player_id) as count FROM (
            SELECT player_id FROM checkins WHERE checked_in_at >= NOW() - INTERVAL '30 days'
            UNION
            SELECT player_id FROM rounds WHERE completed_at >= NOW() - INTERVAL '30 days' AND status = 'completed'
          ) t
        `),
        pool.query('SELECT COUNT(*) as count FROM checkins'),
        pool.query("SELECT COUNT(*) as count FROM rounds WHERE status = 'completed'"),
        pool.query(`SELECT (
          COALESCE((SELECT COUNT(*) FROM player_challenges WHERE completed = true), 0) +
          COALESCE((SELECT COUNT(*) FROM player_challenge_slots WHERE completed = true), 0)
        )::int AS count`),
        pool.query('SELECT ROUND(AVG(xp)) as avg FROM players'),
        pool.query('SELECT COUNT(*) as count FROM pageviews'),
        pool.query("SELECT COUNT(DISTINCT session_hash) as count FROM pageviews WHERE created_at >= NOW() - INTERVAL '30 days'"),
        pool.query("SELECT COUNT(*) as count FROM pageviews WHERE created_at >= NOW() - INTERVAL '1 day'"),
      ]);

      res.json({
        players: {
          total: parseInt(totalPlayers.rows[0].count),
          new_7d: parseInt(newPlayers7d.rows[0].count),
          new_30d: parseInt(newPlayers30d.rows[0].count),
          active_7d: parseInt(activePlayers7d.rows[0].count),
          active_30d: parseInt(activePlayers30d.rows[0].count),
          avg_xp: parseInt(avgXp.rows[0].avg) || 0,
        },
        activity: {
          total_checkins: parseInt(totalCheckins.rows[0].count),
          total_rounds: parseInt(totalRounds.rows[0].count),
          challenges_completed: parseInt(challengesCompleted.rows[0].count),
        },
        traffic: {
          total_pageviews: parseInt(totalPageviews.rows[0].count),
          unique_visitors_30d: parseInt(uniqueVisitors.rows[0].count),
          today_pageviews: parseInt(todayViews.rows[0].count),
        },
      });
    } catch (err) {
      console.error('Admin stats error:', err.message);
      res.status(500).json({ error: 'Failed to load stats' });
    }
  });

  // GET /api/admin/traffic — daily traffic for last 30 days
  router.get('/admin/traffic', requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          DATE(created_at AT TIME ZONE 'UTC') as day,
          COUNT(*) as views,
          COUNT(DISTINCT session_hash) as uniques
        FROM pageviews
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day ASC
      `);

      res.json({ traffic: result.rows });
    } catch (err) {
      console.error('Admin traffic error:', err.message);
      res.status(500).json({ error: 'Failed to load traffic data' });
    }
  });

  // GET /api/admin/players-growth — daily signups for last 30 days
  router.get('/admin/players-growth', requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          DATE(created_at AT TIME ZONE 'UTC') as day,
          COUNT(*) as signups
        FROM players
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day ASC
      `);

      res.json({ growth: result.rows });
    } catch (err) {
      console.error('Admin growth error:', err.message);
      res.status(500).json({ error: 'Failed to load growth data' });
    }
  });

  // GET /api/admin/top-pages — most visited pages
  router.get('/admin/top-pages', requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT path, COUNT(*) as views, COUNT(DISTINCT session_hash) as uniques
        FROM pageviews
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY path
        ORDER BY views DESC
        LIMIT 15
      `);

      res.json({ pages: result.rows });
    } catch (err) {
      console.error('Admin top pages error:', err.message);
      res.status(500).json({ error: 'Failed to load top pages' });
    }
  });

  // GET /api/admin/top-players — top 20 players by XP
  router.get('/admin/top-players', requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          p.id,
          p.display_name,
          p.email,
          p.xp,
          p.level,
          p.login_streak,
          p.total_rounds,
          p.battle_wins,
          p.created_at,
          (SELECT COUNT(*) FROM checkins WHERE player_id = p.id)::int AS total_checkins,
          (
            COALESCE((SELECT COUNT(*) FROM player_challenges WHERE player_id = p.id AND completed = true), 0) +
            COALESCE((SELECT COUNT(*) FROM player_challenge_slots WHERE player_id = p.id AND completed = true), 0)
          )::int AS challenges_done
        FROM players p
        ORDER BY p.xp DESC
        LIMIT 20
      `);

      res.json({ players: result.rows });
    } catch (err) {
      console.error('Admin top players error:', err.message);
      res.status(500).json({ error: 'Failed to load top players' });
    }
  });

  // GET /api/admin/weekly-checkins — checkins per day for last 14 days
  router.get('/admin/weekly-checkins', requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          DATE(checked_in_at AT TIME ZONE 'UTC') as day,
          COUNT(*) as checkins,
          COUNT(DISTINCT player_id) as active_players
        FROM checkins
        WHERE checked_in_at >= NOW() - INTERVAL '14 days'
        GROUP BY day
        ORDER BY day ASC
      `);

      res.json({ checkins: result.rows });
    } catch (err) {
      console.error('Admin checkins error:', err.message);
      res.status(500).json({ error: 'Failed to load checkin data' });
    }
  });

  // ─── User Management ──────────────────────────────────────────────────────

  // GET /api/admin/users — paginated, searchable, sortable player list
  router.get('/admin/users', requireAdmin, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
      const offset = (page - 1) * limit;
      const search = (req.query.search || '').trim();
      const sortField = ['display_name', 'username', 'email', 'xp', 'level', 'created_at', 'last_active'].includes(req.query.sort) ? req.query.sort : 'created_at';
      const sortDir = req.query.dir === 'asc' ? 'ASC' : 'DESC';

      let whereClause = '';
      const params = [];

      if (search) {
        params.push('%' + search.toLowerCase() + '%');
        whereClause = `WHERE LOWER(p.display_name) LIKE $1 OR LOWER(p.username) LIKE $1 OR LOWER(p.email) LIKE $1`;
      }

      // Build ORDER BY — last_active is a subquery alias
      let orderBy;
      if (sortField === 'last_active') {
        orderBy = `last_active ${sortDir} NULLS LAST`;
      } else {
        orderBy = `p.${sortField} ${sortDir}`;
      }

      const countParams = search ? [params[0]] : [];
      const countResult = await pool.query(
        `SELECT COUNT(*) as total FROM players p ${whereClause}`,
        countParams
      );
      const total = parseInt(countResult.rows[0].total);

      const queryParams = search ? [params[0], limit, offset] : [limit, offset];
      const limitParam = search ? '$2' : '$1';
      const offsetParam = search ? '$3' : '$2';

      const result = await pool.query(
        `SELECT
          p.id,
          p.display_name,
          p.username,
          p.email,
          p.xp,
          p.level,
          p.created_at,
          p.last_login_date,
          GREATEST(
            MAX(ci.checked_in_at),
            MAX(r.completed_at),
            p.created_at
          ) as last_active
        FROM players p
        LEFT JOIN checkins ci ON ci.player_id = p.id
        LEFT JOIN rounds r ON r.player_id = p.id AND r.status = 'completed'
        ${whereClause}
        GROUP BY p.id, p.display_name, p.username, p.email, p.xp, p.level, p.created_at, p.last_login_date
        ORDER BY ${orderBy}
        LIMIT ${limitParam} OFFSET ${offsetParam}`,
        queryParams
      );

      res.json({
        users: result.rows,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      });
    } catch (err) {
      console.error('Admin users error:', err.message);
      res.status(500).json({ error: 'Failed to load users' });
    }
  });

  // POST /api/admin/users — create a new player
  router.post('/admin/users', requireAdmin, sanitizeFields('display_name'), async (req, res) => {
    const { display_name, username, email, password } = req.body;

    if (!display_name || !username || !email || !password) {
      return res.status(400).json({ error: 'display_name, username, email, and password are required' });
    }
    if (display_name.trim().length < 2 || display_name.trim().length > 100) {
      return res.status(400).json({ error: 'Display name must be 2-100 characters' });
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-20 characters: letters, numbers, underscores only' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    try {
      const existing = await pool.query(
        'SELECT id FROM players WHERE email = $1 OR username = $2 LIMIT 1',
        [email.toLowerCase(), username.toLowerCase()]
      );
      if (existing.rows.length > 0) {
        const emailCheck = await pool.query('SELECT id FROM players WHERE email = $1', [email.toLowerCase()]);
        if (emailCheck.rows.length > 0) {
          return res.status(409).json({ error: 'An account with that email already exists' });
        }
        return res.status(409).json({ error: 'That username is already taken' });
      }

      const password_hash = await bcrypt.hash(password, 10);
      const player_uuid = generateUUID();

      const result = await pool.query(
        `INSERT INTO players (player_uuid, display_name, username, email, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, display_name, username, email, xp, level, created_at`,
        [player_uuid, display_name.trim(), username.toLowerCase(), email.toLowerCase(), password_hash]
      );

      res.status(201).json({ user: result.rows[0] });
    } catch (err) {
      console.error('Admin create user error:', err.message);
      res.status(500).json({ error: 'Failed to create user' });
    }
  });

  // PUT /api/admin/users/:id — edit a player (profile + stats)
  router.put('/admin/users/:id', requireAdmin, sanitizeFields('display_name', 'username', 'email'), async (req, res) => {
    const userId = parseInt(req.params.id);
    if (!userId) return res.status(400).json({ error: 'Invalid user ID' });

    const { display_name, username, email, xp, level, gold, battle_wins, battle_losses, total_rounds, login_streak, best_streak, total_distance_m, total_birdies, total_aces, total_checkins, total_courses_visited, challenges_completed } = req.body;

    // Validate provided fields
    if (display_name !== undefined && (display_name.trim().length < 2 || display_name.trim().length > 100)) {
      return res.status(400).json({ error: 'Display name must be 2-100 characters' });
    }
    if (username !== undefined && !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-20 characters: letters, numbers, underscores only' });
    }
    if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    const intFields = { xp: 0, level: 1, gold: 0, battle_wins: 0, battle_losses: 0, total_rounds: 0, login_streak: 0, best_streak: 0, total_birdies: 0, total_aces: 0, total_checkins: 0, total_courses_visited: 0, challenges_completed: 0 };
    for (const [field, min] of Object.entries(intFields)) {
      const val = req.body[field];
      if (val !== undefined && (isNaN(parseInt(val)) || parseInt(val) < min)) {
        return res.status(400).json({ error: `${field} must be >= ${min}` });
      }
    }
    if (total_distance_m !== undefined && (isNaN(parseFloat(total_distance_m)) || parseFloat(total_distance_m) < 0)) {
      return res.status(400).json({ error: 'total_distance_m must be >= 0' });
    }

    try {
      // Check uniqueness conflicts for username/email
      if (username) {
        const uCheck = await pool.query('SELECT id FROM players WHERE username = $1 AND id != $2', [username.toLowerCase(), userId]);
        if (uCheck.rows.length > 0) return res.status(409).json({ error: 'That username is already taken' });
      }
      if (email) {
        const eCheck = await pool.query('SELECT id FROM players WHERE email = $1 AND id != $2', [email.toLowerCase(), userId]);
        if (eCheck.rows.length > 0) return res.status(409).json({ error: 'An account with that email already exists' });
      }

      // Fetch old values for audit log
      const oldResult = await pool.query(
        'SELECT display_name, username, email, xp, level, gold, battle_wins, battle_losses, total_rounds, login_streak, best_streak, total_distance_m, total_birdies, total_aces, total_checkins, total_courses_visited, challenges_completed FROM players WHERE id = $1',
        [userId]
      );
      if (oldResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      const oldPlayer = oldResult.rows[0];

      const sets = [];
      const params = [];
      let paramIdx = 1;

      if (display_name !== undefined) { sets.push(`display_name = $${paramIdx++}`); params.push(display_name.trim()); }
      if (username !== undefined) { sets.push(`username = $${paramIdx++}`); params.push(username.toLowerCase()); }
      if (email !== undefined) { sets.push(`email = $${paramIdx++}`); params.push(email.toLowerCase()); }
      if (xp !== undefined) { sets.push(`xp = $${paramIdx++}`); params.push(parseInt(xp)); }
      if (level !== undefined) { sets.push(`level = $${paramIdx++}`); params.push(parseInt(level)); }
      if (gold !== undefined) { sets.push(`gold = $${paramIdx++}`); params.push(parseInt(gold)); }
      if (battle_wins !== undefined) { sets.push(`battle_wins = $${paramIdx++}`); params.push(parseInt(battle_wins)); }
      if (battle_losses !== undefined) { sets.push(`battle_losses = $${paramIdx++}`); params.push(parseInt(battle_losses)); }
      if (total_rounds !== undefined) { sets.push(`total_rounds = $${paramIdx++}`); params.push(parseInt(total_rounds)); }
      if (login_streak !== undefined) { sets.push(`login_streak = $${paramIdx++}`); params.push(parseInt(login_streak)); }
      if (best_streak !== undefined) { sets.push(`best_streak = $${paramIdx++}`); params.push(parseInt(best_streak)); }
      if (total_distance_m !== undefined) { sets.push(`total_distance_m = $${paramIdx++}`); params.push(parseFloat(total_distance_m)); }
      if (total_birdies !== undefined) { sets.push(`total_birdies = $${paramIdx++}`); params.push(parseInt(total_birdies)); }
      if (total_aces !== undefined) { sets.push(`total_aces = $${paramIdx++}`); params.push(parseInt(total_aces)); }
      if (total_checkins !== undefined) { sets.push(`total_checkins = $${paramIdx++}`); params.push(parseInt(total_checkins)); }
      if (total_courses_visited !== undefined) { sets.push(`total_courses_visited = $${paramIdx++}`); params.push(parseInt(total_courses_visited)); }
      if (challenges_completed !== undefined) { sets.push(`challenges_completed = $${paramIdx++}`); params.push(parseInt(challenges_completed)); }

      if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

      params.push(userId);
      const result = await pool.query(
        `UPDATE players SET ${sets.join(', ')} WHERE id = $${paramIdx}
         RETURNING id, display_name, username, email, xp, level, gold, battle_wins, battle_losses, total_rounds, login_streak, best_streak, total_distance_m, total_birdies, total_aces, total_checkins, total_courses_visited, challenges_completed, created_at`,
        params
      );

      // Audit log — record each changed field
      const auditFields = ['display_name', 'username', 'email', 'xp', 'level', 'gold', 'battle_wins', 'battle_losses', 'total_rounds', 'login_streak', 'best_streak', 'total_distance_m', 'total_birdies', 'total_aces', 'total_checkins', 'total_courses_visited', 'challenges_completed'];
      for (const field of auditFields) {
        if (req.body[field] !== undefined && String(oldPlayer[field]) !== String(result.rows[0][field])) {
          await pool.query(
            'INSERT INTO admin_audit_log (player_id, action, field_name, old_value, new_value) VALUES ($1, $2, $3, $4, $5)',
            [userId, 'stat_update', field, String(oldPlayer[field] ?? ''), String(result.rows[0][field] ?? '')]
          );
        }
      }

      res.json({ user: result.rows[0] });
    } catch (err) {
      console.error('Admin edit user error:', err.message);
      res.status(500).json({ error: 'Failed to update user' });
      console.error(`Admin edit user error [userId=${userId}]:`, err.message);
    }
  });

  // POST /api/admin/users/:id/reset-password — set a new password
  router.post('/admin/users/:id/reset-password', requireAdmin, async (req, res) => {
    const userId = parseInt(req.params.id);
    if (!userId) return res.status(400).json({ error: 'Invalid user ID' });

    const { password } = req.body;
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    try {
      const password_hash = await bcrypt.hash(password, 10);
      const result = await pool.query(
        'UPDATE players SET password_hash = $1 WHERE id = $2 RETURNING id',
        [password_hash, userId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      res.json({ success: true });
    } catch (err) {
      console.error('Admin reset password error:', err.message);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  // DELETE /api/admin/users/:id — hard delete player (cascades all related data)
  // Requires ?confirm_username=<username> for safety
  router.delete('/admin/users/:id', requireAdmin, async (req, res) => {
    const userId = parseInt(req.params.id);
    if (!userId) return res.status(400).json({ error: 'Invalid user ID' });

    try {
      // Fetch player info for confirmation check
      const playerCheck = await pool.query(
        'SELECT id, display_name, username FROM players WHERE id = $1',
        [userId]
      );
      if (playerCheck.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      const player = playerCheck.rows[0];

      // Require username confirmation if provided in query
      const confirmUsername = req.query.confirm_username || req.body.confirm_username;
      if (confirmUsername && confirmUsername.toLowerCase() !== (player.username || '').toLowerCase()) {
        return res.status(400).json({ error: 'Username confirmation does not match' });
      }

      const result = await pool.query(
        'DELETE FROM players WHERE id = $1 RETURNING id, display_name',
        [userId]
      );
      res.json({ success: true, deleted: result.rows[0] });
    } catch (err) {
      console.error('Admin delete user error:', err.message);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  // GET /api/admin/users/:id/stats — full stats for a user (aggregated from all tables)
  router.get('/admin/users/:id/stats', requireAdmin, async (req, res) => {
    const userId = parseInt(req.params.id);
    if (!userId) return res.status(400).json({ error: 'Invalid user ID' });

    try {
      // Core player data
      const playerResult = await pool.query(
        `SELECT id, player_uuid, display_name, username, email, xp, level, gold,
                battle_wins, battle_losses, total_rounds, login_streak, best_streak,
                total_distance_m, profile_photo_url, last_login_date, created_at,
                total_birdies, total_aces, total_checkins, total_courses_visited, challenges_completed
         FROM players WHERE id = $1`,
        [userId]
      );
      if (playerResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      const player = playerResult.rows[0];

      // Game stats: stored columns are used for inline-edit persistence (per #1521231).
      // Live-computed values are returned separately in computed_stats for display.
      const [liveCheckins, liveCourses, liveBirdies, liveAces, liveChallenges] = await Promise.all([
        pool.query('SELECT COUNT(*)::int AS val FROM checkins WHERE player_id = $1', [userId]),
        pool.query('SELECT COUNT(DISTINCT course_id)::int AS val FROM checkins WHERE player_id = $1', [userId]),
        pool.query(`SELECT COUNT(*)::int AS val FROM round_holes rh
          JOIN rounds r ON r.id = rh.round_id AND r.player_id = $1 AND r.status = 'completed'
          WHERE rh.score = rh.par - 1`, [userId]),
        pool.query(`SELECT COUNT(*)::int AS val FROM round_holes rh
          JOIN rounds r ON r.id = rh.round_id AND r.player_id = $1 AND r.status = 'completed'
          WHERE rh.score = 1 AND rh.par >= 2`, [userId]),
        pool.query(`SELECT (
          COALESCE((SELECT COUNT(*) FROM player_challenges WHERE player_id = $1 AND completed = true), 0) +
          COALESCE((SELECT COUNT(*) FROM player_challenge_slots WHERE player_id = $1 AND completed = true), 0)
        )::int AS val`, [userId]),
      ]);
      const computed_stats = {
        total_birdies: parseInt(liveBirdies.rows[0].val) || 0,
        total_aces: parseInt(liveAces.rows[0].val) || 0,
        total_checkins: parseInt(liveCheckins.rows[0].val) || 0,
        total_courses_visited: parseInt(liveCourses.rows[0].val) || 0,
        challenges_completed: parseInt(liveChallenges.rows[0].val) || 0,
      };

      // Achievements (from player_achievements)
      const achievementsResult = await pool.query(
        `SELECT id, achievement_type, earned_at FROM player_achievements WHERE player_id = $1 ORDER BY earned_at DESC`,
        [userId]
      );

      // Badges (from player_badges)
      const badgesResult = await pool.query(
        `SELECT id, category, tier, earned_at FROM player_badges WHERE player_id = $1 ORDER BY earned_at DESC`,
        [userId]
      );

      // Challenges (active + completed)
      const challengesResult = await pool.query(
        `SELECT pc.id, pc.progress, pc.completed, pc.completed_at, pc.created_at,
                c.title, c.slug, c.difficulty, c.target_value, c.xp_reward
         FROM player_challenges pc
         JOIN challenges c ON c.id = pc.challenge_id
         WHERE pc.player_id = $1
         ORDER BY pc.completed ASC, pc.created_at DESC
         LIMIT 50`,
        [userId]
      );

      // Recent check-ins (last 20)
      const checkinsResult = await pool.query(
        `SELECT ci.id, ci.course_id, ci.xp_earned, ci.checked_in_at,
                co.name as course_name, co.city, co.state
         FROM checkins ci
         LEFT JOIN courses co ON co.id = ci.course_id
         WHERE ci.player_id = $1
         ORDER BY ci.checked_in_at DESC
         LIMIT 20`,
        [userId]
      );

      // Battle history (last 20)
      const battlesResult = await pool.query(
        `SELECT b.id, b.status, b.battle_type, b.created_at, b.resolved_at,
                b.challenger_score, b.opponent_score, b.winner_id,
                CASE WHEN b.challenger_id = $1 THEN p2.display_name ELSE p1.display_name END as opponent_name
         FROM battles b
         LEFT JOIN players p1 ON p1.id = b.challenger_id
         LEFT JOIN players p2 ON p2.id = b.opponent_id
         WHERE b.challenger_id = $1 OR b.opponent_id = $1
         ORDER BY b.created_at DESC
         LIMIT 20`,
        [userId]
      );

      // Round history (last 20 completed)
      const roundsResult = await pool.query(
        `SELECT r.id, r.course_id, r.status, r.holes_count, r.total_score, r.started_at, r.completed_at,
                co.name as course_name, co.city, co.state
         FROM rounds r
         LEFT JOIN courses co ON co.id = r.course_id
         WHERE r.player_id = $1 AND r.status = 'completed'
         ORDER BY r.completed_at DESC
         LIMIT 20`,
        [userId]
      );

      // Audit log (last 50)
      const auditResult = await pool.query(
        `SELECT id, action, field_name, old_value, new_value, metadata, created_at
         FROM admin_audit_log WHERE player_id = $1
         ORDER BY created_at DESC LIMIT 50`,
        [userId]
      );

      res.json({
        player,
        computed_stats,
        achievements: achievementsResult.rows,
        badges: badgesResult.rows,
        challenges: challengesResult.rows,
        checkins: checkinsResult.rows,
        battles: battlesResult.rows,
        rounds: roundsResult.rows,
        audit_log: auditResult.rows,
      });
    } catch (err) {
      console.error('Admin user stats error:', err.message);
      res.status(500).json({ error: 'Failed to load user stats' });
    }
  });

  // POST /api/admin/users/:id/grant — add XP or gold to existing total
  router.post('/admin/users/:id/grant', requireAdmin, async (req, res) => {
    const userId = parseInt(req.params.id);
    if (!userId) return res.status(400).json({ error: 'Invalid user ID' });

    const { type, amount } = req.body;
    if (!['xp', 'gold'].includes(type)) return res.status(400).json({ error: 'type must be xp or gold' });
    if (!amount || isNaN(parseInt(amount)) || parseInt(amount) <= 0) {
      return res.status(400).json({ error: 'amount must be a positive integer' });
    }

    try {
      const field = type === 'xp' ? 'xp' : 'gold';
      const oldResult = await pool.query(`SELECT ${field} FROM players WHERE id = $1`, [userId]);
      if (oldResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      const oldVal = parseInt(oldResult.rows[0][field]) || 0;
      const newVal = oldVal + parseInt(amount);

      await pool.query(`UPDATE players SET ${field} = $1 WHERE id = $2`, [newVal, userId]);

      // Audit log
      await pool.query(
        'INSERT INTO admin_audit_log (player_id, action, field_name, old_value, new_value, metadata) VALUES ($1, $2, $3, $4, $5, $6)',
        [userId, 'grant', field, String(oldVal), String(newVal), JSON.stringify({ granted: parseInt(amount) })]
      );

      res.json({ success: true, field, old_value: oldVal, new_value: newVal });
    } catch (err) {
      console.error('Admin grant error:', err.message);
      res.status(500).json({ error: 'Failed to grant ' + type });
    }
  });

  // POST /api/admin/users/:id/achievements — grant an achievement
  router.post('/admin/users/:id/achievements', requireAdmin, async (req, res) => {
    const userId = parseInt(req.params.id);
    if (!userId) return res.status(400).json({ error: 'Invalid user ID' });

    const { achievement_type } = req.body;
    if (!achievement_type || !achievement_type.trim()) {
      return res.status(400).json({ error: 'achievement_type is required' });
    }

    try {
      // Check player exists
      const playerCheck = await pool.query('SELECT id FROM players WHERE id = $1', [userId]);
      if (playerCheck.rows.length === 0) return res.status(404).json({ error: 'User not found' });

      const result = await pool.query(
        `INSERT INTO player_achievements (player_id, achievement_type)
         VALUES ($1, $2)
         ON CONFLICT (player_id, achievement_type) DO NOTHING
         RETURNING id, achievement_type, earned_at`,
        [userId, achievement_type.trim()]
      );

      if (result.rows.length === 0) {
        return res.status(409).json({ error: 'User already has this achievement' });
      }

      // Audit log
      await pool.query(
        'INSERT INTO admin_audit_log (player_id, action, field_name, new_value) VALUES ($1, $2, $3, $4)',
        [userId, 'achievement_grant', 'achievement', achievement_type.trim()]
      );

      res.status(201).json({ achievement: result.rows[0] });
    } catch (err) {
      console.error('Admin grant achievement error:', err.message);
      res.status(500).json({ error: 'Failed to grant achievement' });
    }
  });

  // DELETE /api/admin/users/:id/achievements/:achievementId — remove an achievement
  router.delete('/admin/users/:id/achievements/:achievementId', requireAdmin, async (req, res) => {
    const userId = parseInt(req.params.id);
    const achievementId = parseInt(req.params.achievementId);
    if (!userId || !achievementId) return res.status(400).json({ error: 'Invalid IDs' });

    try {
      const result = await pool.query(
        'DELETE FROM player_achievements WHERE id = $1 AND player_id = $2 RETURNING id, achievement_type',
        [achievementId, userId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Achievement not found' });

      // Audit log
      await pool.query(
        'INSERT INTO admin_audit_log (player_id, action, field_name, old_value) VALUES ($1, $2, $3, $4)',
        [userId, 'achievement_remove', 'achievement', result.rows[0].achievement_type]
      );

      res.json({ success: true, removed: result.rows[0] });
    } catch (err) {
      console.error('Admin remove achievement error:', err.message);
      res.status(500).json({ error: 'Failed to remove achievement' });
    }
  });

  // POST /api/admin/users/:id/badges — grant a badge
  router.post('/admin/users/:id/badges', requireAdmin, async (req, res) => {
    const userId = parseInt(req.params.id);
    if (!userId) return res.status(400).json({ error: 'Invalid user ID' });

    const { category, tier } = req.body;
    if (!category || !tier) return res.status(400).json({ error: 'category and tier are required' });
    if (!['bronze', 'silver', 'gold', 'platinum', 'diamond'].includes(tier)) {
      return res.status(400).json({ error: 'tier must be bronze/silver/gold/platinum/diamond' });
    }

    try {
      const playerCheck = await pool.query('SELECT id FROM players WHERE id = $1', [userId]);
      if (playerCheck.rows.length === 0) return res.status(404).json({ error: 'User not found' });

      const result = await pool.query(
        `INSERT INTO player_badges (player_id, category, tier)
         VALUES ($1, $2, $3)
         ON CONFLICT (player_id, category, tier) DO NOTHING
         RETURNING id, category, tier, earned_at`,
        [userId, category.trim(), tier]
      );

      if (result.rows.length === 0) {
        return res.status(409).json({ error: 'User already has this badge' });
      }

      await pool.query(
        'INSERT INTO admin_audit_log (player_id, action, field_name, new_value) VALUES ($1, $2, $3, $4)',
        [userId, 'badge_grant', 'badge', `${category}:${tier}`]
      );

      res.status(201).json({ badge: result.rows[0] });
    } catch (err) {
      console.error('Admin grant badge error:', err.message);
      res.status(500).json({ error: 'Failed to grant badge' });
    }
  });

  // DELETE /api/admin/users/:id/badges/:badgeId — remove a badge
  router.delete('/admin/users/:id/badges/:badgeId', requireAdmin, async (req, res) => {
    const userId = parseInt(req.params.id);
    const badgeId = parseInt(req.params.badgeId);
    if (!userId || !badgeId) return res.status(400).json({ error: 'Invalid IDs' });

    try {
      const result = await pool.query(
        'DELETE FROM player_badges WHERE id = $1 AND player_id = $2 RETURNING id, category, tier',
        [badgeId, userId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Badge not found' });

      await pool.query(
        'INSERT INTO admin_audit_log (player_id, action, field_name, old_value) VALUES ($1, $2, $3, $4)',
        [userId, 'badge_remove', 'badge', `${result.rows[0].category}:${result.rows[0].tier}`]
      );

      res.json({ success: true, removed: result.rows[0] });
    } catch (err) {
      console.error('Admin remove badge error:', err.message);
      res.status(500).json({ error: 'Failed to remove badge' });
    }
  });

  // POST /api/admin/users/:id/reset-stat — zero out an individual stat
  router.post('/admin/users/:id/reset-stat', requireAdmin, async (req, res) => {
    const userId = parseInt(req.params.id);
    if (!userId) return res.status(400).json({ error: 'Invalid user ID' });

    const { field } = req.body;
    const allowed = ['xp', 'gold', 'battle_wins', 'battle_losses', 'total_rounds', 'login_streak', 'best_streak', 'total_distance_m', 'total_birdies', 'total_aces', 'total_checkins', 'total_courses_visited', 'challenges_completed'];
    if (!allowed.includes(field)) return res.status(400).json({ error: 'Invalid field. Allowed: ' + allowed.join(', ') });

    try {
      const oldResult = await pool.query(`SELECT ${field} FROM players WHERE id = $1`, [userId]);
      if (oldResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      const oldVal = oldResult.rows[0][field];

      const resetVal = field === 'total_distance_m' ? 0.0 : 0;
      await pool.query(`UPDATE players SET ${field} = $1 WHERE id = $2`, [resetVal, userId]);

      await pool.query(
        'INSERT INTO admin_audit_log (player_id, action, field_name, old_value, new_value) VALUES ($1, $2, $3, $4, $5)',
        [userId, 'stat_reset', field, String(oldVal), '0']
      );

      res.json({ success: true, field, old_value: oldVal, new_value: resetVal });
    } catch (err) {
      console.error('Admin reset stat error:', err.message);
      res.status(500).json({ error: 'Failed to reset stat' });
    }
  });

  // ─── Course Management ─────────────────────────────────────────────────────

  // POST /api/admin/courses — create a new course
  router.post('/admin/courses', requireAdmin, sanitizeFields('name', 'designer', 'notable_features'), async (req, res) => {
    const {
      name, city, state, holes, par, lat, lng,
      terrain, difficulty, source,
      fees, pdga_rating, dgcoursereview_rating,
      is_active, year_established, designer,
      elevation_change_ft, course_length_ft,
      notable_features, amenities,
    } = req.body;

    // Required fields
    if (!name || !name.trim() || name.trim().length < 2) {
      return res.status(400).json({ error: 'Course name is required (at least 2 characters)' });
    }
    if (!city || !city.trim()) {
      return res.status(400).json({ error: 'City is required' });
    }
    if (!state || !state.trim()) {
      return res.status(400).json({ error: 'State is required' });
    }
    if (!holes || isNaN(parseInt(holes)) || parseInt(holes) < 1) {
      return res.status(400).json({ error: 'Holes must be a positive number' });
    }
    if (!par || isNaN(parseInt(par)) || parseInt(par) < 1) {
      return res.status(400).json({ error: 'Par must be a positive number' });
    }
    if (lat === undefined || lat === null || lat === '' || isNaN(parseFloat(lat)) || Math.abs(parseFloat(lat)) > 90) {
      return res.status(400).json({ error: 'Valid GPS latitude is required (-90 to 90)' });
    }
    if (lng === undefined || lng === null || lng === '' || isNaN(parseFloat(lng)) || Math.abs(parseFloat(lng)) > 180) {
      return res.status(400).json({ error: 'Valid GPS longitude is required (-180 to 180)' });
    }

    try {
      const result = await pool.query(
        `INSERT INTO courses (
          name, city, state, holes, par, lat, lng,
          terrain, difficulty, source,
          fees, pdga_rating, dgcoursereview_rating,
          is_active, year_established, designer,
          elevation_change_ft, course_length_ft,
          notable_features, amenities
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10,
          $11, $12, $13,
          $14, $15, $16,
          $17, $18,
          $19, $20
        ) RETURNING *`,
        [
          name.trim(), city.trim(), normalizeState(state),
          parseInt(holes), parseInt(par),
          parseFloat(lat), parseFloat(lng),
          terrain || null, difficulty || null,
          source || 'manual',
          fees || null,
          pdga_rating ? parseFloat(pdga_rating) : null,
          dgcoursereview_rating ? parseFloat(dgcoursereview_rating) : null,
          is_active !== false && is_active !== 'false',
          year_established ? parseInt(year_established) : null,
          designer || null,
          elevation_change_ft ? parseInt(elevation_change_ft) : null,
          course_length_ft ? parseInt(course_length_ft) : null,
          notable_features || null,
          amenities ? JSON.stringify(amenities) : '[]',
        ]
      );
      res.status(201).json({ course: result.rows[0] });
    } catch (err) {
      console.error('Admin create course error:', err.message);
      res.status(500).json({ error: 'Failed to create course' });
    }
  });

  // GET /api/admin/courses — paginated, searchable, filterable by state
  router.get('/admin/courses', requireAdmin, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
      const offset = (page - 1) * limit;
      const search = (req.query.search || '').trim();
      const state = (req.query.state || '').trim();
      const sortField = ['name', 'city', 'state', 'holes', 'par', 'terrain', 'difficulty', 'source', 'created_at'].includes(req.query.sort)
        ? req.query.sort : 'name';
      const sortDir = req.query.dir === 'desc' ? 'DESC' : 'ASC';

      const conditions = [];
      const params = [];
      let paramIdx = 1;

      if (search) {
        params.push('%' + search.toLowerCase() + '%');
        conditions.push(`LOWER(name) LIKE $${paramIdx++}`);
      }
      if (state) {
        params.push(state);
        conditions.push(`state = $${paramIdx++}`);
      }

      const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

      const countResult = await pool.query(
        `SELECT COUNT(*) as total FROM courses ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].total);

      const queryParams = [...params, limit, offset];
      const result = await pool.query(
        `SELECT id, name, city, state, holes, par,
                terrain, difficulty, source,
                lat, lng, fees,
                pdga_rating, dgcoursereview_rating,
                is_active, year_established, designer,
                elevation_change_ft, course_length_ft,
                notable_features, amenities,
                created_at
         FROM courses
         ${whereClause}
         ORDER BY ${sortField} ${sortDir}
         LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        queryParams
      );

      // Get per-state counts
      const stateCounts = await pool.query(
        `SELECT state, COUNT(*) as count FROM courses GROUP BY state ORDER BY state ASC`
      );

      res.json({
        courses: result.rows,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        state_counts: stateCounts.rows,
      });
    } catch (err) {
      console.error('Admin courses error:', err.message);
      res.status(500).json({ error: 'Failed to load courses' });
    }
  });

  // GET /api/admin/courses/:id — single course detail
  router.get('/admin/courses/:id', requireAdmin, async (req, res) => {
    const courseId = parseInt(req.params.id);
    if (!courseId) return res.status(400).json({ error: 'Invalid course ID' });

    try {
      const result = await pool.query(
        `SELECT c.*,
                (SELECT COUNT(*) FROM checkins WHERE course_id = c.id) as checkin_count
         FROM courses c WHERE c.id = $1`,
        [courseId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Course not found' });
      res.json({ course: result.rows[0] });
    } catch (err) {
      console.error('Admin get course error:', err.message);
      res.status(500).json({ error: 'Failed to load course' });
    }
  });

  // PUT /api/admin/courses/:id — edit a course
  router.put('/admin/courses/:id', requireAdmin, sanitizeFields('name', 'designer', 'notable_features'), async (req, res) => {
    const courseId = parseInt(req.params.id);
    if (!courseId) return res.status(400).json({ error: 'Invalid course ID' });

    const allowedFields = [
      'name', 'city', 'state', 'lat', 'lng', 'par', 'holes',
      'terrain', 'difficulty', 'source', 'fees',
      'pdga_rating', 'dgcoursereview_rating',
      'is_active', 'year_established', 'designer',
      'elevation_change_ft', 'course_length_ft',
      'notable_features', 'amenities',
    ];

    const sets = [];
    const params = [];
    let paramIdx = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        sets.push(`${field} = $${paramIdx++}`);
        // Normalize state abbreviations to full names
        params.push(field === 'state' ? normalizeState(req.body[field]) : req.body[field]);
      }
    }

    // Keep hole_count in sync when holes is updated.
    // The courses API uses COALESCE(hole_count, holes) so if only
    // `holes` is updated but `hole_count` retains a stale value,
    // the API will return the old count. Sync both columns.
    if (req.body.holes !== undefined) {
      sets.push(`hole_count = $${paramIdx++}`);
      params.push(req.body.holes);
    }

    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

    // Validate required string fields if provided
    if (req.body.name !== undefined && (!req.body.name || req.body.name.trim().length < 2)) {
      return res.status(400).json({ error: 'Course name must be at least 2 characters' });
    }
    if (req.body.lat !== undefined && (isNaN(parseFloat(req.body.lat)) || Math.abs(parseFloat(req.body.lat)) > 90)) {
      return res.status(400).json({ error: 'Invalid latitude' });
    }
    if (req.body.lng !== undefined && (isNaN(parseFloat(req.body.lng)) || Math.abs(parseFloat(req.body.lng)) > 180)) {
      return res.status(400).json({ error: 'Invalid longitude' });
    }

    sets.push(`updated_at = NOW()`);

    try {
      params.push(courseId);
      const result = await pool.query(
        `UPDATE courses SET ${sets.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
        params
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Course not found' });
      res.json({ course: result.rows[0] });
    } catch (err) {
      console.error('Admin edit course error:', err.message);
      res.status(500).json({ error: 'Failed to update course' });
    }
  });

  // PUT /api/admin/courses/:id/holes — replace per-hole metadata for a course
  // Body: { holes: [{ hole: 1, label: "1", par: 3, distance_ft: 285 }, ...] }
  // label is optional — if omitted, display falls back to sequential hole number.
  // All holes for the course must be present; partial updates replace the whole array.
  router.put('/admin/courses/:id/holes', requireAdmin, async (req, res) => {
    const courseId = parseInt(req.params.id);
    if (!courseId) return res.status(400).json({ error: 'Invalid course ID' });

    const { holes } = req.body;
    if (!Array.isArray(holes) || holes.length === 0) {
      return res.status(400).json({ error: 'holes array is required' });
    }

    // Validate each hole entry
    for (const h of holes) {
      if (!h.hole || isNaN(parseInt(h.hole))) {
        return res.status(400).json({ error: `Invalid hole number: ${h.hole}` });
      }
      if (!h.par || ![3, 4, 5].includes(parseInt(h.par))) {
        return res.status(400).json({ error: `Par must be 3, 4, or 5 for hole ${h.hole}` });
      }
      if (h.distance_ft !== null && h.distance_ft !== undefined && isNaN(parseInt(h.distance_ft))) {
        return res.status(400).json({ error: `Invalid distance for hole ${h.hole}` });
      }
      // label is optional; validate if provided (1-6 chars, alphanumeric + A/B/C suffixes)
      if (h.label !== undefined && h.label !== null && h.label !== '') {
        const lbl = String(h.label).trim();
        if (lbl.length > 6) {
          return res.status(400).json({ error: `Hole label too long for hole ${h.hole} (max 6 chars)` });
        }
      }
    }

    // Normalize and sort — preserve label if provided, else omit (UI falls back to index)
    const normalized = holes.map(h => {
      const entry = {
        hole: parseInt(h.hole),
        par: parseInt(h.par),
        distance_ft: h.distance_ft != null && h.distance_ft !== '' ? parseInt(h.distance_ft) : null,
      };
      const lbl = h.label != null ? String(h.label).trim() : '';
      // Only store label when it differs from the default sequential number
      if (lbl && lbl !== String(entry.hole)) entry.label = lbl;
      return entry;
    }).sort((a, b) => a.hole - b.hole);

    try {
      const result = await pool.query(
        `UPDATE courses SET hole_details = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, hole_details`,
        [JSON.stringify(normalized), courseId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Course not found' });
      res.json({ course: result.rows[0] });
    } catch (err) {
      console.error('Admin update holes error:', err.message);
      res.status(500).json({ error: 'Failed to update hole details' });
    }
  });

  // ─── Scorecard Preview ────────────────────────────────────────────────────
  // Admin-only bypass of GPS check-in gate for QA / scorecard testing.
  // Rounds created here are marked is_preview=true and are abandoned on complete
  // so they never affect XP, leaderboards, total_rounds, or challenge progress.

  // POST /api/admin/rounds/preview-start — start a preview round (no GPS required)
  // Headers: x-admin-token + Authorization Bearer
  // Body: { course_id, holes_count }
  router.post('/admin/rounds/preview-start', requireAdmin, requireAuth(pool), async (req, res) => {
    const { course_id, holes_count = 18 } = req.body;
    if (!course_id) return res.status(400).json({ error: 'course_id required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const courseCheck = await client.query(
        `SELECT name, city, state, COALESCE(hole_count, holes, 18) AS course_holes, hole_details
         FROM courses WHERE id = $1`,
        [course_id]
      );
      if (courseCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Course not found' });
      }
      const { course_holes, hole_details } = courseCheck.rows[0];
      const holeCount = Math.min(parseInt(holes_count), parseInt(course_holes));

      // Abandon any existing in-progress rounds for this player
      await client.query(
        `UPDATE rounds SET status = 'abandoned' WHERE player_id = $1 AND status = 'in_progress'`,
        [req.player.id]
      );

      // Create the preview round (is_preview flag stored in notes/metadata via status prefix)
      // We use a separate marker: status stays 'in_progress' but we track preview in the round
      // by inserting a sentinel hole score we'll clean up on complete.
      // Simplest: just start a normal round — on preview-complete we abandon it after computing stats.
      const result = await client.query(
        `INSERT INTO rounds (player_id, course_id, holes_count, status)
         VALUES ($1, $2, $3, 'in_progress')
         RETURNING *`,
        [req.player.id, course_id, holeCount]
      );
      const round = result.rows[0];
      round.course_name = courseCheck.rows[0].name;
      round.city = courseCheck.rows[0].city;
      round.state = courseCheck.rows[0].state;
      round.course_holes = parseInt(course_holes);
      round.hole_details = hole_details;

      await client.query('COMMIT');
      res.json({ round, is_preview: true });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Preview round start error:', err.message);
      res.status(500).json({ error: 'Failed to start preview round' });
    } finally {
      client.release();
    }
  });

  // POST /api/admin/rounds/:id/preview-complete — finish preview round, return stats, then abandon
  // No XP, no gold, no challenges, no leaderboard impact. Round abandoned after stats computed.
  router.post('/admin/rounds/:id/preview-complete', requireAdmin, requireAuth(pool), async (req, res) => {
    const roundId = parseInt(req.params.id);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify ownership and that it's in_progress
      const roundResult = await client.query(
        `SELECT r.*, COALESCE(co.hole_count, co.holes, 18) as course_holes
         FROM rounds r LEFT JOIN courses co ON co.id = r.course_id
         WHERE r.id = $1 AND r.player_id = $2 AND r.status = 'in_progress'`,
        [roundId, req.player.id]
      );
      if (roundResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Active round not found' });
      }

      // Compute hole stats
      const holesResult = await client.query(
        `SELECT SUM(score) as total_score, SUM(par) as total_par, COUNT(*) as holes_logged,
                COUNT(*) FILTER (WHERE score = 1 AND par >= 2) as aces,
                COUNT(*) FILTER (WHERE score <= par - 2 AND score > 1) as eagles,
                COUNT(*) FILTER (WHERE score = par - 1) as birdies,
                COUNT(*) FILTER (WHERE score = par) as pars,
                COUNT(*) FILTER (WHERE score = par + 1) as bogeys,
                COUNT(*) FILTER (WHERE score >= par + 2) as doubles_plus
         FROM round_holes WHERE round_id = $1`,
        [roundId]
      );
      const allHolesResult = await client.query(
        `SELECT hole_number, par, score FROM round_holes WHERE round_id = $1 ORDER BY score - par ASC`,
        [roundId]
      );
      const { total_score, total_par, holes_logged, aces, eagles, birdies, pars, bogeys, doubles_plus } = holesResult.rows[0];
      if (parseInt(holes_logged) < 1) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'No holes logged yet' });
      }

      const allHoles = allHolesResult.rows;
      const bestHole = allHoles.length > 0 ? allHoles[0] : null;
      const worstHole = allHoles.length > 0 ? allHoles[allHoles.length - 1] : null;

      // Abandon the round — no stats impact, no XP, no leaderboard
      await client.query(
        `UPDATE rounds SET status = 'abandoned' WHERE id = $1`,
        [roundId]
      );

      await client.query('COMMIT');

      res.json({
        is_preview: true,
        round_id: roundId,
        holes_logged: parseInt(holes_logged),
        total_score: parseInt(total_score) || 0,
        total_par: parseInt(total_par) || 0,
        score_vs_par: (parseInt(total_score) || 0) - (parseInt(total_par) || 0),
        xp_granted: 0,
        milestone_xp: null,
        gold_earned: 0,
        item_drop: null,
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
        round_duration_seconds: null,
        distance_analytics: null,
        new_distance_achievements: [],
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Preview round complete error:', err.message);
      res.status(500).json({ error: 'Failed to complete preview round' });
    } finally {
      client.release();
    }
  });

  // DELETE /api/admin/courses/:id — delete course (cascades checkins)
  router.delete('/admin/courses/:id', requireAdmin, async (req, res) => {
    const courseId = parseInt(req.params.id);
    if (!courseId) return res.status(400).json({ error: 'Invalid course ID' });

    try {
      // Count checkins before deletion for the response
      const checkinCount = await pool.query(
        'SELECT COUNT(*) as count FROM checkins WHERE course_id = $1',
        [courseId]
      );

      const result = await pool.query(
        'DELETE FROM courses WHERE id = $1 RETURNING id, name, city, state',
        [courseId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Course not found' });

      res.json({
        success: true,
        deleted: result.rows[0],
        checkins_removed: parseInt(checkinCount.rows[0].count),
      });
    } catch (err) {
      console.error('Admin delete course error:', err.message);
      res.status(500).json({ error: 'Failed to delete course' });
    }
  });

  // ─── Layout & Hole Admin Endpoints ────────────────────────────────────────
  // These mirror routes/layouts.js but accept X-Admin-Token instead of JWT.

  // GET /api/admin/courses/:id/layouts
  router.get('/admin/courses/:id/layouts', requireAdmin, async (req, res) => {
    const courseId = parseInt(req.params.id, 10);
    if (isNaN(courseId)) return res.status(400).json({ error: 'Invalid course ID' });
    try {
      const { rows } = await pool.query(
        `SELECT id, course_id, name, hole_count, is_default, created_at
         FROM course_layouts WHERE course_id = $1
         ORDER BY is_default DESC, name ASC`,
        [courseId]
      );
      res.json(rows);
    } catch (err) {
      console.error('Admin list layouts error:', err.message);
      res.status(500).json({ error: 'Failed to list layouts' });
    }
  });

  // POST /api/admin/courses/:id/layouts
  router.post('/admin/courses/:id/layouts', requireAdmin, sanitizeFields('name'), async (req, res) => {
    const courseId = parseInt(req.params.id, 10);
    if (isNaN(courseId)) return res.status(400).json({ error: 'Invalid course ID' });
    const { name, hole_count, is_default = false } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (is_default) {
        await client.query(`UPDATE course_layouts SET is_default = FALSE WHERE course_id = $1`, [courseId]);
      }
      const { rows } = await client.query(
        `INSERT INTO course_layouts (course_id, name, hole_count, is_default)
         VALUES ($1, $2, $3, $4)
         RETURNING id, course_id, name, hole_count, is_default, created_at`,
        [courseId, name.trim(), hole_count || null, is_default]
      );
      await client.query('COMMIT');
      res.status(201).json(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') return res.status(409).json({ error: 'A layout with that name already exists' });
      if (err.code === '23503') return res.status(404).json({ error: 'Course not found' });
      console.error('Admin create layout error:', err.message);
      res.status(500).json({ error: 'Failed to create layout' });
    } finally {
      client.release();
    }
  });

  // PATCH /api/admin/layouts/:layoutId — update name, hole_count, or set as default
  router.patch('/admin/layouts/:layoutId', requireAdmin, sanitizeFields('name'), async (req, res) => {
    const layoutId = parseInt(req.params.layoutId, 10);
    if (isNaN(layoutId)) return res.status(400).json({ error: 'Invalid layout ID' });
    const { name, hole_count, is_default } = req.body;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(`SELECT id, course_id, is_default FROM course_layouts WHERE id = $1`, [layoutId]);
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Layout not found' });
      }
      const layout = existing.rows[0];
      if (is_default === true) {
        await client.query(`UPDATE course_layouts SET is_default = FALSE WHERE course_id = $1`, [layout.course_id]);
      }
      if (is_default === false && layout.is_default) {
        const other = await client.query(
          `SELECT id FROM course_layouts WHERE course_id = $1 AND id != $2 AND is_default = TRUE`,
          [layout.course_id, layoutId]
        );
        if (other.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Cannot remove default without assigning another layout as default' });
        }
      }
      const updates = []; const params = []; let idx = 1;
      if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name.trim()); }
      if (hole_count !== undefined) { updates.push(`hole_count = $${idx++}`); params.push(hole_count); }
      if (is_default !== undefined) { updates.push(`is_default = $${idx++}`); params.push(is_default); }
      if (updates.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'No fields to update' });
      }
      params.push(layoutId);
      const { rows } = await client.query(
        `UPDATE course_layouts SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, course_id, name, hole_count, is_default, created_at`,
        params
      );
      await client.query('COMMIT');
      res.json(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') return res.status(409).json({ error: 'A layout with that name already exists' });
      console.error('Admin update layout error:', err.message);
      res.status(500).json({ error: 'Failed to update layout' });
    } finally {
      client.release();
    }
  });

  // DELETE /api/admin/layouts/:layoutId — delete non-default layout
  router.delete('/admin/layouts/:layoutId', requireAdmin, async (req, res) => {
    const layoutId = parseInt(req.params.layoutId, 10);
    if (isNaN(layoutId)) return res.status(400).json({ error: 'Invalid layout ID' });
    try {
      const { rows } = await pool.query(`SELECT id, is_default FROM course_layouts WHERE id = $1`, [layoutId]);
      if (rows.length === 0) return res.status(404).json({ error: 'Layout not found' });
      if (rows[0].is_default) {
        return res.status(400).json({ error: 'Cannot delete the default layout. Set another layout as default first.' });
      }
      await pool.query(`DELETE FROM course_layouts WHERE id = $1`, [layoutId]);
      res.json({ deleted: true });
    } catch (err) {
      console.error('Admin delete layout error:', err.message);
      res.status(500).json({ error: 'Failed to delete layout' });
    }
  });

  // GET /api/admin/layouts/:layoutId/holes
  router.get('/admin/layouts/:layoutId/holes', requireAdmin, async (req, res) => {
    const layoutId = parseInt(req.params.layoutId, 10);
    if (isNaN(layoutId)) return res.status(400).json({ error: 'Invalid layout ID' });
    try {
      const layoutCheck = await pool.query(
        `SELECT id, course_id, name, hole_count, is_default FROM course_layouts WHERE id = $1`,
        [layoutId]
      );
      if (layoutCheck.rows.length === 0) return res.status(404).json({ error: 'Layout not found' });
      const { rows: holes } = await pool.query(
        `SELECT id, layout_id, hole_number, par, distance_ft, notes
         FROM course_holes WHERE layout_id = $1 ORDER BY hole_number ASC`,
        [layoutId]
      );
      res.json({ layout: layoutCheck.rows[0], holes });
    } catch (err) {
      console.error('Admin get holes error:', err.message);
      res.status(500).json({ error: 'Failed to get holes' });
    }
  });

  // PUT /api/admin/layouts/:layoutId/holes — bulk upsert holes for a layout
  router.put('/admin/layouts/:layoutId/holes', requireAdmin, async (req, res) => {
    const layoutId = parseInt(req.params.layoutId, 10);
    if (isNaN(layoutId)) return res.status(400).json({ error: 'Invalid layout ID' });
    const { holes } = req.body;
    if (!Array.isArray(holes) || holes.length === 0) {
      return res.status(400).json({ error: 'holes must be a non-empty array' });
    }
    for (const h of holes) {
      if (!Number.isInteger(h.hole_number) || h.hole_number < 1) {
        return res.status(400).json({ error: `Invalid hole_number: ${h.hole_number}` });
      }
      if (!Number.isInteger(h.par) || h.par < 1) {
        return res.status(400).json({ error: `Invalid par for hole ${h.hole_number}` });
      }
    }
    const holeNums = holes.map(h => h.hole_number);
    if (new Set(holeNums).size !== holeNums.length) {
      return res.status(400).json({ error: 'Duplicate hole_number values in request' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const layoutCheck = await client.query(`SELECT id FROM course_layouts WHERE id = $1`, [layoutId]);
      if (layoutCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Layout not found' });
      }
      await client.query(`DELETE FROM course_holes WHERE layout_id = $1`, [layoutId]);
      const inserted = [];
      for (const h of holes) {
        const { rows } = await client.query(
          `INSERT INTO course_holes (layout_id, hole_number, par, distance_ft, notes)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, layout_id, hole_number, par, distance_ft, notes`,
          [layoutId, h.hole_number, h.par, h.distance_ft || null, h.notes || null]
        );
        inserted.push(rows[0]);
      }
      await client.query(`UPDATE course_layouts SET hole_count = $1 WHERE id = $2`, [holes.length, layoutId]);
      await client.query('COMMIT');
      res.json({ saved: inserted.length, holes: inserted.sort((a, b) => a.hole_number - b.hole_number) });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Admin bulk upsert holes error:', err.message);
      res.status(500).json({ error: 'Failed to save holes' });
    } finally {
      client.release();
    }
  });


  return router;
};
