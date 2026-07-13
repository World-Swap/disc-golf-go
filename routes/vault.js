/**
 * Vault Route — Disc Golf Go
 * Handles: My Library (completed lesson videos + resources),
 *          Bonus Content (gold-purchasable premium instructor videos)
 *
 * Table names: vault_training_items, player_vault_training_unlocks, gold_transactions
 * Auth: uses req.player.id (set by requireAuth middleware)
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');

// ──────────────────────────────────────────────
// GOLD AWARD RATES (base amounts before boost)
// ──────────────────────────────────────────────
const GOLD_EVENTS = {
  checkin_new_course:  50,
  checkin_return:      10,
  round_complete:      30,
  challenge_easy:      25,
  challenge_medium:    60,
  challenge_hard:     125,
  challenge_legendary: 300,
  battle_victory:      50,
};

// Base item drop chance per round completion
const BASE_DROP_RATE = 0.15;

// ──────────────────────────────────────────────
// UTILITY FUNCTIONS (exported for other routes)
// ──────────────────────────────────────────────

/**
 * Get active boosts for a player. Works with both pool and a pg client.
 * Returns rows with: id, boost_type, effect_value, expires_at, name, icon
 */
async function getActiveBoosts(db, playerId) {
  try {
    const result = await db.query(
      `SELECT ab.id, ab.boost_type, ab.effect_value, ab.expires_at,
              vi.name, vi.icon
       FROM active_boosts ab
       JOIN vault_items vi ON vi.id = ab.item_id
       WHERE ab.player_id = $1 AND ab.expires_at > NOW()
       ORDER BY ab.boost_type, ab.expires_at DESC`,
      [playerId]
    );
    return result.rows;
  } catch (err) {
    console.error('[vault] getActiveBoosts failed:', err.message);
    return [];
  }
}

/**
 * Apply XP boost multiplier to a base amount.
 */
function applyXpBoost(baseAmount, activeBoosts) {
  const boost = (activeBoosts || []).find(b => b.boost_type === 'boost_xp');
  if (!boost) return { baseAmount, boostedAmount: baseAmount, boostPercent: 0, boostLabel: null };
  const boostedAmount = Math.round(baseAmount * (1 + boost.effect_value / 100));
  return { baseAmount, boostedAmount, boostPercent: boost.effect_value, boostLabel: `🔥 +${boost.effect_value}% boost` };
}

/**
 * Apply gold boost multiplier to a base amount.
 */
function applyGoldBoost(baseAmount, activeBoosts) {
  const boost = (activeBoosts || []).find(b => b.boost_type === 'boost_gold');
  if (!boost) return { baseAmount, boostedAmount: baseAmount, boostPercent: 0, boostLabel: null };
  const boostedAmount = Math.round(baseAmount * (1 + boost.effect_value / 100));
  return { baseAmount, boostedAmount, boostPercent: boost.effect_value, boostLabel: `💰 +${boost.effect_value}% boost` };
}

/**
 * Get effective drop rate for a player.
 */
function getDropRate(activeBoosts) {
  const boost = (activeBoosts || []).find(b => b.boost_type === 'boost_drops');
  return BASE_DROP_RATE + (boost ? boost.effect_value / 100 : 0);
}

/**
 * Award gold to a player. Applies active gold boost automatically.
 * db can be a pool or a pg client (both have .query).
 * Returns { baseAmount, finalAmount, boostPercent, newBalance }
 */
async function awardGold(db, playerId, reason, baseAmount, activeBoosts = null, metadata = {}) {
  let boosts = activeBoosts;
  if (!boosts) {
    boosts = await getActiveBoosts(db, playerId);
  }
  const { boostedAmount, boostPercent } = applyGoldBoost(baseAmount, boosts);

  await db.query(
    `INSERT INTO gold_transactions (player_id, amount, event_type, metadata)
     VALUES ($1, $2, $3, $4)`,
    [playerId, boostedAmount, reason, JSON.stringify({ ...metadata, base_amount: baseAmount, boost_percent: boostPercent })]
  );

  const result = await db.query(
    `UPDATE players SET gold = gold + $1 WHERE id = $2 RETURNING gold`,
    [boostedAmount, playerId]
  );

  return {
    baseAmount,
    finalAmount: boostedAmount,
    boostPercent,
    newBalance: result.rows[0].gold,
  };
}

/**
 * Roll for an item drop. Returns a vault_items row or null.
 */
async function rollItemDrop(pool, playerId, activeBoosts = null) {
  try {
    let boosts = activeBoosts;
    if (!boosts) boosts = await getActiveBoosts(pool, playerId);
    const dropRate = getDropRate(boosts);
    if (Math.random() > dropRate) return null;

    const rarityWeights = { common: 50, uncommon: 30, rare: 14, epic: 5, legendary: 1 };
    const items = await pool.query(`SELECT * FROM vault_items`);
    const pool_ = [];
    for (const item of items.rows) {
      const w = rarityWeights[item.rarity] || 10;
      for (let i = 0; i < w; i++) pool_.push(item);
    }
    if (!pool_.length) return null;
    return pool_[Math.floor(Math.random() * pool_.length)];
  } catch (err) {
    console.error('[vault] rollItemDrop failed:', err.message);
    return null;
  }
}

/**
 * Add an item to inventory (upsert quantity).
 */
async function addToInventory(db, playerId, itemId, acquiredVia = 'drop') {
  try {
    await db.query(
      `INSERT INTO player_inventory (player_id, item_id, quantity, acquired_via)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (player_id, item_id)
       DO UPDATE SET quantity = player_inventory.quantity + 1`,
      [playerId, itemId, acquiredVia]
    );
  } catch (err) {
    console.error('[vault] addToInventory failed:', err.message);
  }
}

// ──────────────────────────────────────────────
// ROUTER
// ──────────────────────────────────────────────

const routerFactory = ({ pool }) => {
  const router = express.Router();

  // ────────────────────────────────────────────────────────────────
  // GET /api/vault/library — completed lesson videos + reading links
  // Authenticated: returns lessons grouped by category
  // Unauthenticated: returns { authenticated: false }
  // ────────────────────────────────────────────────────────────────
  router.get('/vault/library', requireAuth(pool), async (req, res) => {
    try {
      // Get completed lesson IDs for this player
      const completedRows = await pool.query(
        `SELECT lesson_id FROM training_completions WHERE player_id = $1`,
        [req.player.id]
      );
      const completedIds = completedRows.rows.map(r => r.lesson_id);

      if (!completedIds.length) {
        return res.json({ authenticated: true, categories: [] });
      }

      // Get completed lessons that have a youtube_url, joined to categories
      const lessonsResult = await pool.query(
        `SELECT l.id, l.title, l.youtube_url, l.youtube_title, l.youtube_channel,
                c.id AS category_id, c.name AS category_name,
                c.icon AS category_icon, c.slug AS category_slug
         FROM training_lessons l
         JOIN training_categories c ON c.id = l.category_id
         WHERE l.id = ANY($1::int[])
           AND l.is_active = true
           AND l.youtube_url IS NOT NULL
           AND l.youtube_url != ''
         ORDER BY c.sort_order, l.sort_order`,
        [completedIds]
      );

      if (!lessonsResult.rows.length) {
        return res.json({ authenticated: true, categories: [] });
      }

      // Fetch resources for all these lessons
      const resourceRows = await pool.query(
        `SELECT lr.lesson_id, lr.title, lr.url, lr.resource_type
         FROM lesson_resources lr
         WHERE lr.lesson_id = ANY($1::int[])
         ORDER BY lr.display_order ASC, lr.id ASC`,
        [lessonsResult.rows.map(l => l.id)]
      );

      // Group resources by lesson_id
      const resourcesByLesson = {};
      for (const r of resourceRows.rows) {
        if (!resourcesByLesson[r.lesson_id]) resourcesByLesson[r.lesson_id] = [];
        resourcesByLesson[r.lesson_id].push({
          title: r.title,
          url: r.url,
          resource_type: r.resource_type,
        });
      }

      // Group lessons by category
      const categoryMap = {};
      for (const lesson of lessonsResult.rows) {
        if (!categoryMap[lesson.category_id]) {
          categoryMap[lesson.category_id] = {
            id: lesson.category_id,
            name: lesson.category_name,
            icon: lesson.category_icon,
            slug: lesson.category_slug,
            lessons: [],
          };
        }
        categoryMap[lesson.category_id].lessons.push({
          id: lesson.id,
          title: lesson.title,
          youtube_url: lesson.youtube_url,
          youtube_title: lesson.youtube_title,
          youtube_channel: lesson.youtube_channel,
          resources: resourcesByLesson[lesson.id] || [],
        });
      }

      const categories = Object.values(categoryMap).sort((a, b) => {
        // Use sort_order from DB — fetch it explicitly
        return 0;
      });

      res.json({ authenticated: true, categories });
    } catch (err) {
      console.error('[vault] GET /library error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ────────────────────────────────────────────────────────────────
  // GET /api/vault/bonus — premium instructor videos catalog
  // Public browse (no auth required), purchased flag + gold_balance require auth
  // ────────────────────────────────────────────────────────────────
  router.get('/vault/bonus', async (req, res) => {
    try {
      const itemsResult = await pool.query(
        `SELECT id, name, description, preview, icon, gold_cost, item_type, content,
                instructor_name, youtube_url, thumbnail_url
         FROM vault_training_items
         WHERE is_active = true
           AND youtube_url IS NOT NULL
           AND youtube_url <> ''
         ORDER BY sort_order, id`
      );

      let purchasedIds = new Set();
      let goldBalance = null;

      // Only check purchased status if auth is present
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const { JWT_SECRET } = require('../middleware/auth');
        const jwt = require('jsonwebtoken');
        try {
          const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
          if (decoded && decoded.id) {
            const playerId = decoded.id;

            const [playerResult, purchasedResult] = await Promise.all([
              pool.query('SELECT gold FROM players WHERE id = $1', [playerId]),
              pool.query(
                `SELECT item_id FROM player_vault_training_unlocks WHERE player_id = $1`,
                [playerId]
              ),
            ]);

            goldBalance = playerResult.rows[0]?.gold ?? 0;
            purchasedIds = new Set(purchasedResult.rows.map(r => r.item_id));
          }
        } catch (_e) {
          // Invalid token — treat as unauthenticated for purchased/gold
        }
      }

      const typeLabels = {
        premium_tip: 'Premium Tip',
        disc_guide: 'Disc Guide',
        technique_breakdown: 'Technique Breakdown',
        instructor_video: 'Instructor Video',
      };

      const items = itemsResult.rows.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description,
        preview: item.preview,
        icon: item.icon,
        gold_cost: item.gold_cost,
        item_type: item.item_type,
        type_label: typeLabels[item.item_type] || item.item_type,
        purchased: purchasedIds.has(item.id),
        instructor_name: item.instructor_name || null,
        youtube_url: item.youtube_url || null,
        thumbnail_url: item.thumbnail_url || null,
        content: item.content || null,
      }));

      res.json({
        items,
        gold_balance: goldBalance,
        authenticated: goldBalance !== null,
      });
    } catch (err) {
      console.error('[vault] GET /bonus error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ────────────────────────────────────────────────────────────────
  // GET /api/vault/gold — gold balance + recent transactions (still used)
  // ────────────────────────────────────────────────────────────────
  router.get('/vault/gold', requireAuth(pool), async (req, res) => {
    try {
      const [playerResult, txResult] = await Promise.all([
        pool.query('SELECT gold FROM players WHERE id = $1', [req.player.id]),
        pool.query(
          `SELECT amount, event_type, metadata, created_at FROM gold_transactions
           WHERE player_id = $1 ORDER BY created_at DESC LIMIT 20`,
          [req.player.id]
        ),
      ]);
      res.json({
        gold_balance: playerResult.rows[0]?.gold ?? 0,
        transactions: txResult.rows,
      });
    } catch (err) {
      console.error('[vault/gold] error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ────────────────────────────────────────────────────────────────
  // POST /api/vault/training/unlock — purchase a bonus item with gold
  // Body: { item_id }
  // ────────────────────────────────────────────────────────────────
  router.post('/vault/training/unlock', requireAuth(pool), async (req, res) => {
    const { item_id } = req.body;
    if (!item_id) return res.status(400).json({ error: 'item_id required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const playerRes = await client.query(
        'SELECT gold FROM players WHERE id = $1 FOR UPDATE',
        [req.player.id]
      );
      if (!playerRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Player not found' });
      }
      const currentGold = playerRes.rows[0].gold;

      const itemRes = await client.query(
        `SELECT id, name, gold_cost FROM vault_training_items WHERE id = $1 AND is_active = true`,
        [item_id]
      );
      if (!itemRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Training item not found' });
      }
      const item = itemRes.rows[0];

      const alreadyUnlocked = await client.query(
        `SELECT 1 FROM player_vault_training_unlocks WHERE player_id = $1 AND item_id = $2`,
        [req.player.id, item_id]
      );
      if (alreadyUnlocked.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Already unlocked', item_name: item.name });
      }

      if (currentGold < item.gold_cost) {
        await client.query('ROLLBACK');
        return res.status(402).json({
          error: 'Not enough gold',
          gold: currentGold,
          cost: item.gold_cost,
          shortfall: item.gold_cost - currentGold,
        });
      }

      await client.query(
        'UPDATE players SET gold = gold - $1 WHERE id = $2',
        [item.gold_cost, req.player.id]
      );
      await client.query(
        `INSERT INTO gold_transactions (player_id, amount, event_type, metadata)
         VALUES ($1, $2, 'training_unlock', $3)`,
        [req.player.id, -item.gold_cost, JSON.stringify({ item_id: item.id, item_name: item.name })]
      );

      await client.query(
        `INSERT INTO player_vault_training_unlocks (player_id, item_id) VALUES ($1, $2)`,
        [req.player.id, item_id]
      );

      await client.query('COMMIT');

      const newGoldRes = await pool.query('SELECT gold FROM players WHERE id = $1', [req.player.id]);
      res.json({
        success: true,
        item_name: item.name,
        gold_spent: item.gold_cost,
        gold: newGoldRes.rows[0].gold,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[vault/training/unlock] error:', err.message);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  });

  return router;
};

module.exports = routerFactory;

// Utility exports (used by rounds.js, challenges.js)
module.exports.getActiveBoosts = getActiveBoosts;
module.exports.applyXpBoost = applyXpBoost;
module.exports.applyGoldBoost = applyGoldBoost;
module.exports.getDropRate = getDropRate;
module.exports.awardGold = awardGold;
module.exports.rollItemDrop = rollItemDrop;
module.exports.addToInventory = addToInventory;
module.exports.GOLD_EVENTS = GOLD_EVENTS;