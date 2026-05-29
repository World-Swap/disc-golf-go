// routes/leaderboard.js — All leaderboard categories
'use strict';

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'disc-golf-go-secret';

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

      const players = top5Res.rows.map((p, i) => ({
        rank: i + 1,
        id: p.id,
        display_name: p.display_name || p.username || 'Player',
        username: p.username,
        xp: Number(p.xp) || 0,
        level: p.level,
        is_me: currentPlayerId != null && Number(p.id) === Number(currentPlayerId),
      }));

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
  // Query param: ?category=overall|checkins|rounds|birdies|aces|challenges|battles|courses|streak
  router.get('/leaderboard', optionalAuth, async (req, res) => {
    const category = req.query.category || 'overall';
    const currentPlayerId = await resolvePlayerId(req);

    try {
      let rows, ranked;

      // ── OVERALL (ranked by total XP) ────────────────────────────────────────
      if (category === 'overall') {
        const r = await pool.query(`
          SELECT id, display_name, username, profile_photo_url, xp, level,
                 xp AS stat_value
          FROM players
          ORDER BY xp DESC, id ASC
          LIMIT 100
        `);
        rows = r.rows;
        ranked = await withMyRank(rows, currentPlayerId,
          `SELECT COUNT(*) AS cnt FROM players WHERE xp > $1`,
          `SELECT id, display_name, username, profile_photo_url, xp, level, xp AS stat_value FROM players WHERE id = $1`,
          [currentPlayerId]
        );
      }

      // ── CHECK-INS ──────────────────────────────────────────────────────────
      else if (category === 'checkins') {
        const r = await pool.query(`
          SELECT p.id, p.display_name, p.username, p.profile_photo_url, p.xp, p.level,
                 COUNT(ci.id)::int AS stat_value
          FROM players p
          JOIN checkins ci ON ci.player_id = p.id
          GROUP BY p.id
          ORDER BY stat_value DESC, p.id ASC
          LIMIT 100
        `);
        rows = r.rows;
        ranked = await withMyRank(rows, currentPlayerId,
          `SELECT COUNT(DISTINCT player_id) AS cnt FROM (
             SELECT ci.player_id, COUNT(*) AS cnt FROM checkins ci GROUP BY ci.player_id HAVING COUNT(*) > $1
           ) s`,
          `SELECT p.id, p.display_name, p.username, p.profile_photo_url, p.xp, p.level,
                  COUNT(ci.id)::int AS stat_value
           FROM players p JOIN checkins ci ON ci.player_id = p.id
           WHERE p.id = $1 GROUP BY p.id`,
          [currentPlayerId]
        );
      }

      // ── ROUNDS COMPLETED ───────────────────────────────────────────────────
      else if (category === 'rounds') {
        const r = await pool.query(`
          SELECT id, display_name, username, profile_photo_url, xp, level,
                 total_rounds AS stat_value
          FROM players
          WHERE total_rounds > 0
          ORDER BY total_rounds DESC, id ASC
          LIMIT 100
        `);
        rows = r.rows;
        ranked = await withMyRank(rows, currentPlayerId,
          `SELECT COUNT(*) AS cnt FROM players WHERE total_rounds > $1`,
          `SELECT id, display_name, username, profile_photo_url, xp, level, total_rounds AS stat_value FROM players WHERE id = $1`,
          [currentPlayerId]
        );
      }

      // ── BIRDIES ────────────────────────────────────────────────────────────
      else if (category === 'birdies') {
        const r = await pool.query(`
          SELECT p.id, p.display_name, p.username, p.profile_photo_url, p.xp, p.level,
                 COUNT(rh.id)::int AS stat_value
          FROM players p
          JOIN rounds ro ON ro.player_id = p.id AND ro.status = 'completed'
          JOIN round_holes rh ON rh.round_id = ro.id AND rh.score = rh.par - 1
          GROUP BY p.id
          ORDER BY stat_value DESC, p.id ASC
          LIMIT 100
        `);
        rows = r.rows;
        ranked = await withMyRank(rows, currentPlayerId,
          `SELECT COUNT(DISTINCT p.id) AS cnt
           FROM players p
           JOIN rounds ro ON ro.player_id = p.id AND ro.status = 'completed'
           JOIN round_holes rh ON rh.round_id = ro.id AND rh.score = rh.par - 1
           GROUP BY p.id HAVING COUNT(rh.id) > $1`,
          `SELECT p.id, p.display_name, p.username, p.profile_photo_url, p.xp, p.level,
                  COUNT(rh.id)::int AS stat_value
           FROM players p
           JOIN rounds ro ON ro.player_id = p.id AND ro.status = 'completed'
           JOIN round_holes rh ON rh.round_id = ro.id AND rh.score = rh.par - 1
           WHERE p.id = $1 GROUP BY p.id`,
          [currentPlayerId]
        );
      }

      // ── ACES ───────────────────────────────────────────────────────────────
      else if (category === 'aces') {
        const r = await pool.query(`
          SELECT p.id, p.display_name, p.username, p.profile_photo_url, p.xp, p.level,
                 COUNT(rh.id)::int AS stat_value
          FROM players p
          JOIN rounds ro ON ro.player_id = p.id AND ro.status = 'completed'
          JOIN round_holes rh ON rh.round_id = ro.id AND rh.score = 1 AND rh.par >= 2
          GROUP BY p.id
          ORDER BY stat_value DESC, p.id ASC
          LIMIT 100
        `);
        rows = r.rows;
        ranked = await withMyRank(rows, currentPlayerId,
          `SELECT COUNT(DISTINCT p.id) AS cnt
           FROM players p
           JOIN rounds ro ON ro.player_id = p.id AND ro.status = 'completed'
           JOIN round_holes rh ON rh.round_id = ro.id AND rh.score = 1 AND rh.par >= 2
           GROUP BY p.id HAVING COUNT(rh.id) > $1`,
          `SELECT p.id, p.display_name, p.username, p.profile_photo_url, p.xp, p.level,
                  COUNT(rh.id)::int AS stat_value
           FROM players p
           JOIN rounds ro ON ro.player_id = p.id AND ro.status = 'completed'
           JOIN round_holes rh ON rh.round_id = ro.id AND rh.score = 1 AND rh.par >= 2
           WHERE p.id = $1 GROUP BY p.id`,
          [currentPlayerId]
        );
      }

      // ── CHALLENGES COMPLETED ───────────────────────────────────────────────
      else if (category === 'challenges') {
        const r = await pool.query(`
          SELECT p.id, p.display_name, p.username, p.profile_photo_url, p.xp, p.level,
                 (
                   COALESCE((SELECT COUNT(*) FROM player_challenges pc WHERE pc.player_id = p.id AND pc.completed = true), 0) +
                   COALESCE((SELECT COUNT(*) FROM player_challenge_slots pcs WHERE pcs.player_id = p.id AND pcs.completed = true), 0)
                 )::int AS stat_value
          FROM players p
          ORDER BY stat_value DESC, p.xp DESC, p.id ASC
          LIMIT 100
        `);
        rows = r.rows.filter(r => r.stat_value > 0);
        ranked = rows.map((r, i) => ({
          ...r, rank: i + 1,
          is_me: currentPlayerId != null && Number(r.id) === Number(currentPlayerId),
        }));
        // Append player if not in list
        if (currentPlayerId && !ranked.some(r => r.is_me)) {
          const mr = await pool.query(`
            SELECT p.id, p.display_name, p.username, p.profile_photo_url, p.xp, p.level,
                   (
                     COALESCE((SELECT COUNT(*) FROM player_challenges pc WHERE pc.player_id = p.id AND pc.completed = true), 0) +
                     COALESCE((SELECT COUNT(*) FROM player_challenge_slots pcs WHERE pcs.player_id = p.id AND pcs.completed = true), 0)
                   )::int AS stat_value
            FROM players p WHERE p.id = $1
          `, [currentPlayerId]);
          if (mr.rows[0]) {
            const myVal = Number(mr.rows[0].stat_value);
            const rankRes = await pool.query(`
              SELECT COUNT(*) AS cnt FROM players p
              WHERE (
                COALESCE((SELECT COUNT(*) FROM player_challenges pc WHERE pc.player_id = p.id AND pc.completed = true), 0) +
                COALESCE((SELECT COUNT(*) FROM player_challenge_slots pcs WHERE pcs.player_id = p.id AND pcs.completed = true), 0)
              ) > $1
            `, [myVal]);
            ranked.push({ ...mr.rows[0], rank: Number(rankRes.rows[0].cnt) + 1, is_me: true, out_of_top: true });
          }
        }
      }

      // ── BATTLE WINS ────────────────────────────────────────────────────────
      else if (category === 'battles') {
        const r = await pool.query(`
          SELECT id, display_name, username, profile_photo_url, xp, level,
                 battle_wins AS stat_value
          FROM players
          WHERE battle_wins > 0
          ORDER BY battle_wins DESC, id ASC
          LIMIT 100
        `);
        rows = r.rows;
        ranked = await withMyRank(rows, currentPlayerId,
          `SELECT COUNT(*) AS cnt FROM players WHERE battle_wins > $1`,
          `SELECT id, display_name, username, profile_photo_url, xp, level, battle_wins AS stat_value FROM players WHERE id = $1`,
          [currentPlayerId]
        );
      }

      // ── COURSES EXPLORED ───────────────────────────────────────────────────
      else if (category === 'courses') {
        const r = await pool.query(`
          SELECT p.id, p.display_name, p.username, p.profile_photo_url, p.xp, p.level,
                 COUNT(DISTINCT ci.course_id)::int AS stat_value
          FROM players p
          JOIN checkins ci ON ci.player_id = p.id
          GROUP BY p.id
          ORDER BY stat_value DESC, p.id ASC
          LIMIT 100
        `);
        rows = r.rows;
        ranked = await withMyRank(rows, currentPlayerId,
          `SELECT COUNT(DISTINCT p.id) AS cnt
           FROM players p JOIN checkins ci ON ci.player_id = p.id
           GROUP BY p.id HAVING COUNT(DISTINCT ci.course_id) > $1`,
          `SELECT p.id, p.display_name, p.username, p.profile_photo_url, p.xp, p.level,
                  COUNT(DISTINCT ci.course_id)::int AS stat_value
           FROM players p JOIN checkins ci ON ci.player_id = p.id
           WHERE p.id = $1 GROUP BY p.id`,
          [currentPlayerId]
        );
      }

      // ── STREAK (best ever streak) ───────────────────────────────────────────
      else if (category === 'streak') {
        const r = await pool.query(`
          SELECT id, display_name, username, profile_photo_url, xp, level,
                 best_streak AS stat_value
          FROM players
          WHERE best_streak > 0
          ORDER BY best_streak DESC, login_streak DESC, id ASC
          LIMIT 100
        `);
        rows = r.rows;
        ranked = await withMyRank(rows, currentPlayerId,
          `SELECT COUNT(*) AS cnt FROM players WHERE best_streak > $1`,
          `SELECT id, display_name, username, profile_photo_url, xp, level, best_streak AS stat_value FROM players WHERE id = $1`,
          [currentPlayerId]
        );
      }

      else {
        return res.status(400).json({ error: 'Unknown category' });
      }

      res.json({ category, players: ranked });
    } catch (err) {
      console.error('Leaderboard error:', err);
      res.status(500).json({ error: 'Failed to load leaderboard' });
    }
  });

  return router;
};
