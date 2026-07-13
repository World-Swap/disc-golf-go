// routes/leaderboard.js — All leaderboard categories
'use strict';

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'disc-golf-go-secret';
const { getSkillTier } = require('./xp-engine');

module.exports = function ({ pool }) {
  const router = require('express').Router();

  // Optional auth middleware — reads player from token if present
  function optionalAuth(req, _res, next) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.playerId = payload.playerId || payload.player_id;
      } catch { /* ignore */ }
    }
    // Legacy UUID header fallback
    if (!req.playerId && req.headers['x-player-id']) {
      req.playerUuid = req.headers['x-player-id'];
    }
    next();
  }

  // ── Helper: resolve player row from req ──────────────────────────────────────
  async function resolvePlayerId(req) {
    if (req.playerId) return req.playerId;
    if (req.playerUuid) {
      const r = await pool.query('SELECT id FROM players WHERE player_uuid = $1', [req.playerUuid]);
      return r.rows[0]?.id || null;
    }
    return null;
  }

  // ── Helper: attach rank + is_me flag, handle "my rank" if outside top 100 ───
  async function withMyRank(rows, currentPlayerId, countQuery, myStatQuery, myStatParam) {
    const ranked = rows.map((r, i) => ({
      ...r,
      rank: i + 1,
      is_me: currentPlayerId != null && Number(r.id) === Number(currentPlayerId),
    }));

    // Check if current player is already in list
    const inList = ranked.some(r => r.is_me);
    if (!currentPlayerId || inList) return ranked;

    // Player not in top 100 — find their stat + rank
    try {
      const myRow = await pool.query(myStatQuery, myStatParam);
      if (!myRow.rows[0]) return ranked;
      const myStat = Number(myRow.rows[0].stat_value || 0);
      const countRes = await pool.query(countQuery, [myStat]);
      const myRank = Number(countRes.rows[0].cnt) + 1;
      ranked.push({ ...myRow.rows[0], rank: myRank, is_me: true, out_of_top: true });
    } catch { /* skip */ }

    return ranked;
  }

  // ── GET /api/leaderboard/top5 ────────────────────────────────────────────────
  // Lightweight widget endpoint: top 5 by XP + current player's rank if authenticated.
  // Does NOT own full leaderboard categories — that belongs to GET /api/leaderboard.
  router.get('/leaderboard/top5', optionalAuth, async (req, res) => {
    try {
      const currentPlayerId = await resolvePlayerId(req);

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
        try {
          const meRes = await pool.query(
            `SELECT id, display_name, username, xp, level FROM players WHERE id = $1`,
            [currentPlayerId]
          );
          if (meRes.rows[0]) {
            const me = meRes.rows[0];
            const rankRes = await pool.query(
              `SELECT COUNT(*) AS cnt FROM players WHERE xp > $1`,
              [me.xp]
            );
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
        } catch { /* skip */ }
      }

      res.json({ players, my_rank });
    } catch (err) {
      console.error('Leaderboard top5 error:', err);
      res.status(500).json({ error: 'Failed to load leaderboard' });
    }
  });

  // ── GET /api/leaderboard ─────────────────────────────────────────────────────
  // Query params:
  //   ?tab=overall|lessons|streak|challenges  (default: overall)
  //   ?period=alltime|week|month              (default: alltime)
  router.get('/leaderboard', optionalAuth, async (req, res) => {
    const tab = ['overall', 'lessons', 'streak', 'challenges'].includes(req.query.tab)
      ? req.query.tab : 'overall';
    const period = ['alltime', 'week', 'month'].includes(req.query.period)
      ? req.query.period : 'alltime';
    const currentPlayerId = await resolvePlayerId(req);

    function rankTier(rank) {
      if (rank <= 3) return 'gold';
      if (rank <= 10) return 'silver';
      if (rank <= 30) return 'bronze';
      return null;
    }

    // Column to sort by per tab
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

      // Append current player if not already in the list
      const inList = ranked.some(r => r.is_me);
      if (currentPlayerId && !inList) {
        try {
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
        } catch { /* skip */ }
      }

      res.json({ tab, period, players: ranked });
    } catch (err) {
      console.error('Leaderboard error:', err);
      res.status(500).json({ error: 'Failed to load leaderboard' });
    }
  });

  // ── GET /api/leaderboard/crews/training ──────────────────────────────────────
  // Top 20 crews ranked by combined training XP of all members.
  // Aggregates COALESCE(SUM(training_lessons.xp_reward)) per crew.
  router.get('/leaderboard/crews/training', optionalAuth, async (req, res) => {
    try {
      const currentPlayerId = await resolvePlayerId(req);

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

      // Mark if current player is a member of any crew
      if (currentPlayerId) {
        const myCrewRes = await pool.query(
          'SELECT crew_id FROM crew_members WHERE player_id = $1 LIMIT 1',
          [currentPlayerId]
        );
        if (myCrewRes.rows[0]) {
          const myCrewId = myCrewRes.rows[0].crew_id;
          const idx = ranked.findIndex(c => c.id === myCrewId);
          if (idx !== -1) ranked[idx].is_me = true;
        }
      }

      res.json({ category: 'crew_training', crews: ranked });
    } catch (err) {
      console.error('Crew training leaderboard error:', err);
      res.status(500).json({ error: 'Failed to load crew leaderboard' });
    }
  });

  return router;
};
