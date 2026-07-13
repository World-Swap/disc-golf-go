/**
 * Story Mode — Career Quest System
 * Owns: quest_progression tracking, quest engine, story chapter/quest definitions
 * Does NOT own: rounds.js, battles.js (those call into quest engine)
 *
 * The quest engine is also exported so other routes (rounds.js, battles.js)
 * can call checkQuestCompletion after game events.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUEST VALIDATION REFERENCE — all trigger events and their requirements
 * Keep this updated when adding new quest types.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * HOLE COUNT RULES:
 * - A round counts for ROUND_COMPLETE quests only if it completed with
 *   holes_logged == expected_holes (enforced at round start + completion).
 *   Players cannot start an 18-hole round and submit 9 holes to claim completion.
 * - ROUND_18_HOLES requires holes_logged >= 18 regardless of what was started.
 * - HOLES_LOGGED uses conditions.min_holes (default: 9) — ch1_main_2 requires 9+.
 * - ROUND_CLEAN requires zero bogeys (score > par) across all holes.
 *
 * QUEST TYPES & TRIGGER EVENTS:
 * ┌──────────────────────────┬─────────────────────────────────────────────┬──────────┐
 * │ Trigger Event            │ Validates                                      │ Min Holes│
 * ├──────────────────────────┼─────────────────────────────────────────────┼──────────┤
 * │ ROUND_COMPLETE           │ Round completed (hole count enforced at start)│ 3+       │
 * │ ROUND_18_HOLES           │ holes_logged >= 18                             │ 18       │
 * │ HOLES_LOGGED             │ holes_logged >= trigger_conditions.min_holes   │ 9+       │
 * │ ROUND_UNDER_PAR          │ scoreVsPar < 0                                 │ 3+       │
 * │ ROUND_AT_PAR             │ scoreVsPar === 0                              │ 3+       │
 * │ ROUND_WEEKEND            │ completedAt day-of-week in {0, 6}             │ 3+       │
 * │ ROUND_TIME_MORNING       │ completedAt hour < 12                          │ 3+       │
 * │ ROUND_TIME_EARLY         │ completedAt hour < 8                          │ 3+       │
 * │ ROUND_TIME_LATE          │ completedAt hour >= 19                        │ 3+       │
 * │ ROUND_BIRDIE_COUNT       │ birdies >= conditions.min_birdies              │ 3+       │
 * │ ROUND_ACE                │ aces >= 1 (hole score=1 with par>=2)         │ 3+       │
 * │ ROUND_EAGLE              │ eagles >= 1 (score <= par-2, score > 1)       │ 3+       │
 * │ ROUND_CLEAN              │ zero bogeys AND zero doubles+ across all holes│ 3+       │
 * │ ROUNDS_IN_WINDOW         │ rounds in last conditions.window_days days     │ 3+       │
 * │ BATTLE_WIN / BATTLE_COMPLETE │ eventType matches conditions.battle_type   │ N/A      │
 * │ BATTLE_WIN_STREAK        │ consecutive wins >= conditions.streak           │ N/A      │
 * │ BATTLE_STARTED           │ always true (triggered from battle route)      │ N/A      │
 * │ CHECKIN                  │ DB trigger on checkins insert                  │ N/A      │
 * │ COURSE_REPEAT            │ count of completed rounds at same course       │ 3+       │
 * │ COURSE_VISITED           │ count of distinct course_ids in completed rounds│ 3+     │
 * │ STATES_VISITED           │ count of distinct states in completed rounds    │ 3+       │
 * │ NEW_STATE                │ first-ever round in a new state                │ 3+       │
 * │ GOLD_EARNED              │ gold from this round >= conditions.min_gold    │ 3+       │
 * │ CREW_JOIN                │ triggered from crew route on crew join         │ N/A      │
 * │ CREW_ROUND               │ triggered from crew route on crew round start   │ N/A      │
 * │ CREW_WAR_COMPLETE       │ triggered from crew-wars route                  │ N/A      │
 * │ CREW_WAR_WIN             │ triggered from crew-wars route                  │ N/A      │
 * │ ALL_MAIN_COMPLETE        │ all 28 main quests completed (checked via route)│ N/A   │
 * │ TRAINING_COMPLETE        │ lesson completed via training_completions API  │ N/A   │
 * └──────────────────────────┴─────────────────────────────────────────────┴──────────┘
 *
 * HOLE COUNT ENFORCEMENT SUMMARY:
 * - Round start enforces: holes_count <= course_holes; player picks 9 or 18.
 * - Round completion enforces: holes_logged == holes_count (strict match).
 * - Quest triggers use holes_logged from round completion to gate:
 *   ROUND_18_HOLES, HOLES_LOGGED, ROUND_CLEAN, ROUNDS_IN_WINDOW.
 * - ROUND_COMPLETE fires on any valid round completion (hole count already gated).
 * - Retroactive invalidation: NOT done. Existing completions stand.
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

    case 'ROUND_CLEAN':
      // Requires zero bogeys (score > par) AND zero doubles+ (score >= par+2) across all holes.
      if (!eventData.doublesPlus && !eventData.bogeys) return false;
      return (eventData.doublesPlus || 0) === 0 && (eventData.bogeys || 0) === 0;

    case 'ROUNDS_IN_WINDOW': {
      const windowDays = (conditions.window_days || 7);
      if (!eventData.completedAt) return false;
      const cutoff = new Date(eventData.completedAt);
      cutoff.setDate(cutoff.getDate() - windowDays);
      // eventData.roundsInWindow carries the count of rounds completed within the window
      return (eventData.roundsInWindow || 0) >= quest.target_value;
    }

    case 'COURSE_VISITED': {
      // Count of distinct completed rounds at this course vs target_value
      return (eventData.courseVisitCount || 0) >= quest.target_value;
    }

    case 'STATES_VISITED': {
      // Count of distinct states visited across all completed rounds vs target_value
      return (eventData.statesVisitedCount || 0) >= quest.target_value;
    }

    case 'NEW_STATE': {
      // First-ever round in a state — signal set by rounds.js when a new state is detected
      return eventData.newStateReached === true;
    }

    case 'ALL_MAIN_COMPLETE':
      return true; // special — checked via route

    case 'TRAINING_COMPLETE': {
      const cond = conditions || {};
      if (cond.category_slug && eventData.category_slug !== cond.category_slug) return false;
      if (cond.quiz_correct && (eventData.quiz_correct || 0) < cond.quiz_correct) return false;
      return true;
    }

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

// ── Training Mission Completion ──────────────────────────────────────────────────

/**
 * Check Watch & Learn / Skill Check missions when a player completes a lesson.
 * Call this from POST /api/training/completions after a completion is inserted.
 *
 * @param {Pool|Client} db
 * @param {number} playerId
 * @param {object} lessonData - { lesson_id, category_slug, xp_reward, content_type }
 */
async function checkMissionsFromTraining(db, playerId, lessonData) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Fire TRAINING_COMPLETE quests
    const quests = await client.query(
      `SELECT sq.*, qp.id as progress_id, qp.progress, qp.completed
       FROM story_quests sq
       LEFT JOIN quest_progression qp ON qp.quest_id = sq.id AND qp.player_id = $1
       WHERE sq.trigger_event = 'TRAINING_COMPLETE'
         AND (qp.completed IS FALSE OR qp.id IS NULL)
       ORDER BY sq.sort_order`,
      [playerId]
    );

    const newlyCompleted = [];
    for (const quest of quests.rows) {
      if (quest.completed) continue;
      const conditions = quest.trigger_conditions || {};
      // category_slug filter
      if (conditions.category_slug && lessonData.category_slug !== conditions.category_slug) continue;
      // quiz_correct filter
      if (conditions.quiz_correct && (lessonData.quiz_correct || 0) < conditions.quiz_correct) continue;

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

    await client.query('COMMIT');
    return newlyCompleted;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get or generate today's daily challenge for a player.
 * If none exists for today, picks one at random from the active pool and assigns it.
 *
 * @param {Pool} pool
 * @param {number} playerId
 * @returns {object} daily challenge row
 */
async function getOrCreateDailyChallenge(pool, playerId) {
  const today = new Date().toISOString().split('T')[0];

  // Check if already assigned today
  const existing = await pool.query(
    `SELECT * FROM player_daily_challenges
     WHERE player_id = $1 AND challenge_date = $2`,
    [playerId, today]
  );
  if (existing.rows.length > 0) return existing.rows[0];

  // Assign a random challenge from the pool
  const poolRow = await pool.query(
    `SELECT * FROM daily_challenge_pool
     WHERE is_active = TRUE
     ORDER BY RANDOM()
     LIMIT 1`
  );
  if (!poolRow.rows.length) return null;
  const challenge = poolRow.rows[0];

  await pool.query(
    `INSERT INTO player_daily_challenges
     (player_id, challenge_date, pool_id, title, description, challenge_type,
      target_value, xp_reward, gold_reward, training_slug)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [playerId, today, challenge.id, challenge.title, challenge.description,
     challenge.challenge_type, challenge.target_value, challenge.xp_reward,
     challenge.gold_reward, challenge.training_slug]
  );

  const assigned = await pool.query(
    `SELECT * FROM player_daily_challenges
     WHERE player_id = $1 AND challenge_date = $2`,
    [playerId, today]
  );
  return assigned.rows[0];
}

/**
 * Increment progress on a player's daily challenge.
 * Returns true if the challenge just became completed.
 */
async function advanceDailyChallenge(pool, playerId, challengeDate, delta = 1) {
  const today = challengeDate || new Date().toISOString().split('T')[0];
  const row = await pool.query(
    `UPDATE player_daily_challenges
     SET progress = progress + $1,
         completed = CASE WHEN progress + $1 >= target_value THEN TRUE ELSE completed END,
         completed_at = CASE WHEN progress + $1 >= target_value THEN NOW() ELSE completed_at END
     WHERE player_id = $2 AND challenge_date = $3 AND completed = FALSE
     RETURNING *`,
    [delta, playerId, today]
  );
  if (!row.rows.length) return { completed: false, row: null };
  const updated = row.rows[0];
  const justCompleted = updated.progress >= updated.target_value;
  if (justCompleted) {
    // Award rewards
    if (updated.xp_reward > 0) {
      await pool.query('UPDATE players SET xp = xp + $1 WHERE id = $2', [updated.xp_reward, playerId]);
      await pool.query(
        `INSERT INTO xp_log (player_id, source, amount, context) VALUES ($1, $2, $3, $4)`,
        [playerId, 'daily_challenge_complete', updated.xp_reward, updated.title]
      );
    }
    if (updated.gold_reward > 0) {
      await pool.query('UPDATE players SET gold = gold + $1 WHERE id = $2', [updated.gold_reward, playerId]);
    }
  }
  return { completed: justCompleted, row: updated };
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

  // GET /api/story/missions — Training Missions view (always-unlocked missions + progress)
  // This is the primary endpoint for the "Missions" tab.
  router.get('/story/missions', requireAuth(pool), async (req, res) => {
    try {
      const playerId = req.player.id;

      // Daily challenge
      const daily = await getOrCreateDailyChallenge(pool, playerId);

      // Player stats
      const player = await pool.query(
        `SELECT xp, gold, total_rounds, battle_wins FROM players WHERE id = $1`,
        [playerId]
      );

      // All missions (no chapter locking — all visible)
      const missions = await pool.query(
        `SELECT sq.id, sq.quest_key, sq.title, sq.description, sq.objective,
                sq.target_value, sq.trigger_event, sq.reward_xp, sq.reward_gold,
                sq.reward_badge_key, sq.reward_item_key, sq.mission_type,
                sq.training_link, sq.is_daily, sq.sort_order,
                sq.xp_to_unlock_next,
                COALESCE(qp.progress, 0) as progress,
                COALESCE(qp.completed, FALSE) as completed,
                qp.completed_at
         FROM story_quests sq
         LEFT JOIN quest_progression qp ON qp.quest_id = sq.id AND qp.player_id = $1
         WHERE sq.mission_type IS NOT NULL
            OR sq.chapter_number <= (
                SELECT COALESCE(MAX(sq2.chapter_number), 1)
                FROM quest_progression qp2
                JOIN story_quests sq2 ON sq2.id = qp2.quest_id
                WHERE qp2.player_id = $1 AND qp2.completed = TRUE AND sq2.quest_type = 'main'
            ) + 1
         ORDER BY sq.mission_type NULLS LAST, sq.sort_order`,
        [playerId]
      );

      const p = player.rows[0] || { xp: 0, gold: 0, total_rounds: 0, battle_wins: 0 };

      res.json({
        playerXp: p.xp || 0,
        playerGold: p.gold || 0,
        totalRounds: p.total_rounds || 0,
        battleWins: p.battle_wins || 0,
        dailyChallenge: daily ? {
          id: daily.id,
          title: daily.title,
          description: daily.description,
          challenge_type: daily.challenge_type,
          target_value: daily.target_value,
          progress: daily.progress || 0,
          xp_reward: daily.xp_reward,
          gold_reward: daily.gold_reward,
          training_slug: daily.training_slug,
          completed: daily.completed,
          completed_at: daily.completed_at,
        } : null,
        missions: missions.rows.map(m => ({
          id: m.id,
          quest_key: m.quest_key,
          title: m.title,
          description: m.description,
          objective: m.objective,
          target_value: m.target_value,
          trigger_event: m.trigger_event,
          reward_xp: m.reward_xp,
          reward_gold: m.reward_gold,
          reward_badge_key: m.reward_badge_key,
          reward_item_key: m.reward_item_key,
          mission_type: m.mission_type,
          training_link: m.training_link,
          is_daily: m.is_daily,
          progress: m.progress,
          completed: m.completed,
          completed_at: m.completed_at,
        })),
        totalMissions: missions.rows.length,
        completedCount: missions.rows.filter(m => m.completed).length,
      });
    } catch (err) {
      console.error('GET /story/missions error:', err);
      res.status(500).json({ error: 'Failed to load missions' });
    }
  });

  // GET /api/story/daily — get today's daily challenge (auto-assigns if none)
  router.get('/story/daily', requireAuth(pool), async (req, res) => {
    try {
      const playerId = req.player.id;
      const challenge = await getOrCreateDailyChallenge(pool, playerId);
      if (!challenge) return res.status(500).json({ error: 'No challenges available' });

      res.json({
        id: challenge.id,
        title: challenge.title,
        description: challenge.description,
        challenge_type: challenge.challenge_type,
        target_value: challenge.target_value,
        progress: challenge.progress || 0,
        xp_reward: challenge.xp_reward,
        gold_reward: challenge.gold_reward,
        training_slug: challenge.training_slug,
        completed: challenge.completed,
        completed_at: challenge.completed_at,
        date: challenge.challenge_date,
      });
    } catch (err) {
      console.error('GET /story/daily error:', err);
      res.status(500).json({ error: 'Failed to load daily challenge' });
    }
  });

  return router;
};

// Export quest engine functions for use by other routes
module.exports.checkQuestCompletion = checkQuestCompletion;
module.exports.evaluateQuestConditions = evaluateQuestConditions;
module.exports.checkMissionsFromTraining = checkMissionsFromTraining;
module.exports.getOrCreateDailyChallenge = getOrCreateDailyChallenge;
module.exports.advanceDailyChallenge = advanceDailyChallenge;