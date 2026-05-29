/**
 * Story Mode — Career Quest System
 * Owns: quest_progression tracking, quest engine, story chapter/quest definitions
 * Does NOT own: rounds.js, battles.js (those call into quest engine)
 *
 * The quest engine is also exported so other routes (rounds.js, battles.js)
 * can call checkQuestCompletion after game events.
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');

// ── Quest Engine Functions ───────────────────────────────────────────────────────

/**
 * Evaluate whether a quest condition is met given event data.
 * Returns true if the event satisfies the quest's trigger conditions.
 */
async function evaluateQuestConditions(client, quest, eventData) {
  const conditions = quest.trigger_conditions || {};
  const playerId = client._playerId || eventData.playerId;

  switch (quest.trigger_event) {
    case 'BATTLE_WIN':
    case 'BATTLE_COMPLETE':
      if (conditions.battle_type && eventData.battleType !== conditions.battle_type) return false;
      return true;

    case 'ROUND_UNDER_PAR':
      return typeof eventData.scoreVsPar === 'number' && eventData.scoreVsPar < 0;

    case 'ROUND_AT_PAR':
      return typeof eventData.scoreVsPar === 'number' && eventData.scoreVsPar === 0;

    case 'ROUND_18_HOLES':
      return (eventData.holesLogged || 0) >= 18;

    case 'HOLES_LOGGED':
      return (eventData.holesLogged || 0) >= (conditions.min_holes || 1);

    case 'ROUND_BIRDIE_COUNT':
      return (eventData.birdies || 0) >= (conditions.min_birdies || 1);

    case 'ROUND_WEEKEND': {
      if (!eventData.completedAt) return false;
      const dow = new Date(eventData.completedAt).getDay();
      return dow === 0 || dow === 6;
    }

    case 'ROUND_TIME_MORNING': {
      if (!eventData.completedAt) return false;
      return new Date(eventData.completedAt).getHours() < 12;
    }

    case 'ROUND_TIME_EARLY': {
      if (!eventData.completedAt) return false;
      return new Date(eventData.completedAt).getHours() < 8;
    }

    case 'ROUND_TIME_LATE': {
      if (!eventData.completedAt) return false;
      return new Date(eventData.completedAt).getHours() >= 19;
    }

    case 'BATTLE_WIN_STREAK':
      return (eventData.streak || 0) >= (conditions.streak || 1);

    case 'GOLD_EARNED':
      return (eventData.goldEarned || 0) >= (conditions.min_gold || 1);

    case 'COURSE_REPEAT':
      return true; // handled via courseId lookup in checkCourseRepeatQuest

    case 'ALL_MAIN_COMPLETE':
      return true; // special — checked via route

    default:
      return true;
  }
}

async function awardQuestXp(client, playerId, quest) {
  await client.query(
    `UPDATE players SET xp = xp + $1 WHERE id = $2`,
    [quest.reward_xp, playerId]
  );
  // xp_log is an append-only audit trail — no unique constraint, just insert
  await client.query(
    `INSERT INTO xp_log (player_id, source, amount, context) VALUES ($1, $2, $3, $4)`,
    [playerId, `story_quest_${quest.quest_key}`, quest.reward_xp, quest.title]
  );
}

async function awardQuestGold(client, playerId, quest) {
  await client.query(
    `UPDATE players SET gold = gold + $1 WHERE id = $2`,
    [quest.reward_gold, playerId]
  );
}

async function awardQuestBadge(client, playerId, badgeKey) {
  // player_badges uses (player_id, category, tier) unique constraint
  // Story mode badges use the badge_key as category with 'gold' tier
  await client.query(
    `INSERT INTO player_badges (player_id, category, tier, earned_at)
     VALUES ($1, $2, 'gold', NOW())
     ON CONFLICT (player_id, category, tier) DO NOTHING`,
    [playerId, badgeKey]
  );
}

async function awardQuestItem(client, playerId, itemKey) {
  // vault_items uses 'name' column, not 'item_key'
  const item = await client.query(
    `SELECT id FROM vault_items WHERE name = $1 LIMIT 1`,
    [itemKey]
  );
  if (item.rows.length > 0) {
    // player_inventory has UNIQUE(player_id, item_id) — use it for conflict
    await client.query(
      `INSERT INTO player_inventory (player_id, item_id, acquired_via, acquired_at)
       VALUES ($1, $2, 'story_quest', NOW())
       ON CONFLICT (player_id, item_id) DO UPDATE SET quantity = player_inventory.quantity + 1`,
      [playerId, item.rows[0].id]
    );
  }
}

/**
 * Main quest checking function. Call this from rounds.js, battles.js, crew-wars.js
 * after significant game events.
 *
 * @param {Pool|Client} db - pool or transaction client
 * @param {number} playerId
 * @param {string} eventType - e.g. 'BATTLE_WIN', 'ROUND_UNDER_PAR'
 * @param {object} eventData - { scoreVsPar, battleType, streak, holesLogged, birdies, ... }
 * @returns {Array} newlyCompleted quests
 */
async function checkQuestCompletion(db, playerId, eventType, eventData = {}) {
  const client = await db.connect();
  try {
    client._playerId = playerId;
    await client.query('BEGIN');

    const quests = await client.query(
      `SELECT sq.*, qp.id as progress_id, qp.progress, qp.completed
       FROM story_quests sq
       LEFT JOIN quest_progression qp ON qp.quest_id = sq.id AND qp.player_id = $1
       WHERE sq.trigger_event = $2
         AND (qp.completed IS FALSE OR qp.id IS NULL)
       ORDER BY sq.chapter_number, sq.sort_order`,
      [playerId, eventType]
    );

    const newlyCompleted = [];

    for (const quest of quests.rows) {
      if (quest.completed) continue;
      if (!await evaluateQuestConditions(client, quest, eventData)) continue;

      const newProgress = (quest.progress || 0) + 1;
      const isComplete = newProgress >= quest.target_value;

      if (quest.progress_id) {
        await client.query(
          `UPDATE quest_progression
           SET progress = $1, completed = $2,
               completed_at = CASE WHEN $2 THEN NOW() ELSE completed_at END
           WHERE id = $3`,
          [newProgress, isComplete, quest.progress_id]
        );
      } else {
        await client.query(
          `INSERT INTO quest_progression (player_id, quest_id, progress, completed, completed_at)
           VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN NOW() ELSE NULL END)`,
          [playerId, quest.id, newProgress, isComplete]
        );
      }

      if (isComplete) {
        newlyCompleted.push(quest);
        if (quest.reward_xp > 0) await awardQuestXp(client, playerId, quest);
        if (quest.reward_gold > 0) await awardQuestGold(client, playerId, quest);
        if (quest.reward_badge_key) await awardQuestBadge(client, playerId, quest.reward_badge_key);
        if (quest.reward_item_key) await awardQuestItem(client, playerId, quest.reward_item_key);
      }
    }

    // Special case: COURSE_REPEAT quests need course-specific counting
    if (eventData.courseId) {
      await checkCourseRepeatQuest(client, playerId, eventData.courseId);
    }

    await client.query('COMMIT');
    return newlyCompleted;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client._playerId = null;
    client.release();
  }
}

async function checkCourseRepeatQuest(client, playerId, courseId) {
  const countResult = await client.query(
    `SELECT COUNT(*) AS cnt FROM rounds
     WHERE player_id = $1 AND course_id = $2 AND status = 'completed'`,
    [playerId, courseId]
  );
  const count = parseInt(countResult.rows[0].cnt);

  const quests = await client.query(
    `SELECT sq.*, qp.id as progress_id, qp.progress, qp.completed
     FROM story_quests sq
     LEFT JOIN quest_progression qp ON qp.quest_id = sq.id AND qp.player_id = $1
     WHERE sq.trigger_event = 'COURSE_REPEAT'
       AND (qp.completed IS FALSE OR qp.id IS NULL)`,
    [playerId]
  );

  for (const quest of quests.rows) {
    if (quest.completed) continue;
    // Count must meet or exceed target
    if (count < quest.target_value) continue;

    const isComplete = true;
    if (quest.progress_id) {
      await client.query(
        `UPDATE quest_progression
         SET progress = $1, completed = $2,
             completed_at = CASE WHEN $2 THEN NOW() ELSE completed_at END
         WHERE id = $3`,
        [count, isComplete, quest.progress_id]
      );
    } else {
      await client.query(
        `INSERT INTO quest_progression (player_id, quest_id, progress, completed, completed_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [playerId, quest.id, count, isComplete]
      );
    }
    if (quest.reward_xp > 0) await awardQuestXp(client, playerId, quest);
    if (quest.reward_gold > 0) await awardQuestGold(client, playerId, quest);
    if (quest.reward_badge_key) await awardQuestBadge(client, playerId, quest.reward_badge_key);
    if (quest.reward_item_key) await awardQuestItem(client, playerId, quest.reward_item_key);
  }
}

// ── Express Router ────────────────────────────────────────────────────────────────

module.exports = function storyRouter({ pool }) {
  const router = express.Router();

  async function getUnlockedChapter(playerId) {
    const r = await pool.query(
      `SELECT COALESCE(MAX(sq.chapter_number), 0) as highest_ch
       FROM quest_progression qp
       JOIN story_quests sq ON sq.id = qp.quest_id
       WHERE qp.player_id = $1 AND qp.completed = TRUE AND sq.quest_type = 'main'`,
      [playerId]
    );
    return Math.min(parseInt(r.rows[0]?.highest_ch || 0) + 1, 8);
  }

  // GET /api/story — player's full quest progress
  router.get('/story', requireAuth(pool), async (req, res) => {
    try {
      const playerId = req.player.id;
      const player = await pool.query(
        `SELECT xp, gold, total_rounds, battle_wins FROM players WHERE id = $1`,
        [playerId]
      );
      const unlockedChapter = await getUnlockedChapter(playerId);

      const chaptersResult = await pool.query(
        `SELECT sc.*,
          (SELECT COUNT(*) FROM story_quests sq WHERE sq.chapter_number = sc.chapter_number AND sq.quest_type = 'main') as total_main_quests,
          (SELECT COUNT(*) FROM story_quests sq WHERE sq.chapter_number = sc.chapter_number AND sq.quest_type = 'side') as total_side_quests
         FROM story_chapters sc ORDER BY sc.chapter_number`
      );

      const progressRows = await pool.query(
        `SELECT qp.*, sq.quest_key, sq.chapter_number, sq.quest_type, sq.title,
                sq.description, sq.objective, sq.target_value, sq.trigger_event,
                sq.reward_xp, sq.reward_gold, sq.reward_badge_key, sq.reward_item_key,
                sq.sort_order, sq.xp_to_unlock_next
         FROM quest_progression qp
         JOIN story_quests sq ON sq.id = qp.quest_id
         WHERE qp.player_id = $1
         ORDER BY sq.chapter_number, sq.sort_order`,
        [playerId]
      );

      const progressMap = {};
      for (const row of progressRows.rows) {
        progressMap[row.quest_id] = row;
      }

      const chapters = await Promise.all(chaptersResult.rows.map(async (ch) => {
        const questsResult = await pool.query(
          `SELECT sq.id, sq.quest_key, sq.quest_type, sq.title, sq.description, sq.objective,
                  sq.target_value, sq.trigger_event, sq.reward_xp, sq.reward_gold,
                  sq.reward_badge_key, sq.reward_item_key, sq.sort_order, sq.xp_to_unlock_next,
                  COALESCE(qp.progress, 0) as progress,
                  COALESCE(qp.completed, FALSE) as completed,
                  qp.completed_at
           FROM story_quests sq
           LEFT JOIN quest_progression qp ON qp.quest_id = sq.id AND qp.player_id = $1
           WHERE sq.chapter_number = $2
           ORDER BY sq.quest_type DESC, sq.sort_order`,
          [playerId, ch.chapter_number]
        );
        return {
          ...ch,
          is_locked: ch.chapter_number > unlockedChapter,
          quests: questsResult.rows,
        };
      }));

      const p = player.rows[0];
      const totalMainCompleted = progressRows.rows.filter(r => r.quest_type === 'main' && r.completed).length;
      const totalSideCompleted = progressRows.rows.filter(r => r.quest_type === 'side' && r.completed).length;

      // Count total quest definitions so the frontend doesn't hardcode 28
      let totalMain = 0, totalSide = 0;
      for (const ch of chapters) {
        for (const q of ch.quests) {
          if (q.quest_type === 'main') totalMain++;
          else totalSide++;
        }
      }

      res.json({
        playerXp: p.xp || 0,
        playerGold: p.gold || 0,
        totalRounds: p.total_rounds || 0,
        battleWins: p.battle_wins || 0,
        unlockedChapter,
        totalMain,
        totalSide,
        totalMainCompleted,
        totalSideCompleted,
        chapters,
      });
    } catch (err) {
      console.error('GET /story error:', err);
      res.status(500).json({ error: 'Failed to load story progress' });
    }
  });

  // GET /api/story/chapters — all chapter/quest definitions (no player data)
  router.get('/story/chapters', requireAuth(pool), async (req, res) => {
    try {
      const chapters = await pool.query(
        `SELECT sc.*,
          (SELECT json_agg(sq.* ORDER BY sq.quest_type DESC, sq.sort_order)
           FROM story_quests sq WHERE sq.chapter_number = sc.chapter_number) as quests
         FROM story_chapters sc ORDER BY sc.chapter_number`
      );
      res.json({ chapters: chapters.rows });
    } catch (err) {
      console.error('GET /story/chapters error:', err);
      res.status(500).json({ error: 'Failed to load chapters' });
    }
  });

  // GET /api/story/stats — quick summary for UI
  router.get('/story/stats', requireAuth(pool), async (req, res) => {
    try {
      const playerId = req.player.id;
      const stats = await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM quest_progression qp
            JOIN story_quests sq ON sq.id = qp.quest_id
            WHERE qp.player_id = $1 AND qp.completed = TRUE) as quests_completed,
           (SELECT COUNT(*) FROM story_quests WHERE quest_type = 'main') as total_main_quests,
           (SELECT COUNT(*) FROM story_quests WHERE quest_type = 'side') as total_side_quests,
           (SELECT COALESCE(MAX(sq.chapter_number), 0) FROM quest_progression qp
            JOIN story_quests sq ON sq.id = qp.quest_id
            WHERE qp.player_id = $1 AND qp.completed = TRUE AND sq.quest_type = 'main') as highest_chapter`,
        [playerId]
      );
      res.json(stats.rows[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to load stats' });
    }
  });

  // POST /api/story/quest/:id/complete — manually complete a quest (admin/debug)
  router.post('/story/quest/:id/complete', requireAuth(pool), async (req, res) => {
    try {
      const questId = parseInt(req.params.id);
      const playerId = req.player.id;
      const quest = await pool.query(`SELECT * FROM story_quests WHERE id = $1`, [questId]);
      if (!quest.rows.length) return res.status(404).json({ error: 'Quest not found' });

      const q = quest.rows[0];
      const result = await pool.query(
        `INSERT INTO quest_progression (player_id, quest_id, progress, completed, completed_at)
         VALUES ($1, $2, $3, TRUE, NOW())
         ON CONFLICT (player_id, quest_id) DO UPDATE
           SET completed = TRUE, completed_at = NOW(),
               progress = GREATEST(quest_progression.progress, $3)
         RETURNING *`,
        [playerId, questId, q.target_value]
      );

      if (q.reward_xp > 0) await pool.query(`UPDATE players SET xp = xp + $1 WHERE id = $2`, [q.reward_xp, playerId]);
      if (q.reward_gold > 0) await pool.query(`UPDATE players SET gold = gold + $1 WHERE id = $2`, [q.reward_gold, playerId]);
      if (q.reward_badge_key) {
        await pool.query(
          `INSERT INTO player_badges (player_id, category, tier, earned_at)
           VALUES ($1, $2, 'gold', NOW()) ON CONFLICT (player_id, category, tier) DO NOTHING`,
          [playerId, q.reward_badge_key]
        );
      }
      if (q.reward_item_key) {
        const item = await pool.query(`SELECT id FROM vault_items WHERE name = $1 LIMIT 1`, [q.reward_item_key]);
        if (item.rows.length > 0) {
          await pool.query(
            `INSERT INTO player_inventory (player_id, item_id, acquired_via, acquired_at)
             VALUES ($1, $2, 'story_quest', NOW())
             ON CONFLICT (player_id, item_id) DO UPDATE SET quantity = player_inventory.quantity + 1`,
            [playerId, item.rows[0].id]
          );
        }
      }

      res.json({ success: true, quest: result.rows[0], reward: { xp: q.reward_xp, gold: q.reward_gold } });
    } catch (err) {
      console.error('POST /story/quest/complete error:', err);
      res.status(500).json({ error: 'Failed to complete quest' });
    }
  });

  return router;
};

// Export quest engine functions for use by other routes
module.exports.checkQuestCompletion = checkQuestCompletion;
module.exports.evaluateQuestConditions = evaluateQuestConditions;