// routes/leaderboard.js — leaderboard categories (players + crews).
'use strict';

const { optionalAuth } = require('../middleware/auth');
const { getSkillTier } = require('./xp-engine');

module.exports = function ({ pool }) {
  const router = require('express').Router();
  const optAuth = optionalAuth(pool); // sets req.player when a token/UUID is present

  // GET /api/leaderboard/top5 — top 5 by XP + current player's rank if authed.
  router.get('/leaderboard/top5', optAuth, async (req, res, next) => {
    const currentPlayerId = req.player?.id ?? null;
    try {
      const top5Res = await pool.query(`
        SELECT id, display_name, username, xp, level
        FROM players
        ORDER BY xp DESC, id ASC
        LIMIT 5
      `);

      const players = top5Res.rows.map((p, i) => {
        const tier = getSkillTier(Number(p.xp) || 0);
        return {
          rank: i + 1,
          id: p.id,
          display_name: p.display_name || p.username || 'Player',
          username: p.username,
          xp: Number(p.xp) || 0,
          level: p.level,
          skill_tier: tier.key,
          skill_tier_icon: tier.icon,
          skill_tier_color: tier.color,
          is_me: currentPlayerId != null && Number(p.id) === Number(currentPlayerId),
        };
      });

      let my_rank = null;
      if (currentPlayerId && !players.some(p => p.is_me)) {
        const meRes = await pool.query(
          `SELECT id, display_name, username, xp, level FROM players WHERE id = $1`,
          [currentPlayerId]
        );
        if (meRes.rows[0]) {
          const me = meRes.rows[0];
          const rankRes = await pool.query(`SELECT COUNT(*) AS cnt FROM players WHERE xp > $1`, [me.xp]);
          my_rank = {
            rank: Number(rankRes.rows[0].cnt) + 1,
            id: me.id,
            display_name: me.display_name || me.username || 'You',
            username: me.username,
            xp: Number(me.xp) || 0,
            level: me.level,
            skill_tier: getSkillTier(Number(me.xp) || 0).key,
            is_me: true,
          };
        }
      }

      res.json({ players, my_rank });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/leaderboard — full leaderboard.
  //   ?tab=overall|lessons|streak|challenges  (default: overall)
  //   ?period=alltime|week|month              (default: alltime)
  router.get('/leaderboard', optAuth, async (req, res, next) => {
    const tab = ['overall', 'lessons', 'streak', 'challenges'].includes(req.query.tab) ? req.query.tab : 'overall';
    const period = ['alltime', 'week', 'month'].includes(req.query.period) ? req.query.period : 'alltime';
    const currentPlayerId = req.player?.id ?? null;

    function rankTier(rank) {
      if (rank <= 3) return 'gold';
      if (rank <= 10) return 'silver';
      if (rank <= 30) return 'bronze';
      return null;
    }

    // Column to sort by per tab (fixed whitelist — safe to interpolate).
    const sortCol = { overall: 'total_xp', lessons: 'lessons_completed', streak: 'current_streak', challenges: 'challenges_won' }[tab];

    try {
      let rows;

      if (period === 'alltime') {
        const r = await pool.query(`
          SELECT user_id AS id,
                 display_name,
                 avatar_url    AS profile_photo_url,
                 total_xp,
                 lessons_completed,
                 current_streak,
                 challenges_won,
                 last_active_at,
                 ${sortCol} AS stat_value
          FROM leaderboard_entries
          ORDER BY ${sortCol} DESC, user_id ASC
          LIMIT 50
        `);
        rows = r.rows;
      } else {
        const interval = period === 'week' ? '7 days' : '30 days';
        const r = await pool.query(`
          WITH tc AS (
            SELECT tc.player_id,
                   SUM(l.xp_reward)::int   AS training_xp,
                   MAX(tc.completed_at)    AS last_lesson_at,
                   COUNT(tc.id)::int       AS lessons_completed
            FROM training_completions tc
            JOIN training_lessons l ON l.id = tc.lesson_id
            WHERE tc.completed_at >= NOW() - INTERVAL '${interval}'
            GROUP BY tc.player_id
          ),
          dc AS (
            SELECT player_id,
                   COUNT(*)::int           AS challenges_won,
                   MAX(completed_at)       AS last_challenge_at
            FROM player_daily_challenges
            WHERE completed = TRUE
              AND completed_at >= NOW() - INTERVAL '${interval}'
            GROUP BY player_id
          )
          SELECT
            p.id,
            COALESCE(p.display_name, p.username, 'Player')  AS display_name,
            p.profile_photo_url,
            COALESCE(tc.training_xp, 0)                     AS total_xp,
            COALESCE(tc.lessons_completed, 0)               AS lessons_completed,
            COALESCE(p.login_streak, 0)                      AS current_streak,
            COALESCE(dc.challenges_won, 0)                  AS challenges_won,
            GREATEST(tc.last_lesson_at, dc.last_challenge_at) AS last_active_at,
            COALESCE(${sortCol === 'total_xp' ? 'tc.training_xp' : sortCol === 'lessons_completed' ? 'tc.lessons_completed' : sortCol === 'current_streak' ? 'p.login_streak' : 'dc.challenges_won'}, 0) AS stat_value
          FROM players p
          LEFT JOIN tc ON tc.player_id = p.id
          LEFT JOIN dc ON dc.player_id = p.id
          WHERE (COALESCE(tc.lessons_completed, 0) > 0 OR COALESCE(dc.challenges_won, 0) > 0)
          ORDER BY stat_value DESC, p.id ASC
          LIMIT 50
        `);
        rows = r.rows;
      }

      const ranked = rows.map((r, i) => ({
        ...r,
        rank: i + 1,
        rank_tier: rankTier(i + 1),
        is_me: currentPlayerId != null && Number(r.id) === Number(currentPlayerId),
      }));

      // Append the current player if they're not already in the top list.
      if (currentPlayerId && !ranked.some(r => r.is_me)) {
        let myRow;
        if (period === 'alltime') {
          const mr = await pool.query(`
            SELECT user_id AS id, display_name, avatar_url AS profile_photo_url,
                   total_xp, lessons_completed, current_streak, challenges_won, last_active_at,
                   ${sortCol} AS stat_value
            FROM leaderboard_entries WHERE user_id = $1
          `, [currentPlayerId]);
          myRow = mr.rows[0];
        } else {
          const interval = period === 'week' ? '7 days' : '30 days';
          const mr = await pool.query(`
            WITH tc AS (
              SELECT tc.player_id,
                     SUM(l.xp_reward)::int AS training_xp,
                     COUNT(tc.id)::int     AS lessons_completed
              FROM training_completions tc
              JOIN training_lessons l ON l.id = tc.lesson_id
              WHERE tc.completed_at >= NOW() - INTERVAL '${interval}'
                AND tc.player_id = $1
              GROUP BY tc.player_id
            ),
            dc AS (
              SELECT player_id, COUNT(*)::int AS challenges_won
              FROM player_daily_challenges
              WHERE completed = TRUE
                AND completed_at >= NOW() - INTERVAL '${interval}'
                AND player_id = $1
              GROUP BY player_id
            )
            SELECT p.id,
                   COALESCE(p.display_name, p.username, 'Player') AS display_name,
                   p.profile_photo_url,
                   COALESCE(tc.training_xp, 0) AS total_xp,
                   COALESCE(tc.lessons_completed, 0) AS lessons_completed,
                   COALESCE(p.login_streak, 0) AS current_streak,
                   COALESCE(dc.challenges_won, 0) AS challenges_won,
                   NULL::timestamptz AS last_active_at,
                   COALESCE(${sortCol === 'total_xp' ? 'tc.training_xp' : sortCol === 'lessons_completed' ? 'tc.lessons_completed' : sortCol === 'current_streak' ? 'p.login_streak' : 'dc.challenges_won'}, 0) AS stat_value
            FROM players p
            LEFT JOIN tc ON tc.player_id = p.id
            LEFT JOIN dc ON dc.player_id = p.id
            WHERE p.id = $1
          `, [currentPlayerId]);
          myRow = mr.rows[0];
        }
        if (myRow) {
          let myRank = ranked.length + 1;
          if (period === 'alltime') {
            const countRes = await pool.query(
              `SELECT COUNT(*) AS cnt FROM leaderboard_entries WHERE ${sortCol} > $1`,
              [myRow.stat_value || 0]
            );
            myRank = Number(countRes.rows[0].cnt) + 1;
          }
          ranked.push({ ...myRow, rank: myRank, rank_tier: rankTier(myRank), is_me: true, out_of_top: true });
        }
      }

      res.json({ tab, period, players: ranked });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/leaderboard/crews/training — top 20 crews by combined member training XP.
  router.get('/leaderboard/crews/training', optAuth, async (req, res, next) => {
    const currentPlayerId = req.player?.id ?? null;
    try {
      const r = await pool.query(`
        SELECT
          cr.id,
          cr.name,
          cr.logo_url,
          cr.boss_id,
          COUNT(DISTINCT cm.player_id)::int AS member_count,
          COALESCE(SUM(l.xp_reward)::int, 0) AS training_xp,
          COUNT(DISTINCT tc.id)::int AS lessons_completed
        FROM crews cr
        LEFT JOIN crew_members cm ON cm.crew_id = cr.id
        LEFT JOIN training_completions tc ON tc.player_id = cm.player_id
        LEFT JOIN training_lessons l ON l.id = tc.lesson_id
        WHERE cr.disbanded_at IS NULL
        GROUP BY cr.id
        ORDER BY training_xp DESC, member_count DESC, cr.name ASC
        LIMIT 20
      `);

      const ranked = r.rows.map((c, i) => ({
        rank: i + 1,
        id: c.id,
        name: c.name,
        logo_url: c.logo_url,
        member_count: c.member_count,
        training_xp: c.training_xp,
        lessons_completed: c.lessons_completed,
        is_me: false,
      }));

      // Flag the crew the current player belongs to.
      if (currentPlayerId) {
        const myCrewRes = await pool.query(
          'SELECT crew_id FROM crew_members WHERE player_id = $1 LIMIT 1',
          [currentPlayerId]
        );
        if (myCrewRes.rows[0]) {
          const idx = ranked.findIndex(c => c.id === myCrewRes.rows[0].crew_id);
          if (idx !== -1) ranked[idx].is_me = true;
        }
      }

      res.json({ category: 'crew_training', crews: ranked });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
