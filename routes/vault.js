/**
 * Vault Route — Disc Golf Go
 * Handles: shop items, player inventory, boost activation, gold tracking
 *
 * Table names: vault_items, player_inventory, active_boosts, gold_transactions
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
}

/**
 * Add an item to inventory (upsert quantity).
 */
async function addToInventory(db, playerId, itemId, acquiredVia = 'drop') {
  await db.query(
    `INSERT INTO player_inventory (player_id, item_id, quantity, acquired_via)
     VALUES ($1, $2, 1, $3)
     ON CONFLICT (player_id, item_id)
     DO UPDATE SET quantity = player_inventory.quantity + 1`,
    [playerId, itemId, acquiredVia]
  );
}

// Real-money (Stripe/USD) purchase flows removed — Apple App Store compliance.
// All vault items are purchasable with gold only. See CLAUDE.md Recent changes.

// ──────────────────────────────────────────────
// ROUTER
// ──────────────────────────────────────────────

const routerFactory = ({ pool }) => {
  const router = express.Router();

  // ────────────────────────────────────────────────────────────────
  // GET /api/vault/items — shop catalog (public, no auth needed for browsing)
  // ────────────────────────────────────────────────────────────────
  router.get('/vault/items', async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, name, description, icon, item_type AS type,
                effect_value, duration_minutes, rarity, gold_cost
         FROM vault_items
         WHERE is_purchasable = true
         ORDER BY sort_order`
      );
      res.json({ items: result.rows });
    } catch (err) {
      console.error('vault/items error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ────────────────────────────────────────────────────────────────
  // GET /api/vault/shop — alias for items, also returns gold balance
  // ────────────────────────────────────────────────────────────────
  router.get('/vault/shop', requireAuth(pool), async (req, res) => {
    try {
      const [itemsResult, playerResult] = await Promise.all([
        pool.query(
          `SELECT id, name, description, icon, item_type AS type,
                  effect_value, duration_minutes, rarity, gold_cost
           FROM vault_items WHERE is_purchasable = true ORDER BY sort_order`
        ),
        pool.query('SELECT gold FROM players WHERE id = $1', [req.player.id]),
      ]);
      res.json({
        items: itemsResult.rows,
        gold_balance: playerResult.rows[0]?.gold ?? 0,
      });
    } catch (err) {
      console.error('vault/shop error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ────────────────────────────────────────────────────────────────
  // GET /api/vault/inventory — inventory + active boosts + gold balance
  // Shape expected by vault.html: { gold, inventory: [...], active_boosts: [...] }
  // ────────────────────────────────────────────────────────────────
  router.get('/vault/inventory', requireAuth(pool), async (req, res) => {
    try {
      const [goldRes, invRes, boostRes] = await Promise.all([
        pool.query('SELECT gold FROM players WHERE id = $1', [req.player.id]),
        pool.query(
          `SELECT pi.id, pi.item_id, pi.quantity, pi.acquired_via, pi.acquired_at,
                  vi.name, vi.description, vi.icon,
                  vi.item_type AS type,
                  vi.effect_value, vi.duration_minutes, vi.rarity, vi.gold_cost
           FROM player_inventory pi
           JOIN vault_items vi ON vi.id = pi.item_id
           WHERE pi.player_id = $1 AND pi.quantity > 0
           ORDER BY vi.sort_order, vi.name`,
          [req.player.id]
        ),
        pool.query(
          `SELECT ab.id, ab.item_id, ab.boost_type AS type, ab.effect_value,
                  ab.activated_at, ab.expires_at,
                  vi.name, vi.icon, vi.rarity
           FROM active_boosts ab
           JOIN vault_items vi ON vi.id = ab.item_id
           WHERE ab.player_id = $1 AND ab.expires_at > NOW()
           ORDER BY ab.expires_at ASC`,
          [req.player.id]
        ),
      ]);

      res.json({
        gold: goldRes.rows[0]?.gold ?? 0,
        inventory: invRes.rows,
        active_boosts: boostRes.rows,
      });
    } catch (err) {
      console.error('vault/inventory error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ────────────────────────────────────────────────────────────────
  // POST /api/vault/buy — purchase an item (deduct gold, add to inventory)
  // Body: { item_id }
  // ────────────────────────────────────────────────────────────────
  router.post('/vault/buy', requireAuth(pool), async (req, res) => {
    const { item_id } = req.body;
    if (!item_id) return res.status(400).json({ error: 'item_id required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock player row and check gold
      const playerRes = await client.query(
        'SELECT gold FROM players WHERE id = $1 FOR UPDATE',
        [req.player.id]
      );
      if (!playerRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Player not found' });
      }
      const currentGold = playerRes.rows[0].gold;

      // Load item
      const itemRes = await client.query(
        `SELECT id, name, icon, item_type AS type, effect_value,
                duration_minutes, rarity, gold_cost
         FROM vault_items WHERE id = $1 AND is_purchasable = true`,
        [item_id]
      );
      if (!itemRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Item not found' });
      }
      const item = itemRes.rows[0];

      if (currentGold < item.gold_cost) {
        await client.query('ROLLBACK');
        return res.status(402).json({
          error: 'Not enough gold',
          gold: currentGold,
          cost: item.gold_cost,
          shortfall: item.gold_cost - currentGold,
        });
      }

      // Deduct gold + record transaction
      await client.query(
        'UPDATE players SET gold = gold - $1 WHERE id = $2',
        [item.gold_cost, req.player.id]
      );
      await client.query(
        `INSERT INTO gold_transactions (player_id, amount, event_type, metadata)
         VALUES ($1, $2, 'purchase', $3)`,
        [req.player.id, -item.gold_cost, JSON.stringify({ item_id: item.id, item_name: item.name })]
      );

      // Upsert inventory
      await client.query(
        `INSERT INTO player_inventory (player_id, item_id, quantity, acquired_via)
         VALUES ($1, $2, 1, 'purchase')
         ON CONFLICT (player_id, item_id)
         DO UPDATE SET quantity = player_inventory.quantity + 1`,
        [req.player.id, item.id]
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
      console.error('vault/buy error:', err.message);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  });

  // ────────────────────────────────────────────────────────────────
  // POST /api/vault/activate — activate a boost from inventory
  // Body: { inventory_id } — the player_inventory.id row
  // Stacks duration if same boost_type already active
  // ────────────────────────────────────────────────────────────────
  router.post('/vault/activate', requireAuth(pool), async (req, res) => {
    const { inventory_id } = req.body;
    if (!inventory_id) return res.status(400).json({ error: 'inventory_id required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get inventory row + item details
      const invRes = await client.query(
        `SELECT pi.id, pi.quantity, pi.item_id,
                vi.name, vi.icon, vi.item_type AS type,
                vi.effect_value, vi.duration_minutes, vi.rarity
         FROM player_inventory pi
         JOIN vault_items vi ON vi.id = pi.item_id
         WHERE pi.id = $1 AND pi.player_id = $2 AND pi.quantity > 0`,
        [inventory_id, req.player.id]
      );
      if (!invRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Item not found in inventory' });
      }
      const inv = invRes.rows[0];

      if (!inv.type || !inv.type.startsWith('boost_')) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Item is not a boost' });
      }

      // Decrement quantity
      await client.query(
        'UPDATE player_inventory SET quantity = quantity - 1 WHERE id = $1',
        [inventory_id]
      );

      // Check if same boost_type is already active → stack duration
      const existingRes = await client.query(
        `SELECT id, expires_at FROM active_boosts
         WHERE player_id = $1 AND boost_type = $2 AND expires_at > NOW()
         ORDER BY expires_at DESC LIMIT 1`,
        [req.player.id, inv.type]
      );

      let expiresAt;
      if (existingRes.rows.length) {
        // Extend existing boost duration
        const currentExpiry = new Date(existingRes.rows[0].expires_at);
        expiresAt = new Date(currentExpiry.getTime() + inv.duration_minutes * 60 * 1000);
        await client.query(
          'UPDATE active_boosts SET expires_at = $1 WHERE id = $2',
          [expiresAt.toISOString(), existingRes.rows[0].id]
        );
      } else {
        // Create new boost
        expiresAt = new Date(Date.now() + inv.duration_minutes * 60 * 1000);
        await client.query(
          `INSERT INTO active_boosts (player_id, item_id, boost_type, effect_value, expires_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.player.id, inv.item_id, inv.type, inv.effect_value, expiresAt.toISOString()]
        );
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        boost: {
          item_name: inv.name,
          icon: inv.icon,
          type: inv.type,
          effect_value: inv.effect_value,
          expires_at: expiresAt.toISOString(),
          stacked: existingRes.rows.length > 0,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('vault/activate error:', err.message);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  });

  // ────────────────────────────────────────────────────────────────
  // GET /api/vault/active-boosts — profile widget endpoint
  // Returns: { gold, active_boosts: [...] }
  // ────────────────────────────────────────────────────────────────
  router.get('/vault/active-boosts', requireAuth(pool), async (req, res) => {
    try {
      const [boostRes, goldRes] = await Promise.all([
        pool.query(
          `SELECT ab.id, ab.boost_type AS type, ab.effect_value, ab.expires_at,
                  vi.name, vi.icon
           FROM active_boosts ab
           JOIN vault_items vi ON vi.id = ab.item_id
           WHERE ab.player_id = $1 AND ab.expires_at > NOW()
           ORDER BY ab.expires_at ASC`,
          [req.player.id]
        ),
        pool.query('SELECT gold FROM players WHERE id = $1', [req.player.id]),
      ]);
      res.json({
        active_boosts: boostRes.rows,
        gold: goldRes.rows[0]?.gold ?? 0,
      });
    } catch (err) {
      console.error('vault/active-boosts error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ────────────────────────────────────────────────────────────────
  // GET /api/boosts/active — original endpoint (used by checkins/rounds)
  // ────────────────────────────────────────────────────────────────
  router.get('/boosts/active', requireAuth(pool), async (req, res) => {
    try {
      const boosts = await getActiveBoosts(pool, req.player.id);
      res.json({
        boosts: boosts.map(b => ({
          ...b,
          remaining_ms: Math.max(0, new Date(b.expires_at) - Date.now()),
        })),
      });
    } catch (err) {
      console.error('boosts/active error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ────────────────────────────────────────────────────────────────
  // GET /api/vault/gold — gold balance + recent transactions
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
      console.error('vault/gold error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
};

module.exports = routerFactory;

// Utility exports (used by rounds.js, checkins.js, challenges.js)
module.exports.getActiveBoosts = getActiveBoosts;
module.exports.applyXpBoost = applyXpBoost;
module.exports.applyGoldBoost = applyGoldBoost;
module.exports.getDropRate = getDropRate;
module.exports.awardGold = awardGold;
module.exports.rollItemDrop = rollItemDrop;
module.exports.addToInventory = addToInventory;
module.exports.GOLD_EVENTS = GOLD_EVENTS;
