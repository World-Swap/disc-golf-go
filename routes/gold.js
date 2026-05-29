/**
 * Gold Currency API
 *
 * GET  /api/gold/balance          — current gold balance for authenticated player
 * GET  /api/vault/items           — all shop items
 * GET  /api/vault/inventory       — player's owned items + active boosts
 * POST /api/vault/buy             — purchase item from shop (deducts gold)
 * POST /api/vault/activate/:itemId — activate a boost from inventory
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');

module.exports = ({ pool }) => {
  const router = express.Router();

  // ── GET /api/gold/balance ────────────────────────────────────────────────────
  router.get('/gold/balance', requireAuth(pool), async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT gold FROM players WHERE id = $1',
        [req.player.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Player not found' });
      res.json({ gold: result.rows[0].gold });
    } catch (err) {
      console.error('Gold balance error:', err.message);
      res.status(500).json({ error: 'Failed to get gold balance' });
    }
  });

  // ── GET /api/vault/items — shop catalog ─────────────────────────────────────
  router.get('/vault/items', requireAuth(pool), async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, name, description, icon, type, effect_value, duration_minutes, rarity, gold_cost
         FROM items ORDER BY gold_cost ASC`
      );
      // Get player's gold balance
      const goldResult = await pool.query('SELECT gold FROM players WHERE id = $1', [req.player.id]);
      res.json({
        items: result.rows,
        player_gold: goldResult.rows[0]?.gold || 0,
      });
    } catch (err) {
      console.error('Vault items error:', err.message);
      res.status(500).json({ error: 'Failed to get items' });
    }
  });

  // ── GET /api/vault/inventory — player's items + active boosts ───────────────
  router.get('/vault/inventory', requireAuth(pool), async (req, res) => {
    try {
      // Player's inventory
      const inventoryResult = await pool.query(
        `SELECT pi.id, pi.item_id, pi.quantity, pi.acquired_via, pi.acquired_at,
                i.name, i.description, i.icon, i.type, i.effect_value, i.duration_minutes, i.rarity, i.gold_cost
         FROM player_inventory pi
         JOIN items i ON i.id = pi.item_id
         WHERE pi.player_id = $1 AND pi.quantity > 0
         ORDER BY i.rarity DESC, i.type ASC`,
        [req.player.id]
      );

      // Active boosts
      const boostsResult = await pool.query(
        `SELECT ab.id, ab.item_id, ab.activated_at, ab.expires_at,
                i.name, i.description, i.icon, i.type, i.effect_value, i.duration_minutes, i.rarity
         FROM active_boosts ab
         JOIN items i ON i.id = ab.item_id
         WHERE ab.player_id = $1 AND ab.expires_at > NOW()
         ORDER BY ab.expires_at ASC`,
        [req.player.id]
      );

      // Player gold
      const goldResult = await pool.query('SELECT gold FROM players WHERE id = $1', [req.player.id]);

      res.json({
        inventory: inventoryResult.rows,
        active_boosts: boostsResult.rows,
        player_gold: goldResult.rows[0]?.gold || 0,
      });
    } catch (err) {
      console.error('Vault inventory error:', err.message);
      res.status(500).json({ error: 'Failed to get inventory' });
    }
  });

  // ── POST /api/vault/buy — purchase item from shop ───────────────────────────
  router.post('/vault/buy', requireAuth(pool), async (req, res) => {
    const { item_id } = req.body;
    if (!item_id) return res.status(400).json({ error: 'item_id required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get item
      const itemResult = await client.query(
        'SELECT * FROM items WHERE id = $1',
        [item_id]
      );
      if (itemResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Item not found' });
      }
      const item = itemResult.rows[0];

      // Get player gold (lock row)
      const playerResult = await client.query(
        'SELECT gold FROM players WHERE id = $1 FOR UPDATE',
        [req.player.id]
      );
      const currentGold = playerResult.rows[0].gold;

      if (currentGold < item.gold_cost) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Not enough gold',
          have: currentGold,
          need: item.gold_cost,
        });
      }

      // Deduct gold
      await client.query(
        'UPDATE players SET gold = gold - $1 WHERE id = $2',
        [item.gold_cost, req.player.id]
      );

      // Record gold spent as negative transaction
      await client.query(
        `INSERT INTO gold_transactions (player_id, amount, event_type, metadata)
         VALUES ($1, $2, 'purchase', $3)`,
        [req.player.id, -item.gold_cost, JSON.stringify({ item_id: item.id, item_name: item.name })]
      );

      // Add to inventory (upsert quantity)
      await client.query(
        `INSERT INTO player_inventory (player_id, item_id, quantity, acquired_via)
         VALUES ($1, $2, 1, 'purchase')
         ON CONFLICT (player_id, item_id) DO UPDATE
           SET quantity = player_inventory.quantity + 1`,
        [req.player.id, item.id]
      );

      const newGoldResult = await client.query('SELECT gold FROM players WHERE id = $1', [req.player.id]);
      await client.query('COMMIT');

      res.json({
        success: true,
        item: { id: item.id, name: item.name, icon: item.icon },
        gold_spent: item.gold_cost,
        new_gold: newGoldResult.rows[0].gold,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Vault buy error:', err.message);
      res.status(500).json({ error: 'Purchase failed' });
    } finally {
      client.release();
    }
  });

  // ── POST /api/vault/activate — activate a boost from inventory (body: { inventory_id }) ─
  router.post('/vault/activate', requireAuth(pool), async (req, res) => {
    const invId = parseInt(req.body.inventory_id);
    if (!invId || isNaN(invId)) return res.status(400).json({ error: 'inventory_id required' });
    return activateBoost(invId, req, res);
  });

  // ── POST /api/vault/activate/:invId — activate a boost from inventory ───────
  router.post('/vault/activate/:invId', requireAuth(pool), async (req, res) => {
    const invId = parseInt(req.params.invId);
    if (!invId || isNaN(invId)) return res.status(400).json({ error: 'invalid inventory_id' });
    return activateBoost(invId, req, res);
  });

  async function activateBoost(invId, req, res) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get inventory entry (verify ownership)
      const invResult = await client.query(
        `SELECT pi.*, i.type, i.duration_minutes, i.name, i.icon, i.rarity, i.effect_value
         FROM player_inventory pi
         JOIN items i ON i.id = pi.item_id
         WHERE pi.id = $1 AND pi.player_id = $2 AND pi.quantity > 0`,
        [invId, req.player.id]
      );
      if (invResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Item not found in inventory' });
      }
      const inv = invResult.rows[0];

      // Deduct from inventory
      await client.query(
        'UPDATE player_inventory SET quantity = quantity - 1 WHERE id = $1',
        [invId]
      );

      // Create active boost
      const expiresAt = new Date(Date.now() + inv.duration_minutes * 60 * 1000);
      const boostResult = await client.query(
        `INSERT INTO active_boosts (player_id, item_id, expires_at) VALUES ($1, $2, $3) RETURNING *`,
        [req.player.id, inv.item_id, expiresAt]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        boost: {
          id: boostResult.rows[0].id,
          item_name: inv.name,
          item_icon: inv.icon,
          type: inv.type,
          effect_value: inv.effect_value,
          expires_at: expiresAt.toISOString(),
          duration_minutes: inv.duration_minutes,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Vault activate error:', err.message);
      res.status(500).json({ error: 'Activation failed' });
    } finally {
      client.release();
    }
  }

  return router;
};
