const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { sanitizeFields } = require('../middleware/security');
const {
  getLevelFromXp,
  getLevelProgress,
  getLevelTitle,
  BADGE_DEFINITIONS,
  BADGE_TIERS,
  TIER_COLORS,
  getSkillTier,
  getSkillTierProgress,
} = require('./xp-engine');
const { getPlayerDistanceStats } = require('./distance-analytics');
const { applyLoginStreak } = require('../services/login-streak');

module.exports = ({ pool }) => {
  const router = express.Router();

  // Register a new player (legacy endpoint — new registrations go through /api/auth/signup)
  router.post('/players', sanitizeFields('display_name'), async (req, res, next) => {
    const { display_name, player_uuid } = req.body;

    if (!display_name || !player_uuid) {
      return res.status(400).json({ error: 'display_name and player_uuid are required' });
    }
    if (display_name.length < 2 || display_name.length > 30) {
      return res.status(400).json({ error: 'Name must be 2-30 characters' });
    }
    if (!/^[a-zA-Z0-9 _-]+$/.test(display_name)) {
      return res.status(400).json({ error: 'Name can only contain letters, numbers, spaces, underscores, and hyphens' });
    }

    try {
      const existing = await pool.query(
        'SELECT id, display_name, xp, level FROM players WHERE player_uuid = $1',
        [player_uuid]
      );
      if (existing.rows.length > 0) {
        const p = existing.rows[0];
        const level = getLevelFromXp(p.xp);
        return res.json({
          id: p.id,
          display_name: p.display_name,
          xp: p.xp,
          level,
          level_progress: getLevelProgress(p.xp),
          level_title: getLevelTitle(level).title,
          already_exists: true
        });
      }

      const result = await pool.query(
        'INSERT INTO players (player_uuid, display_name) VALUES ($1, $2) RETURNING id, display_name, xp, created_at',
        [player_uuid, display_name.trim()]
      );
      const p = result.rows[0];
      const level = getLevelFromXp(p.xp);
      res.status(201).json({
        id: p.id,
        display_name: p.display_name,
        xp: p.xp,
        level,
        level_progress: getLevelProgress(p.xp),
        level_title: getLevelTitle(level).title,
      });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'A player with that name already exists' });
      }
      next(err);
    }
  });

  // GET /api/players/me — full profile with all progression data
  router.get('/players/me', requireAuth(pool), async (req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `SELECT id, player_uuid, display_name, username, email, profile_photo_url,
                xp, level, login_streak, best_streak, battle_wins, battle_losses, win_streak, total_rounds,
                total_birdies, total_aces,
                gold, last_login_date, created_at
         FROM players WHERE id = $1`,
        [req.player.id]
      );
      if (result.rows.length === 0) {
        await client.query('ROLLBACK').catch(() => {});
        return res.status(404).json({ error: 'Player not found' });
      }

      const p = result.rows[0];

      // Daily login-streak update + streak badge grants (mutates p, returns any streak XP).
      const loginXpGranted = await applyLoginStreak(client, p);

      // Fetch real stats from DB (checkins, courses, badges)
      const [checkinStats, badgeCount, recentCheckins] = await Promise.all([
        client.query(
          `SELECT COUNT(*) AS total_checkins, COUNT(DISTINCT course_id) AS unique_courses
           FROM checkins WHERE player_id = $1`,
          [p.id]
        ),
        client.query(
          'SELECT COUNT(*) AS cnt FROM player_badges WHERE player_id = $1',
          [p.id]
        ),
        client.query(
          `SELECT ci.id, ci.checked_in_at, ci.xp_earned, ci.weather_condition, ci.is_round_complete,
                  c.name AS course_name, c.city, c.state
           FROM checkins ci JOIN courses c ON c.id = ci.course_id
           WHERE ci.player_id = $1 ORDER BY ci.checked_in_at DESC LIMIT 5`,
          [p.id]
        ),
      ]);

      const totalCheckins = parseInt(checkinStats.rows[0].total_checkins) || 0;
      const uniqueCourses = parseInt(checkinStats.rows[0].unique_courses) || 0;
      const earnedBadges = parseInt(badgeCount.rows[0].cnt) || 0;

      // Training stats + categories mastered
      const [trainingStatsResult, totalLessonsResult] = await Promise.all([
        client.query(
          `SELECT COUNT(DISTINCT tc.lesson_id) AS lessons_completed
           FROM training_completions tc WHERE tc.player_id = $1`,
          [p.id]
        ),
        client.query('SELECT COUNT(*) AS total FROM training_lessons WHERE is_active IS NOT FALSE'),
      ]);
      const lessonsCompleted = parseInt(trainingStatsResult.rows[0]?.lessons_completed) || 0;
      const totalLessons = parseInt(totalLessonsResult.rows[0]?.total) || 0;
      const trainingStreak = await client.query(
        'SELECT streak_days FROM training_streaks WHERE player_id = $1',
        [p.id]
      );
      const trainingStreakDays = parseInt(trainingStreak.rows[0]?.streak_days) || 0;
      // Categories mastered: count of categories where player completed every lesson
      const categoriesMasteredResult = await client.query(`
        SELECT COUNT(*) AS cnt FROM (
          SELECT l.category_id
          FROM training_lessons l
          JOIN training_categories tc2 ON tc2.id = l.category_id
          JOIN training_completions tc3 ON tc3.lesson_id = l.id AND tc3.player_id = $1
          WHERE l.is_active IS NOT FALSE AND tc2.is_active IS NOT FALSE
          GROUP BY l.category_id
          HAVING COUNT(DISTINCT l.id) = COUNT(DISTINCT tc3.lesson_id)
            AND COUNT(DISTINCT tc3.lesson_id) > 0
        ) sub`,
        [p.id]
      );
      const categoriesMastered = parseInt(categoriesMasteredResult.rows[0]?.cnt) || 0;

      await client.query('COMMIT');

      const level = getLevelFromXp(p.xp);
      const levelProgress = getLevelProgress(p.xp);
      const levelTitle = getLevelTitle(level);
      const skillTier = getSkillTier(p.xp);
      const skillProgress = getSkillTierProgress(p.xp);

      res.json({
        id: p.id,
        display_name: p.display_name,
        username: p.username,
        email: p.email,
        profile_photo_url: p.profile_photo_url,
        xp: p.xp,
        level,
        level_title: levelTitle.title,
        level_title_icon: levelTitle.icon,
        level_progress: levelProgress,
        skill_tier: skillTier,
        skill_tier_progress: skillProgress,
        gold: p.gold || 0,
        login_streak: p.login_streak,
        best_streak: p.best_streak,
        battle_wins: p.battle_wins || 0,
        battle_losses: p.battle_losses || 0,
        win_streak: p.win_streak || 0,
        total_rounds: p.total_rounds || 0,
        created_at: p.created_at,
        login_xp: loginXpGranted,
        badge_count: earnedBadges,
        badges: [],
        training_stats: {
          lessons_completed: lessonsCompleted,
          total_lessons: totalLessons,
          training_streak_days: trainingStreakDays,
          categories_mastered: categoriesMastered,
        },
        stats: {
          total_checkins: totalCheckins,
          unique_courses: uniqueCourses,
          total_rounds: p.total_rounds || 0,
          battle_wins: p.battle_wins || 0,
          total_birdies: p.total_birdies || 0,
          total_aces: p.total_aces || 0,
          login_streak: p.login_streak,
          best_streak: p.best_streak,
          lessons_completed: lessonsCompleted,
          training_streak_days: trainingStreakDays,
          categories_mastered: categoriesMastered,
        },
        recent_checkins: recentCheckins.rows,
        active_challenges: [],
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  });

  // GET /api/players/badges — all badge definitions with player's earned status
  router.get('/players/badges', requireAuth(pool), async (req, res, next) => {
    try {
      const earnedResult = await pool.query(
        'SELECT category, tier, earned_at FROM player_badges WHERE player_id = $1',
        [req.player.id]
      );
      const earnedMap = {};
      for (const row of earnedResult.rows) {
        earnedMap[`${row.category}:${row.tier}`] = row.earned_at;
      }

      const categories = Object.entries(BADGE_DEFINITIONS).map(([category, def]) => ({
        category,
        name: def.name,
        icon: def.icon,
        description: def.description,
        tiers: BADGE_TIERS.map(tier => {
          const key = `${category}:${tier}`;
          const earned = !!earnedMap[key];
          return {
            tier,
            ...def.tiers[tier],
            earned,
            earned_at: earnedMap[key] || null,
            colors: TIER_COLORS[tier],
          };
        }),
      }));

      res.json({ categories });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/players/distance-stats — distance analytics + distance achievements
  router.get('/players/distance-stats', requireAuth(pool), async (req, res, next) => {
    try {
      const stats = await getPlayerDistanceStats(pool, req.player.id);
      res.json(stats);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/players/progress — exploration progress by state/country + earned exploration badges
  // Powers the /progress page. Returns:
  //   - states: [{state, country, visited, total, pct}] sorted by pct desc
  //   - countries: [{country, visited, total, pct}] rollup
  //   - completed_states: names of states where visited === total
  //   - totals: {visited, total, pct}
  //   - badges: player's current badge status for exploration categories
  router.get('/players/progress', requireAuth(pool), async (req, res, next) => {
    try {
      // Per-state visited/total
      const stateResult = await pool.query(`
        SELECT
          c.state,
          COALESCE(c.country, 'US') AS country,
          COUNT(DISTINCT c.id) AS total,
          COUNT(DISTINCT ci.course_id) AS visited
        FROM courses c
        LEFT JOIN checkins ci ON ci.course_id = c.id AND ci.player_id = $1
        WHERE c.is_active IS NOT FALSE
          AND c.state IS NOT NULL AND c.state != ''
        GROUP BY c.state, COALESCE(c.country, 'US')
        ORDER BY COUNT(DISTINCT ci.course_id) DESC, COUNT(DISTINCT c.id) ASC
      `, [req.player.id]);

      const states = stateResult.rows.map(r => ({
        state: r.state,
        country: r.country,
        visited: parseInt(r.visited),
        total: parseInt(r.total),
        pct: parseInt(r.total) > 0 ? Math.round((parseInt(r.visited) / parseInt(r.total)) * 100) : 0,
      }));

      // Country-level rollup
      const countryMap = {};
      for (const s of states) {
        const c = s.country;
        if (!countryMap[c]) countryMap[c] = { country: c, visited: 0, total: 0 };
        countryMap[c].visited += s.visited;
        countryMap[c].total += s.total;
      }
      const countries = Object.values(countryMap).map(c => ({
        ...c,
        pct: c.total > 0 ? Math.round((c.visited / c.total) * 100) : 0,
      })).sort((a, b) => b.visited - a.visited);

      // Completed states (visited all courses)
      const completedStates = states.filter(s => s.total > 0 && s.visited === s.total).map(s => s.state);

      // Global totals
      const totalVisited = states.reduce((sum, s) => sum + s.visited, 0);
      const totalCourses = states.reduce((sum, s) => sum + s.total, 0);

      // Exploration badges earned by this player
      const badgeResult = await pool.query(
        `SELECT category, tier, earned_at FROM player_badges
         WHERE player_id = $1 AND category IN ('explorer', 'traveler', 'state_champion', 'course_conqueror')
         ORDER BY earned_at ASC`,
        [req.player.id]
      );

      res.json({
        states,
        countries,
        completed_states: completedStates,
        totals: {
          visited: totalVisited,
          total: totalCourses,
          pct: totalCourses > 0 ? Math.round((totalVisited / totalCourses) * 100) : 0,
        },
        badges: badgeResult.rows,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/players/leaderboard — global XP leaderboard
  router.get('/players/leaderboard', async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT p.id, p.display_name, p.xp, p.level,
                COUNT(ci.id) AS total_checkins,
                COUNT(DISTINCT ci.course_id) AS unique_courses,
                COUNT(pb.id) AS badge_count
         FROM players p
         LEFT JOIN checkins ci ON ci.player_id = p.id
         LEFT JOIN player_badges pb ON pb.player_id = p.id
         GROUP BY p.id, p.display_name, p.xp, p.level
         ORDER BY p.xp DESC
         LIMIT 100`
      );
      res.json({ leaderboard: result.rows });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/players/xp-history — player's XP transaction history with breakdown
  // Returns recent transactions + source breakdown + training streak info
  router.get('/players/xp-history', requireAuth(pool), async (req, res, next) => {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    try {
      // Recent transactions
      const result = await pool.query(
        `SELECT id, event_type, xp_amount, metadata, created_at,
                COALESCE(source, 'unknown') AS source
         FROM xp_transactions
         WHERE player_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [req.player.id, limit]
      );

      // Source breakdown
      const breakdown = await pool.query(
        `SELECT
           COALESCE(source, 'other') AS source,
           COUNT(*) AS count,
           SUM(xp_amount) AS total_xp
         FROM xp_transactions
         WHERE player_id = $1
         GROUP BY COALESCE(source, 'other')
         ORDER BY total_xp DESC`,
        [req.player.id]
      );

      // Training streak
      const streak = await pool.query(
        'SELECT streak_days, last_date FROM training_streaks WHERE player_id = $1',
        [req.player.id]
      );

      // Training stats
      const trainingStats = await pool.query(`
        SELECT
          COUNT(DISTINCT tc.lesson_id) AS lessons_completed,
          COUNT(DISTINCT l.category_id) AS categories_started,
          SUM(l.xp_reward) AS total_lesson_xp
        FROM training_completions tc
        JOIN training_lessons l ON l.id = tc.lesson_id
        WHERE tc.player_id = $1
      `, [req.player.id]);

      // Milestones achieved (from xp_transactions event types)
      const milestones = await pool.query(`
        SELECT DISTINCT ON (event_type) event_type, created_at
        FROM xp_transactions
        WHERE player_id = $1
          AND (event_type LIKE 'milestone_%' OR event_type LIKE 'training_category%')
        ORDER BY event_type, created_at ASC
      `, [req.player.id]);

      // XP earned this week
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekXp = await pool.query(
        `SELECT COALESCE(SUM(xp_amount), 0) AS weekly_xp
         FROM xp_transactions
         WHERE player_id = $1 AND created_at >= $2`,
        [req.player.id, weekStart.toISOString()]
      );

      // Next tier info
      const playerXp = (await pool.query('SELECT xp FROM players WHERE id = $1', [req.player.id])).rows[0]?.xp || 0;
      const skillProgress = getSkillTierProgress(playerXp);

      res.json({
        transactions: result.rows,
        breakdown: breakdown.rows.map(r => ({
          source: r.source,
          count: parseInt(r.count),
          total_xp: parseInt(r.total_xp),
        })),
        training_streak: streak.rows[0] || null,
        training_stats: {
          lessons_completed: parseInt(trainingStats.rows[0]?.lessons_completed) || 0,
          categories_started: parseInt(trainingStats.rows[0]?.categories_started) || 0,
          total_lesson_xp: parseInt(trainingStats.rows[0]?.total_lesson_xp) || 0,
        },
        milestones: milestones.rows.map(r => ({ event: r.event_type, date: r.created_at })),
        weekly_xp: parseInt(weekXp.rows[0]?.weekly_xp) || 0,
        skill_progress: skillProgress,
      });
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/players/me — update profile fields
  router.put('/players/me', requireAuth(pool), sanitizeFields('display_name'), async (req, res, next) => {
    const { display_name, username } = req.body;

    const updates = [];
    const values = [];
    let paramIdx = 1;

    if (display_name !== undefined) {
      if (display_name.length < 2 || display_name.length > 30) {
        return res.status(400).json({ error: 'Display name must be 2-30 characters' });
      }
      updates.push(`display_name = $${paramIdx++}`);
      values.push(display_name.trim());
    }

    if (username !== undefined) {
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
        return res.status(400).json({ error: 'Username must be 3-20 characters: letters, numbers, underscores only' });
      }
      const conflict = await pool.query(
        'SELECT id FROM players WHERE username = $1 AND id != $2',
        [username.toLowerCase(), req.player.id]
      );
      if (conflict.rows.length > 0) {
        return res.status(409).json({ error: 'That username is already taken' });
      }
      updates.push(`username = $${paramIdx++}`);
      values.push(username.toLowerCase());
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.player.id);
    try {
      const result = await pool.query(
        `UPDATE players SET ${updates.join(', ')} WHERE id = $${paramIdx}
         RETURNING id, display_name, username, email, profile_photo_url, xp, level`,
        values
      );
      const p = result.rows[0];
      const level = getLevelFromXp(p.xp);
      res.json({
        id: p.id,
        display_name: p.display_name,
        username: p.username,
        email: p.email,
        profile_photo_url: p.profile_photo_url,
        xp: p.xp,
        level,
        level_progress: getLevelProgress(p.xp),
        level_title: getLevelTitle(level).title,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/players/reset-progress — reset all player stats, gold, XP, and vault items to blank slate
  // Preserves: name, email, username, avatar, password hash, created_at, auth fields
  router.post('/players/reset-progress', requireAuth(pool), async (req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const playerId = req.player.id;

      // Log before counts for verification
      const beforeCounts = {};
      const tablesToCheck = [
        'xp_transactions', 'gold_transactions', 'player_badges', 'player_challenges',
        'player_inventory', 'active_boosts', 'training_streaks', 'training_completions',
        'player_daily_challenges', 'quest_progression', 'player_vault_training_unlocks', 'player_achievements',
      ];
      for (const table of tablesToCheck) {
        const r = await client.query(`SELECT COUNT(*) FROM ${table} WHERE player_id = $1`, [playerId]);
        beforeCounts[table] = parseInt(r.rows[0].count);
      }

      // Wipe all player-scoped rows across the tables audited above (same list,
      // so the delete set and verification set can never drift apart).
      for (const table of tablesToCheck) {
        await client.query(`DELETE FROM ${table} WHERE player_id = $1`, [playerId]);
      }

      // Reset player stats to zero (preserving credentials)
      await client.query(
        `UPDATE players SET
           xp = 0,
           gold = 0,
           level = 1,
           login_streak = 0,
           best_streak = 0,
           battle_wins = 0,
           battle_losses = 0,
           win_streak = 0,
           total_rounds = 0,
           total_birdies = 0,
           total_aces = 0,
           training_streak_days = 0,
           training_streak_last_date = NULL,
           last_login_date = NULL
         WHERE id = $1`,
        [playerId]
      );

      await client.query('COMMIT');

      // Verification queries — run after COMMIT, log to console
      const afterCounts = {};
      for (const table of tablesToCheck) {
        const r = await client.query(`SELECT COUNT(*) FROM ${table} WHERE player_id = $1`, [playerId]);
        afterCounts[table] = parseInt(r.rows[0].count);
      }

      const playerRow = await client.query('SELECT xp, gold, level FROM players WHERE id = $1', [playerId]);
      const p = playerRow.rows[0];

      console.log('[reset-progress] Before counts:', beforeCounts);
      console.log('[reset-progress] After counts:', afterCounts);
      console.log('[reset-progress] Player final state:', { xp: p.xp, gold: p.gold, level: p.level });

      // Assert all after counts are zero
      const failures = Object.entries(afterCounts).filter(([, v]) => v !== 0);
      if (failures.length > 0) {
        console.error('[reset-progress] VERIFICATION FAILED — non-zero counts:', failures);
      }

      res.json({
        success: true,
        message: 'Progress reset complete',
        verification: {
          xp_transactions: afterCounts.xp_transactions,
          gold_transactions: afterCounts.gold_transactions,
          player_badges: afterCounts.player_badges,
          player_challenges: afterCounts.player_challenges,
          player_inventory: afterCounts.player_inventory,
          active_boosts: afterCounts.active_boosts,
          training_streaks: afterCounts.training_streaks,
          training_completions: afterCounts.training_completions,
          player_daily_challenges: afterCounts.player_daily_challenges,
          quest_progression: afterCounts.quest_progression,
          player_vault_training_unlocks: afterCounts.player_vault_training_unlocks,
          player_achievements: afterCounts.player_achievements,
          player: { xp: p.xp, gold: p.gold, level: p.level },
        },
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  });

  return router;
};
