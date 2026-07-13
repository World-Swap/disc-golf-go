// routes/training.js — Training content library and XP completion system.
// Owns: categories, lessons, completions, progress tracking.
// Does NOT own: XP engine (xp-engine.js), quest system (story.js), rounds/battles.

const express = require('express');
const { requireAuth, requireGuestAuth } = require('../middleware/auth');

// pg DATE columns (OID 1082) are returned as JS Date objects; comparing them
// to plain date strings with === always evaluates false, breaking streak logic.
function toDateStr(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  return String(val).slice(0, 10);
}

// story.js exports a router function plus standalone mission helpers.
// Lazy require to avoid circular dependency.
let _storyHelpers = null;
function storyHelpers() {
  if (!_storyHelpers) {
    const story = require('./story');
    _storyHelpers = {
      checkMissionsFromTraining: story.checkMissionsFromTraining,
      advanceDailyChallenge: story.advanceDailyChallenge,
    };
  }
  return _storyHelpers;
}

module.exports = ({ pool }) => {
  const router = express.Router();

  // Auth helper — accepts JWT or guest_uuid header
  async function getPlayerId(req) {
    const authHeader = req.headers.authorization;
    const guestUuid = req.headers['x-guest-uuid'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const { JWT_SECRET } = require('../middleware/auth');
      const jwt = require('jsonwebtoken');
      const token = authHeader.slice(7);
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded && decoded.id) return decoded.id;
      } catch (err) {
        console.warn('[training] JWT verify failed for authenticated request:', err.message);
        return null;
      }
    } else {
      // No Authorization header — expected for guests; fall through to guest_uuid check below
    }
    if (guestUuid) {
      const r = await pool.query('SELECT id FROM players WHERE guest_uuid = $1 LIMIT 1', [guestUuid]);
      if (r.rows.length) return r.rows[0].id;
    }
    return null;
  }

  // GET /api/training/categories
  // Returns active categories with lesson count + user completion count.
  // Supports ?level= filter (beginner|intermediate|advanced|all_levels).
  // No auth required — public browse.
  router.get('/training/categories', async (req, res) => {
    try {
      const playerId = await getPlayerId(req);
      const levelFilter = req.query.level;
      const validLevels = ['beginner', 'intermediate', 'advanced', 'all_levels'];
      const useLevelFilter = levelFilter && validLevels.includes(levelFilter);

      // Query categories — optionally filter to only show categories with lessons at the given level
      const categories = useLevelFilter
        ? await pool.query(`
          SELECT
            c.id, c.name, c.slug, c.description, c.icon, c.skill_level,
            COUNT(l.id) AS lesson_count,
            c.sort_order
          FROM training_categories c
          LEFT JOIN training_lessons l ON l.category_id = c.id AND l.is_active = true AND l.skill_level = $1
          WHERE c.is_active = true
          GROUP BY c.id
          HAVING COUNT(l.id) > 0
          ORDER BY c.sort_order ASC
        `, [levelFilter])
        : await pool.query(`
          SELECT
            c.id, c.name, c.slug, c.description, c.icon, c.skill_level,
            COUNT(l.id) AS lesson_count,
            c.sort_order
          FROM training_categories c
          LEFT JOIN training_lessons l ON l.category_id = c.id AND l.is_active = true
          WHERE c.is_active = true
          GROUP BY c.id
          ORDER BY c.sort_order ASC
        `);

      if (!playerId) {
        return res.json({
          categories: categories.rows.map(c => ({
            ...c,
            lesson_count: parseInt(c.lesson_count),
            completed_count: 0,
          })),
        });
      }

      const completions = await pool.query(`
        SELECT tl.category_id, COUNT(*) AS completed_count
        FROM training_completions tc
        JOIN training_lessons tl ON tl.id = tc.lesson_id
        WHERE tc.player_id = $1 AND tl.is_active = true
        GROUP BY tl.category_id
      `, [playerId]);

      const completionMap = {};
      for (const row of completions.rows) {
        completionMap[row.category_id] = parseInt(row.completed_count);
      }

      res.json({
        categories: categories.rows.map(c => ({
          ...c,
          lesson_count: parseInt(c.lesson_count),
          completed_count: completionMap[c.id] || 0,
        })),
      });
    } catch (err) {
      console.error('[training] GET /categories error:', err.message);
      res.status(500).json({ error: 'Failed to load training categories' });
    }
  });

  // GET /api/training/categories/:slug/lessons
  // Returns lessons for a category with user completion status.
  router.get('/training/categories/:slug/lessons', async (req, res) => {
    try {
      const { slug } = req.params;
      const playerId = await getPlayerId(req);
      const levelFilter = req.query.level;
      const validLevels = ['beginner', 'intermediate', 'advanced', 'all_levels'];
      const useLevelFilter = levelFilter && validLevels.includes(levelFilter);

      const cat = await pool.query(
        'SELECT id, name, slug, description, icon, skill_level FROM training_categories WHERE slug = $1 AND is_active = true',
        [slug]
      );
      if (!cat.rows.length) return res.status(404).json({ error: 'Category not found' });

      const lessonsQuery = useLevelFilter
        ? pool.query(`
          SELECT
            l.id, l.title, l.slug, l.description, l.difficulty,
            l.xp_reward, l.sort_order, l.content_type, l.skill_level
          FROM training_lessons l
          WHERE l.category_id = $1 AND l.is_active = true AND l.skill_level = $2
          ORDER BY l.sort_order ASC
        `, [cat.rows[0].id, levelFilter])
        : pool.query(`
          SELECT
            l.id, l.title, l.slug, l.description, l.difficulty,
            l.xp_reward, l.sort_order, l.content_type, l.skill_level
          FROM training_lessons l
          WHERE l.category_id = $1 AND l.is_active = true
          ORDER BY l.sort_order ASC
        `, [cat.rows[0].id]);

      const lessons = await lessonsQuery;

      let completed = new Set();
      if (playerId) {
        const done = await pool.query(
          'SELECT lesson_id FROM training_completions WHERE player_id = $1 AND lesson_id = ANY($2)',
          [playerId, lessons.rows.map(l => l.id)]
        );
        completed = new Set(done.rows.map(r => r.lesson_id));
      }

      res.json({
        category: cat.rows[0],
        lessons: lessons.rows.map(l => ({
          ...l,
          completed: completed.has(l.id),
        })),
        level_filter: useLevelFilter ? levelFilter : null,
      });
    } catch (err) {
      console.error('[training] GET /categories/:slug/lessons error:', err.message);
      res.status(500).json({ error: 'Failed to load lessons' });
    }
  });

  // GET /api/training/lessons/:id
  // Returns full lesson content and marks it as viewed (analytics only — no XP awarded here).
  router.get('/training/lessons/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const playerId = await getPlayerId(req);

      const lesson = await pool.query(`
        SELECT l.*, c.name AS category_name, c.slug AS category_slug, c.skill_level AS category_skill_level
        FROM training_lessons l
        JOIN training_categories c ON c.id = l.category_id
        WHERE l.id = $1 AND l.is_active = true
      `, [id]);

      if (!lesson.rows.length) return res.status(404).json({ error: 'Lesson not found' });

      const row = lesson.rows[0];
      let isCompleted = false;
      if (playerId) {
        const comp = await pool.query(
          'SELECT 1 FROM training_completions WHERE player_id = $1 AND lesson_id = $2',
          [playerId, id]
        );
        isCompleted = comp.rows.length > 0;
      }

      // Next lesson in same category
      const next = await pool.query(`
        SELECT id, title, slug, difficulty, xp_reward
        FROM training_lessons
        WHERE category_id = $1 AND sort_order > $2 AND is_active = true
        ORDER BY sort_order ASC
        LIMIT 1
      `, [row.category_id, row.sort_order]);

      res.json({
        ...row,
        is_completed: isCompleted,
        next_lesson: next.rows[0] || null,
      });
    } catch (err) {
      console.error('[training] GET /lessons/:id error:', err.message);
      res.status(500).json({ error: 'Failed to load lesson' });
    }
  });

  // GET /api/training/lessons/:id/resources
  // Returns external reading resources for a lesson. Public read, no auth required.
  router.get('/training/lessons/:id/resources', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query(`
        SELECT id, lesson_id, title, url, author, credentials, resource_type, notes, display_order
        FROM lesson_resources
        WHERE lesson_id = $1
        ORDER BY display_order ASC, created_at ASC
      `, [id]);
      res.json(result.rows);
    } catch (err) {
      console.error('[training] GET /lessons/:id/resources error:', err.message);
      res.status(500).json({ error: 'Failed to load resources' });
    }
  });

  // POST /api/training/completions
  // Marks a lesson complete for the current user, awards XP (once per lesson).
  // Awards: lesson XP + category completion bonus (if all done) + streak bonus (3+ days).
  // Idempotent — if already completed, returns success without re-awarding XP.
  router.post('/training/completions', async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const playerId = await getPlayerId(req);
      if (!playerId) {
        await client.query('ROLLBACK');
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { lesson_id } = req.body;
      if (!lesson_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'lesson_id is required' });
      }

      // Load lesson
      const lesson = await client.query(
        `SELECT l.id, l.category_id, l.xp_reward, l.title,
                c.slug AS category_slug
         FROM training_lessons l
         JOIN training_categories c ON c.id = l.category_id
         WHERE l.id = $1 AND l.is_active = true`,
        [lesson_id]
      );
      if (!lesson.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Lesson not found' });
      }

      const lr = lesson.rows[0];
      const xpReward = parseInt(lr.xp_reward);
      const categoryId = lr.category_id;

      // Check if already completed (idempotent)
      const existing = await client.query(
        'SELECT id FROM training_completions WHERE player_id = $1 AND lesson_id = $2',
        [playerId, lesson_id]
      );

      let awardedXp = 0;
      let bonusXp = 0;
      let bonusReason = null;
      let streakDays = 0;
      let categoryCompleteBonus = 0;

      if (existing.rows.length === 0) {
        // Insert completion
        await client.query(
          'INSERT INTO training_completions (player_id, lesson_id) VALUES ($1, $2)',
          [playerId, lesson_id]
        );
        awardedXp = xpReward;

        // ── Update training streak ─────────────────────────────────────────────────
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        await client.query('SAVEPOINT streak_update');
        try {
          const streakRow = await client.query(
            'SELECT streak_days, last_date FROM training_streaks WHERE player_id = $1 FOR UPDATE',
            [playerId]
          );
          let newStreak = 1;
          if (streakRow.rows.length) {
            const { streak_days: lastDays } = streakRow.rows[0];
            const lastDate = toDateStr(streakRow.rows[0].last_date);
            if (lastDate === yesterday) {
              newStreak = (lastDays || 0) + 1;
            } else if (lastDate === today) {
              // Already completed a lesson today — streak unchanged
              newStreak = lastDays || 1;
            }
            // else: streak broken, start fresh at 1
          }
          await client.query(`
            INSERT INTO training_streaks (player_id, streak_days, last_date, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (player_id) DO UPDATE SET
              streak_days = EXCLUDED.streak_days,
              last_date = EXCLUDED.last_date,
              updated_at = NOW()
          `, [playerId, newStreak, today]);
          await client.query('UPDATE players SET training_streak_days = $1, training_streak_last_date = $2 WHERE id = $3', [newStreak, today, playerId]);
          streakDays = newStreak;
          await client.query('RELEASE SAVEPOINT streak_update');
        } catch (e) {
          await client.query('ROLLBACK TO SAVEPOINT streak_update');
        }

        // ── Streak bonus XP (3+ days) ─────────────────────────────────────────────
        if (streakDays >= 3) {
          const streakBonus = 25;
          bonusXp += streakBonus;
          bonusReason = (bonusReason ? bonusReason + ', ' : '') + 'streak_' + streakDays;
          await client.query(
            'INSERT INTO xp_transactions (player_id, event_type, xp_amount, metadata, source) VALUES ($1, $2, $3, $4, $5)',
            [playerId, 'training_streak_' + streakDays, streakBonus, JSON.stringify({ streak_days: streakDays }), 'training_streak']
          );
        }

        // ── Award base lesson XP ───────────────────────────────────────────────────
        await client.query('UPDATE players SET xp = xp + $1 WHERE id = $2', [xpReward, playerId]);
        await client.query(
          'INSERT INTO xp_transactions (player_id, event_type, xp_amount, metadata, source) VALUES ($1, $2, $3, $4, $5)',
          [playerId, 'training_completion', xpReward, JSON.stringify({ lesson_id, lesson_title: lr.title }), 'training']
        );
        // Also write xp_log for quest system compatibility
        await client.query(
          'INSERT INTO xp_log (player_id, source, amount, context) VALUES ($1, $2, $3, $4)',
          [playerId, 'training_completion', xpReward, JSON.stringify({ lesson_id, lesson_title: lr.title })]
        );

        // ── Category completion bonus (all lessons in category done) ────────────────
        await client.query('SAVEPOINT cat_check');
        try {
          const catTotal = await client.query(
            'SELECT COUNT(*) AS cnt FROM training_lessons WHERE category_id = $1 AND is_active = true',
            [categoryId]
          );
          const catDone = await client.query(`
            SELECT COUNT(*) AS cnt FROM training_completions tc
            JOIN training_lessons l ON l.id = tc.lesson_id
            WHERE tc.player_id = $1 AND l.category_id = $2
          `, [playerId, categoryId]);
          const total = parseInt(catTotal.rows[0].cnt);
          const done = parseInt(catDone.rows[0].cnt);
          // Award category completion bonus when the lesson just completed fills the last gap
          if (done === total && total > 0) {
            categoryCompleteBonus = 100;
            bonusXp += categoryCompleteBonus;
            await client.query(
              'INSERT INTO xp_transactions (player_id, event_type, xp_amount, metadata, source) VALUES ($1, $2, $3, $4, $5)',
              [playerId, 'training_category_complete', categoryCompleteBonus, JSON.stringify({ category_id: categoryId }), 'training']
            );
          }
          await client.query('RELEASE SAVEPOINT cat_check');
        } catch (e) {
          await client.query('ROLLBACK TO SAVEPOINT cat_check');
        }

        // ── Milestone check (inside the completion transaction) ─────────────────
        await client.query('SAVEPOINT milestone_check');
        try {
          const totalCompleted = await client.query(`
            SELECT COUNT(*) AS cnt FROM training_completions tc
            JOIN training_lessons tl ON tl.id = tc.lesson_id
            WHERE tc.player_id = $1 AND tl.is_active = true
          `, [playerId]);
          const total = parseInt(totalCompleted.rows[0].cnt);

          for (const def of MILESTONE_DEFS) {
            if (total === def.trigger) {
              const mr = await client.query(`
                INSERT INTO training_milestones (player_id, milestone_key, reward_gold)
                VALUES ($1, $2, $3)
                ON CONFLICT (player_id, milestone_key) DO NOTHING
                RETURNING milestone_key
              `, [playerId, def.key, def.gold]);
              if (mr.rows.length && def.gold > 0) {
                await client.query('UPDATE players SET gold = gold + $1 WHERE id = $2', [def.gold, playerId]);
              }
            }
          }

          // Category completion milestones
          const catCheck = await client.query(`
            SELECT c.slug, c.name,
              COUNT(l.id) AS total_lessons,
              COUNT(tc.id) AS completed
            FROM training_categories c
            LEFT JOIN training_lessons l ON l.category_id = c.id AND l.is_active = true
            LEFT JOIN training_completions tc ON tc.lesson_id = l.id AND tc.player_id = $1
            WHERE c.is_active = true
            GROUP BY c.id
          `, [playerId]);
          for (const c of catCheck.rows) {
            if (parseInt(c.completed) === parseInt(c.total_lessons) && parseInt(c.total_lessons) > 0) {
              const mr2 = await client.query(`
                INSERT INTO training_milestones (player_id, milestone_key, reward_gold)
                VALUES ($1, $2, 50)
                ON CONFLICT (player_id, milestone_key) DO NOTHING
                RETURNING milestone_key
              `, [playerId, 'cat_complete_' + c.slug]);
              if (mr2.rows.length) {
                await client.query('UPDATE players SET gold = gold + 50 WHERE id = $1', [playerId]);
              }
            }
          }
          await client.query('RELEASE SAVEPOINT milestone_check');
        } catch (e) {
          await client.query('ROLLBACK TO SAVEPOINT milestone_check');
        }
      }

      // Get updated player XP
      const stats = await client.query('SELECT xp FROM players WHERE id = $1', [playerId]);

      await client.query('COMMIT');

      // Fire Training Mission triggers (after commit, non-blocking)
      if (existing.rows.length === 0) {
        const lessonData = {
          lesson_id: parseInt(lesson_id),
          category_slug: lr.category_slug || null,
          xp_reward: xpReward,
        };
        const sh = storyHelpers();
        sh.checkMissionsFromTraining(pool, playerId, lessonData).catch(err => {
          console.error('[training] checkMissionsFromTraining error:', err.message);
        });
        sh.advanceDailyChallenge(pool, playerId, new Date().toISOString().split('T')[0], 1).catch(err => {
          console.error('[training] advanceDailyChallenge error:', err.message);
        });
      }

      res.json({
        success: true,
        already_completed: existing.rows.length > 0,
        xp_awarded: awardedXp,
        bonus_xp: bonusXp,
        bonus_reason: bonusReason,
        streak_days: streakDays,
        category_complete_bonus: categoryCompleteBonus,
        current_xp: stats.rows[0]?.xp || 0,
        lesson_title: lr.title,
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[training] POST /completions error:', err.message);
      res.status(500).json({ error: 'Failed to mark lesson complete' });
    } finally {
      client.release();
    }
  });

  // POST /api/training/completions/:id/share
  // Awards 10 XP bonus for sharing a lesson completion on Twitter.
  // Idempotent — checks for existing training_share record before awarding.
  router.post('/training/completions/:id/share', async (req, res) => {
    try {
      const playerId = await getPlayerId(req);
      if (!playerId) return res.status(401).json({ error: 'Authentication required' });

      const lessonId = parseInt(req.params.id);
      if (!lessonId) return res.status(400).json({ error: 'Invalid lesson ID' });

      // Verify lesson exists
      const lesson = await pool.query(
        'SELECT id, title FROM training_lessons WHERE id = $1 AND is_active = true',
        [lessonId]
      );
      if (!lesson.rows.length) return res.status(404).json({ error: 'Lesson not found' });

      // Verify player has completed this lesson
      const comp = await pool.query(
        'SELECT id FROM training_completions WHERE player_id = $1 AND lesson_id = $2',
        [playerId, lessonId]
      );
      if (!comp.rows.length) return res.status(403).json({ error: 'Lesson not yet completed' });

      // Idempotency — check for existing share award
      const existing = await pool.query(
        "SELECT id FROM xp_transactions WHERE player_id = $1 AND event_type = 'training_share' AND source = 'training_share' AND metadata::jsonb->>'lesson_id' = $2",
        [playerId, String(lessonId)]
      );
      if (existing.rows.length) {
        return res.json({ shared: false, already_shared: true });
      }

      // Award 10 XP
      const xpBonus = 10;
      await pool.query('UPDATE players SET xp = xp + $1 WHERE id = $2', [xpBonus, playerId]);
      await pool.query(
        'INSERT INTO xp_transactions (player_id, event_type, xp_amount, metadata, source) VALUES ($1, $2, $3, $4, $5)',
        [playerId, 'training_share', xpBonus, JSON.stringify({ lesson_id: lessonId, lesson_title: lesson.rows[0].title }), 'training_share']
      );
      await pool.query(
        'INSERT INTO xp_log (player_id, source, amount, context) VALUES ($1, $2, $3, $4)',
        [playerId, 'training_share', xpBonus, JSON.stringify({ lesson_id: lessonId, lesson_title: lesson.rows[0].title })]
      );

      res.json({ shared: true, xp_bonus: xpBonus });
    } catch (err) {
      console.error('[training] POST /completions/:id/share error:', err.message);
      res.status(500).json({ error: 'Failed to record share' });
    }
  });

  // GET /api/training/recommendations
  // Returns personalized training recommendations based on skill tier and progress.
  // Recommendations surface: next lessons, category focus, and tier-appropriate content.
  router.get('/training/recommendations', async (req, res) => {
    try {
      const playerId = await getPlayerId(req);
      if (!playerId) return res.status(401).json({ error: 'Authentication required' });

      // Player XP + skill tier
      const playerResult = await pool.query(
        'SELECT xp, training_streak_days FROM players WHERE id = $1',
        [playerId]
      );
      if (!playerResult.rows.length) return res.status(404).json({ error: 'Player not found' });

      const xp = playerResult.rows[0].xp;
      const streakDays = playerResult.rows[0].training_streak_days || 0;

      // Derive skill tier
      let skillTier = 'rookie';
      if (xp >= 5000) skillTier = 'pro';
      else if (xp >= 2000) skillTier = 'advanced';
      else if (xp >= 500) skillTier = 'player';

      // Completed lessons
      const completedResult = await pool.query(
        'SELECT lesson_id FROM training_completions WHERE player_id = $1',
        [playerId]
      );
      const completedIds = new Set(completedResult.rows.map(r => r.lesson_id));

      // Category progress (completion %)
      const catProgress = await pool.query(`
        SELECT
          c.id, c.name, c.slug, c.icon, c.description,
          COUNT(l.id) AS total_lessons,
          COUNT(tc.id) AS completed_lessons,
          ROUND(
            COUNT(tc.id)::numeric / NULLIF(COUNT(l.id), 0) * 100,
            0
          )::int AS pct_complete
        FROM training_categories c
        LEFT JOIN training_lessons l ON l.category_id = c.id AND l.is_active = true
        LEFT JOIN training_completions tc ON tc.lesson_id = l.id AND tc.player_id = $1
        WHERE c.is_active = true
        GROUP BY c.id
        ORDER BY pct_complete ASC NULLS FIRST, c.sort_order ASC
      `, [playerId]);

      // Find next incomplete lessons per category (one per category)
      const incompletePerCategory = [];
      for (const cat of catProgress.rows) {
        if ((cat.pct_complete || 0) >= 100) continue; // skip completed
        const lessons = await pool.query(`
          SELECT l.id, l.title, l.slug, l.difficulty, l.xp_reward, l.description,
                 l.content_type
          FROM training_lessons l
          WHERE l.category_id = $1 AND l.is_active = true
            AND l.id NOT IN (SELECT lesson_id FROM training_completions WHERE player_id = $2)
          ORDER BY l.sort_order ASC
          LIMIT 1
        `, [cat.id, playerId]);
        if (lessons.rows.length) {
          incompletePerCategory.push({
            category_id: cat.id,
            category_name: cat.name,
            category_slug: cat.slug,
            category_icon: cat.icon,
            pct_complete: cat.pct_complete || 0,
            next_lesson: lessons.rows[0],
          });
        }
      }

      // Tier-appropriate messaging
      const tierMessages = {
        rookie: [
          { type: 'tip', title: 'Start with the basics', body: 'Form & Technique covers grip, stance, and follow-through — the foundation of every great throw.' },
          { type: 'tip', title: 'Choose your first disc', body: 'Start with a putter or midrange. Fairway drivers come later.' },
          { type: 'action', title: 'Complete 3 lessons this week', body: 'Build a daily habit. Each lesson unlocks 10–15 XP.' },
        ],
        player: [
          { type: 'tip', title: 'Fill in the gaps', body: 'Finish all lessons in your least-completed category before moving on.' },
          { type: 'tip', title: 'Apply what you learn', body: 'Your Form & Technique training shows on the course — track your round scores to see progress.' },
          { type: 'action', title: 'Challenge: 3 lessons in 7 days', body: 'A week of consistent training pushes you to Advanced tier.' },
        ],
        advanced: [
          { type: 'tip', title: 'Master the细节', body: 'You know the basics. Now focus on consistency under pressure.' },
          { type: 'tip', title: 'Track your weak spots', body: 'Review your round stats to find which hole types cost you strokes — then revisit that lesson.' },
          { type: 'action', title: 'Share your knowledge', body: 'Help a buddy who is just starting out. Teaching reinforces learning.' },
        ],
        pro: [
          { type: 'tip', title: 'Fine-tune your game', body: 'Review your tournament rounds. Which situations cost you the most strokes?' },
          { type: 'tip', title: 'Stay sharp', body: 'Even at Pro level, daily practice keeps your form locked in. One lesson a day maintains your edge.' },
          { type: 'action', title: 'Compete in crew wars', body: 'Test your skills in crew battles. The pressure of competition reveals what to work on.' },
        ],
      };

      // Build recommendations
      const recommendations = [];

      // 1. Top recommended lesson: first incomplete lesson across all categories
      const topLesson = await pool.query(`
        SELECT l.id, l.title, l.slug, l.difficulty, l.xp_reward, l.description, l.content_type,
               c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon
        FROM training_lessons l
        JOIN training_categories c ON c.id = l.category_id
        WHERE l.is_active = true
          AND l.id NOT IN (SELECT lesson_id FROM training_completions WHERE player_id = $1)
          AND l.difficulty IN ('beginner', 'intermediate')
        ORDER BY
          CASE l.difficulty WHEN 'beginner' THEN 1 WHEN 'intermediate' THEN 2 ELSE 3 END,
          l.sort_order ASC
        LIMIT 1
      `, [playerId]);

      if (topLesson.rows.length) {
        const l = topLesson.rows[0];
        recommendations.push({
          reason: 'Start here',
          priority: 1,
          type: 'lesson',
          lesson: {
            id: l.id,
            title: l.title,
            slug: l.slug,
            difficulty: l.difficulty,
            xp_reward: l.xp_reward,
            content_type: l.content_type,
            category_name: l.category_name,
            category_slug: l.category_slug,
            category_icon: l.category_icon,
          },
        });
      }

      // 2. Focus category: lowest-completion category with incomplete lessons
      const focusCat = incompletePerCategory.find(c => c.pct_complete < 100);
      if (focusCat) {
        recommendations.push({
          reason: 'Keep momentum going',
          priority: 2,
          type: 'category_focus',
          category: {
            id: focusCat.category_id,
            name: focusCat.category_name,
            slug: focusCat.category_slug,
            icon: focusCat.category_icon,
            pct_complete: focusCat.pct_complete,
          },
          next_lesson: focusCat.next_lesson,
        });
      }

      // 3. Advanced content if tier permits
      if (skillTier === 'advanced' || skillTier === 'pro') {
        const advancedLesson = await pool.query(`
          SELECT l.id, l.title, l.slug, l.difficulty, l.xp_reward, l.description, l.content_type,
                 c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon
          FROM training_lessons l
          JOIN training_categories c ON c.id = l.category_id
          WHERE l.is_active = true
            AND l.difficulty = 'advanced'
            AND l.id NOT IN (SELECT lesson_id FROM training_completions WHERE player_id = $1)
          ORDER BY l.sort_order ASC
          LIMIT 1
        `, [playerId]);
        if (advancedLesson.rows.length) {
          const l = advancedLesson.rows[0];
          recommendations.push({
            reason: 'Time for advanced content',
            priority: 3,
            type: 'lesson',
            lesson: {
              id: l.id,
              title: l.title,
              slug: l.slug,
              difficulty: l.difficulty,
              xp_reward: l.xp_reward,
              content_type: l.content_type,
              category_name: l.category_name,
              category_slug: l.category_slug,
              category_icon: l.category_icon,
            },
          });
        }
      }

      // 4. Tier messages
      const messages = tierMessages[skillTier] || tierMessages.rookie;

      res.json({
        skill_tier: skillTier,
        skill_tier_icon: { rookie: '🥏', player: '⛳', advanced: '🎯', pro: '🥇' }[skillTier],
        streak_days: streakDays,
        recommendations,
        tier_messages: messages,
        categories: catProgress.rows.map(c => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          icon: c.icon,
          description: c.description,
          total_lessons: parseInt(c.total_lessons),
          completed_lessons: parseInt(c.completed_lessons),
          pct_complete: c.pct_complete || 0,
          next_incomplete: incompletePerCategory.find(ic => ic.category_id === c.id)?.next_lesson || null,
        })),
      });
    } catch (err) {
      console.error('[training] GET /recommendations error:', err.message);
      res.status(500).json({ error: 'Failed to load recommendations' });
    }
  });

  // GET /api/training/progress
  // Returns per-category completion stats for the current user.
  router.get('/training/progress', async (req, res) => {
    try {
      const playerId = await getPlayerId(req);
      if (!playerId) return res.status(401).json({ error: 'Authentication required' });

      const progress = await pool.query(`
        SELECT
          c.id AS category_id,
          c.name,
          c.slug,
          c.icon,
          COUNT(l.id) AS total_lessons,
          COUNT(tc.id) AS completed_lessons,
          COALESCE(SUM(l.xp_reward) FILTER (WHERE tc.id IS NOT NULL), 0) AS xp_earned,
          ROUND(
            COUNT(tc.id)::numeric / NULLIF(COUNT(l.id), 0) * 100,
            0
          ) AS pct_complete
        FROM training_categories c
        LEFT JOIN training_lessons l ON l.category_id = c.id AND l.is_active = true
        LEFT JOIN training_completions tc ON tc.lesson_id = l.id AND tc.player_id = $1
        WHERE c.is_active = true
        GROUP BY c.id
        ORDER BY c.sort_order ASC
      `, [playerId]);

      // Overall stats
      const totals = await pool.query(`
        SELECT
          COUNT(l.id) AS total_lessons,
          COUNT(tc.id) AS completed_lessons,
          COALESCE(SUM(l.xp_reward) FILTER (WHERE tc.id IS NOT NULL), 0) AS total_xp_earned
        FROM training_lessons l
        LEFT JOIN training_completions tc ON tc.lesson_id = l.id AND tc.player_id = $1
        WHERE l.is_active = true
      `, [playerId]);

      const t = totals.rows[0];
      res.json({
        categories: progress.rows.map(r => ({
          ...r,
          total_lessons: parseInt(r.total_lessons),
          completed_lessons: parseInt(r.completed_lessons),
          xp_earned: parseInt(r.xp_earned),
          pct_complete: r.pct_complete ? parseInt(r.pct_complete) : 0,
        })),
        overall: {
          total_lessons: parseInt(t.total_lessons),
          completed_lessons: parseInt(t.completed_lessons),
          total_xp_earned: parseInt(t.total_xp_earned),
          pct_complete: t.total_lessons > 0
            ? Math.round((parseInt(t.completed_lessons) / parseInt(t.total_lessons)) * 100)
            : 0,
        },
      });
    } catch (err) {
      console.error('[training] GET /progress error:', err.message);
      res.status(500).json({ error: 'Failed to load training progress' });
    }
  });

  // GET /api/home/state
  // Aggregated home screen data for authenticated/guest players.
  // Includes player stats, training progress, daily challenge, recent rounds, gold.
  router.get('/home/state', async (req, res) => {
    try {
      const playerId = await getPlayerId(req);

      if (!playerId) {
        return res.json({ authenticated: false });
      }

      // Player basics (XP, level, gold, total_distance_m, total_rounds, total_courses_visited)
      const playerResult = await pool.query(
        `SELECT id, username, xp, level, experience_level,
                COALESCE(total_distance_m, 0) AS total_distance_m,
                COALESCE(total_rounds, 0) AS total_rounds,
                COALESCE(total_courses_visited, 0) AS total_courses_visited,
                COALESCE(gold, 0) AS gold_balance,
                total_checkins, total_birdies, total_aces
         FROM players WHERE id = $1`,
        [playerId]
      );

      if (!playerResult.rows.length) {
        return res.status(404).json({ error: 'Player not found' });
      }

      const player = playerResult.rows[0];

      // Training progress — overall and per-category
      const trainingProgress = await pool.query(`
        SELECT
          c.id AS category_id,
          c.name,
          c.slug,
          c.icon,
          COUNT(l.id) AS total_lessons,
          COUNT(tc.id) AS completed_lessons,
          ROUND(
            COUNT(tc.id)::numeric / NULLIF(COUNT(l.id), 0) * 100,
            0
          )::int AS pct_complete
        FROM training_categories c
        LEFT JOIN training_lessons l ON l.category_id = c.id AND l.is_active = true
        LEFT JOIN training_completions tc ON tc.lesson_id = l.id AND tc.player_id = $1
        WHERE c.is_active = true
        GROUP BY c.id
        ORDER BY c.sort_order ASC
      `, [playerId]);

      // Overall training stats
      const overallTraining = await pool.query(`
        SELECT
          COUNT(l.id) AS total_lessons,
          COUNT(tc.id) AS completed_lessons
        FROM training_lessons l
        LEFT JOIN training_completions tc ON tc.lesson_id = l.id AND tc.player_id = $1
        WHERE l.is_active = true
      `, [playerId]);

      const t = overallTraining.rows[0];
      const overallPct = t.total_lessons > 0
        ? Math.round((parseInt(t.completed_lessons) / parseInt(t.total_lessons)) * 100)
        : 0;

      // Next recommended lesson — first incomplete lesson across all categories
      const nextLesson = await pool.query(`
        SELECT l.id, l.title, l.slug, l.difficulty, l.xp_reward,
               c.name AS category_name, c.slug AS category_slug
        FROM training_lessons l
        JOIN training_categories c ON c.id = l.category_id
        WHERE l.is_active = true
          AND l.id NOT IN (
            SELECT lesson_id FROM training_completions WHERE player_id = $1
          )
        ORDER BY l.sort_order ASC
        LIMIT 1
      `, [playerId]);

      // Training streak — consecutive days with at least one lesson completion
      const streakResult = await pool.query(`
        WITH daily AS (
          SELECT DISTINCT DATE(tc.completed_at) AS day
          FROM training_completions tc
          WHERE tc.player_id = $1
          ORDER BY day DESC
          LIMIT 30
        ),
        streak AS (
          SELECT day, day - ROW_NUMBER() OVER (ORDER BY day DESC)::int AS grp
          FROM daily
        )
        SELECT COUNT(*) AS streak_days
        FROM streak
        WHERE grp = (SELECT grp FROM streak LIMIT 1)
      `, [playerId]);
      const training_streak_days = parseInt(streakResult.rows[0]?.streak_days || 0);

      // Recent rounds (last 3 completed)
      const recentRounds = await pool.query(`
        SELECT r.id, r.total_score, r.total_par, r.course_id, r.layout_id,
               COALESCE(r.total_score - r.total_par, r.total_score) AS score_vs_par,
               to_char(r.completed_at, 'Mon D') AS day_label,
               to_char(r.completed_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS completed_at,
               p.name AS course_name, p.city, p.state
        FROM rounds r
        JOIN courses p ON p.id = r.course_id
        WHERE r.player_id = $1
          AND r.status = 'completed'
          AND r.completed_at IS NOT NULL
        ORDER BY r.completed_at DESC
        LIMIT 3
      `, [playerId]);

      // Next level XP — simple formula: level N threshold = N * 500
      // Level 1 = 0, Level 2 = 500, Level 3 = 1000, etc.
      const currentLevel = Math.max(1, Math.floor(player.xp / 500) + 1);
      const nextLevelXp = currentLevel * 500;

      // Skill tier (same thresholds as client: Rookie <500, Player 500–1999, Advanced 2000–4999, Pro ≥5000)
      const xp = player.xp;
      const skill_tier = xp >= 5000 ? 'pro' : xp >= 2000 ? 'advanced' : xp >= 500 ? 'player' : 'rookie';
      const tierMaxXp = xp >= 5000 ? 5000 : xp >= 2000 ? 5000 : xp >= 500 ? 2000 : 500;
      const tierMinXp = xp >= 5000 ? 5000 : xp >= 2000 ? 2000 : xp >= 500 ? 500 : 0;
      const skill_tier_progress = tierMaxXp > tierMinXp
        ? Math.round(((xp - tierMinXp) / (tierMaxXp - tierMinXp)) * 100)
        : 100;

      res.json({
        authenticated: true,
        player: {
          id: player.id,
          username: player.username,
          xp: player.xp,
          level: player.level || 1,
          experience_level: player.experience_level,
          total_distance_m: parseFloat(player.total_distance_m),
          total_rounds: parseInt(player.total_rounds),
          total_courses_visited: parseInt(player.total_courses_visited),
          gold_balance: parseInt(player.gold_balance),
          total_checkins: parseInt(player.total_checkins),
          total_birdies: parseInt(player.total_birdies),
          total_aces: parseInt(player.total_aces),
          skill_tier,
          skill_tier_progress,
          training_streak_days,
        },
        training: {
          overall: {
            total_lessons: parseInt(t.total_lessons),
            completed_lessons: parseInt(t.completed_lessons),
            pct_complete: overallPct,
          },
          categories: trainingProgress.rows.map(r => ({
            category_id: r.category_id,
            name: r.name,
            slug: r.slug,
            icon: r.icon,
            total_lessons: parseInt(r.total_lessons),
            completed_lessons: parseInt(r.completed_lessons),
            pct_complete: r.pct_complete || 0,
          })),
          next_lesson: nextLesson.rows[0] || null,
        },
        recent_rounds: recentRounds.rows,
        next_level_xp: nextLevelXp,
      });
    } catch (err) {
      console.error('[training] GET /home/state error:', err.message);
      res.status(500).json({ error: 'Failed to load home data' });
    }
  });

  // ── Milestone definitions ───────────────────────────────────────────────────
  // milestone_key → { title, description, trigger_lessons, reward_gold }
  const MILESTONE_DEFS = [
    { key: 'first_lesson',        title: 'First Lesson',         desc: 'Completed your first training lesson',      trigger: 1,  gold: 0   },
    { key: 'getting_started',      title: 'Getting Started',      desc: 'Completed 5 lessons — way to go!',         trigger: 5,  gold: 25  },
    { key: 'half_way_there',       title: 'Half Way There',       desc: 'Completed 10 lessons — serious commitment',  trigger: 10, gold: 50  },
    { key: 'training_machine',     title: 'Training Machine',     desc: 'Completed 25 lessons — unstoppable!',        trigger: 25, gold: 100 },
    { key: 'legend',               title: 'Legend',               desc: 'Completed 50 lessons — disc golf scholar',  trigger: 50, gold: 250 },
  ];

  // Milestone trigger: called after lesson completion (inside completion tx)
  // Awarded atomically inside the same transaction to prevent double-award.
  async function checkMilestones(client, playerId, totalCompleted, earnedMilestones) {
    const newMilestones = [];
    for (const def of MILESTONE_DEFS) {
      if (totalCompleted === def.trigger) {
        const res = await client.query(`
          INSERT INTO training_milestones (player_id, milestone_key, reward_gold)
          VALUES ($1, $2, $3)
          ON CONFLICT (player_id, milestone_key) DO NOTHING
          RETURNING id, milestone_key, reward_gold, earned_at
        `, [playerId, def.key, def.gold]);
        if (res.rows.length) {
          const row = res.rows[0];
          // Award gold if reward > 0
          if (row.reward_gold > 0) {
            await client.query('UPDATE players SET gold = gold + $1 WHERE id = $2', [row.reward_gold, playerId]);
          }
          newMilestones.push({
            milestone_key: row.milestone_key,
            title: def.title,
            reward_gold: row.reward_gold,
            earned_at: row.earned_at,
          });
        }
      }
    }
    return newMilestones;
  }

  // GET /api/training/streak — current player's streak detail
  router.get('/training/streak', async (req, res) => {
    try {
      const playerId = await getPlayerId(req);
      if (!playerId) return res.status(401).json({ error: 'Authentication required' });

      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      // Seed / refresh from completions table if streak table is empty
      let streak = await pool.query('SELECT * FROM training_streaks WHERE player_id = $1', [playerId]);
      if (!streak.rows.length) {
        // Back-compute from training_completions
        const lastDates = await pool.query(`
          SELECT DISTINCT DATE(tc.completed_at) AS d
          FROM training_completions tc
          WHERE tc.player_id = $1
          ORDER BY d DESC
        `, [playerId]);
        if (lastDates.rows.length > 0) {
          let currentStreak = 0;
          let expectedDate = new Date(today);
          for (const row of lastDates.rows) {
            const dayStr = row.d instanceof Date
              ? row.d.toISOString().split('T')[0]
              : String(row.d).slice(0, 10);
            const expStr = expectedDate.toISOString().split('T')[0];
            if (dayStr === expStr || dayStr === yesterday) {
              currentStreak++;
              expectedDate = new Date(expectedDate.getTime() - 86400000);
            } else {
              break;
            }
          }
          const longest = lastDates.rows.length; // approximate
          await pool.query(`
            INSERT INTO training_streaks (player_id, streak_days, longest_streak, last_date, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (player_id) DO NOTHING
          `, [playerId, currentStreak, longest, lastDates.rows[0].d]);
          streak = await pool.query('SELECT * FROM training_streaks WHERE player_id = $1', [playerId]);
        }
      }

      const s = streak.rows[0] || { streak_days: 0, longest_streak: 0, last_date: null, streak_frozen: false };
      const daysUntilBonus = s.streak_days < 3 ? 3 - s.streak_days : 0;
      const lastDateStr = toDateStr(s.last_date);
      const isActiveStreak = lastDateStr === today || lastDateStr === yesterday;

      res.json({
        current_streak: s.streak_days,
        longest_streak: s.longest_streak,
        last_training_date: s.last_date,
        streak_frozen: s.streak_frozen,
        is_active_today: lastDateStr === today,
        is_active: isActiveStreak,
        days_until_bonus: daysUntilBonus,
        bonus_description: daysUntilBonus === 0
          ? 'Streak bonus active! +25 XP per lesson'
          : `Train ${daysUntilBonus} more day${daysUntilBonus > 1 ? 's' : ''} for streak bonus (+25 XP)`,
      });
    } catch (err) {
      console.error('[training] GET /streak error:', err.message);
      res.status(500).json({ error: 'Failed to load streak' });
    }
  });

  // GET /api/training/milestones — all milestones for current player (earned + unearned)
  router.get('/training/milestones', async (req, res) => {
    try {
      const playerId = await getPlayerId(req);
      if (!playerId) return res.status(401).json({ error: 'Authentication required' });

      // Total completed lessons
      const totalResult = await pool.query(`
        SELECT COUNT(*) AS cnt FROM training_completions tc
        JOIN training_lessons tl ON tl.id = tc.lesson_id
        WHERE tc.player_id = $1 AND tl.is_active = true
      `, [playerId]);
      const totalCompleted = parseInt(totalResult.rows[0].cnt);

      // Earned milestones
      const earnedRows = await pool.query(
        'SELECT milestone_key, reward_gold, earned_at FROM training_milestones WHERE player_id = $1 ORDER BY earned_at ASC',
        [playerId]
      );
      const earnedMap = {};
      for (const r of earnedRows.rows) earnedMap[r.milestone_key] = r;

      // Category completions (for per-category badges)
      const catRows = await pool.query(`
        SELECT c.id, c.name, c.slug, c.icon,
          COUNT(l.id) AS total_lessons,
          COUNT(tc.id) AS completed
        FROM training_categories c
        LEFT JOIN training_lessons l ON l.category_id = c.id AND l.is_active = true
        LEFT JOIN training_completions tc ON tc.lesson_id = l.id AND tc.player_id = $1
        WHERE c.is_active = true
        GROUP BY c.id
      `, [playerId]);

      const earned = MILESTONE_DEFS.map(def => ({
        ...def,
        earned: !!earnedMap[def.key],
        reward_gold: earnedMap[def.key] ? def.gold : 0,
        earned_at: earnedMap[def.key]?.earned_at || null,
        next_trigger: null,
        progress: def.trigger > totalCompleted ? totalCompleted : def.trigger,
        total: def.trigger,
      }));

      // Add category completion milestones (dynamic, per category)
      const categoryMilestones = catRows.rows
        .filter(c => parseInt(c.total_lessons) > 0)
        .map(c => {
          const key = 'cat_complete_' + c.slug;
          const earned2 = !!earnedMap[key];
          return {
            key,
            title: c.name + ' Master',
            desc: 'Completed all ' + c.total_lessons + ' lessons in ' + c.name,
            trigger: parseInt(c.total_lessons), // same as total lessons
            gold: 50,
            earned: earned2,
            earned_at: earnedMap[key]?.earned_at || null,
            progress: parseInt(c.completed),
            total: parseInt(c.total_lessons),
            icon: c.icon,
          };
        });

      res.json({
        total_lessons_completed: totalCompleted,
        milestones: [...earned, ...categoryMilestones],
        total_milestones: MILESTONE_DEFS.length + catRows.rows.filter(c => parseInt(c.total_lessons) > 0).length,
        earned_count: Object.keys(earnedMap).length,
      });
    } catch (err) {
      console.error('[training] GET /milestones error:', err.message);
      res.status(500).json({ error: 'Failed to load milestones' });
    }
  });

  // POST /api/training/milestones/check — triggered after lesson completion
  // Awards any newly earned milestones and gold rewards atomically.
  // Returns new milestones unlocked so the client can show a toast.
  router.post('/training/milestones/check', async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const playerId = await getPlayerId(req);
      if (!playerId) {
        await client.query('ROLLBACK');
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Count current completions
      const totalResult = await client.query(`
        SELECT COUNT(*) AS cnt FROM training_completions tc
        JOIN training_lessons tl ON tl.id = tc.lesson_id
        WHERE tc.player_id = $1 AND tl.is_active = true
      `, [playerId]);
      const totalCompleted = parseInt(totalResult.rows[0].cnt);

      // Find newly earned milestone-based achievements
      let newMilestones = [];
      for (const def of MILESTONE_DEFS) {
        if (totalCompleted === def.trigger) {
          const res2 = await client.query(`
            INSERT INTO training_milestones (player_id, milestone_key, reward_gold)
            VALUES ($1, $2, $3)
            ON CONFLICT (player_id, milestone_key) DO NOTHING
            RETURNING milestone_key, reward_gold, earned_at
          `, [playerId, def.key, def.gold]);
          if (res2.rows.length) {
            const row = res2.rows[0];
            if (row.reward_gold > 0) {
              await client.query('UPDATE players SET gold = gold + $1 WHERE id = $2', [row.reward_gold, playerId]);
            }
            newMilestones.push({ milestone_key: row.milestone_key, title: def.title, reward_gold: row.reward_gold, earned_at: row.earned_at });
          }
        }
      }

      // Check category completion milestones
      const catRows = await client.query(`
        SELECT c.id, c.name, c.slug, c.icon,
          COUNT(l.id) AS total_lessons,
          COUNT(tc.id) AS completed
        FROM training_categories c
        LEFT JOIN training_lessons l ON l.category_id = c.id AND l.is_active = true
        LEFT JOIN training_completions tc ON tc.lesson_id = l.id AND tc.player_id = $1
        WHERE c.is_active = true
        GROUP BY c.id
      `, [playerId]);
      for (const c of catRows.rows) {
        if (parseInt(c.completed) === parseInt(c.total_lessons) && parseInt(c.total_lessons) > 0) {
          const key = 'cat_complete_' + c.slug;
          const res3 = await client.query(`
            INSERT INTO training_milestones (player_id, milestone_key, reward_gold)
            VALUES ($1, $2, 50)
            ON CONFLICT (player_id, milestone_key) DO NOTHING
            RETURNING milestone_key, reward_gold, earned_at
          `, [playerId, key]);
          if (res3.rows.length) {
            const row = res3.rows[0];
            await client.query('UPDATE players SET gold = gold + 50 WHERE id = $1', [playerId]);
            newMilestones.push({ milestone_key: row.milestone_key, title: c.name + ' Master', reward_gold: 50, earned_at: row.earned_at });
          }
        }
      }

      await client.query('COMMIT');
      res.json({ new_milestones: newMilestones, total_completed: totalCompleted });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[training] POST /milestones/check error:', err.message);
      res.status(500).json({ error: 'Failed to check milestones' });
    } finally {
      client.release();
    }
  });

  return router;
};