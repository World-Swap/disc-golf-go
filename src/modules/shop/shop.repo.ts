// src/modules/shop/shop.repo.ts — item shop, inventory, boosts (the `items`
// table + player_inventory + active_boosts). Distinct from the training-content
// vault module; shares only the /vault URL namespace.

import type { PoolClient } from 'pg';
import type { Queryable, Database } from '../../db/types';

export interface ItemRow {
  id: number;
  name: string;
  icon: string | null;
  type: string;
  effect_value: number;
  duration_minutes: number;
  rarity: string;
  gold_cost: number;
}

export function createShopRepo(db: Database) {
  return {
    async gold(exec: Queryable, playerId: number): Promise<number> {
      const r = await exec.query<{ gold: number }>('SELECT gold FROM players WHERE id = $1', [playerId]);
      return r.rows[0]?.gold ?? 0;
    },

    async playerExists(playerId: number): Promise<boolean> {
      const r = await db.query('SELECT 1 FROM players WHERE id = $1', [playerId]);
      return r.rows.length > 0;
    },

    async shopItems() {
      const r = await db.query('SELECT id, name, description, icon, type, effect_value, duration_minutes, rarity, gold_cost FROM items ORDER BY gold_cost ASC');
      return r.rows;
    },

    async inventory(playerId: number) {
      const r = await db.query(
        `SELECT pi.id, pi.item_id, pi.quantity, pi.acquired_via, pi.acquired_at,
                i.name, i.description, i.icon, i.type, i.effect_value, i.duration_minutes, i.rarity, i.gold_cost
         FROM player_inventory pi JOIN items i ON i.id = pi.item_id
         WHERE pi.player_id = $1 AND pi.quantity > 0 ORDER BY i.rarity DESC, i.type ASC`,
        [playerId]
      );
      return r.rows;
    },

    async activeBoosts(playerId: number) {
      const r = await db.query(
        `SELECT ab.id, ab.item_id, ab.activated_at, ab.expires_at,
                i.name, i.description, i.icon, i.type, i.effect_value, i.duration_minutes, i.rarity
         FROM active_boosts ab JOIN items i ON i.id = ab.item_id
         WHERE ab.player_id = $1 AND ab.expires_at > NOW() ORDER BY ab.expires_at ASC`,
        [playerId]
      );
      return r.rows;
    },

    // ── buy (transaction) ──
    async loadItem(client: PoolClient, itemId: number): Promise<(ItemRow & { description: string | null }) | null> {
      const r = await client.query<ItemRow & { description: string | null }>('SELECT * FROM items WHERE id = $1', [itemId]);
      return r.rows[0] ?? null;
    },

    async lockGold(client: PoolClient, playerId: number): Promise<number | null> {
      const r = await client.query<{ gold: number }>('SELECT gold FROM players WHERE id = $1 FOR UPDATE', [playerId]);
      return r.rows[0]?.gold ?? null;
    },

    async recordPurchase(client: PoolClient, playerId: number, item: { id: number; name: string; gold_cost: number }) {
      await client.query('UPDATE players SET gold = gold - $1 WHERE id = $2', [item.gold_cost, playerId]);
      await client.query(
        `INSERT INTO gold_transactions (player_id, amount, event_type, metadata) VALUES ($1, $2, 'purchase', $3)`,
        [playerId, -item.gold_cost, JSON.stringify({ item_id: item.id, item_name: item.name })]
      );
      await client.query(
        `INSERT INTO player_inventory (player_id, item_id, quantity, acquired_via) VALUES ($1, $2, 1, 'purchase')
         ON CONFLICT (player_id, item_id) DO UPDATE SET quantity = player_inventory.quantity + 1`,
        [playerId, item.id]
      );
    },

    // ── activate (transaction) ──
    async loadInventoryEntry(client: PoolClient, invId: number, playerId: number) {
      const r = await client.query<{ id: number; item_id: number; type: string; duration_minutes: number; name: string; icon: string | null; rarity: string; effect_value: number }>(
        `SELECT pi.id, pi.item_id, i.type, i.duration_minutes, i.name, i.icon, i.rarity, i.effect_value
         FROM player_inventory pi JOIN items i ON i.id = pi.item_id
         WHERE pi.id = $1 AND pi.player_id = $2 AND pi.quantity > 0`,
        [invId, playerId]
      );
      return r.rows[0] ?? null;
    },

    async decrementInventory(client: PoolClient, invId: number) {
      await client.query('UPDATE player_inventory SET quantity = quantity - 1 WHERE id = $1', [invId]);
    },

    async insertBoost(client: PoolClient, playerId: number, itemId: number, expiresAt: Date): Promise<number> {
      const r = await client.query<{ id: number }>('INSERT INTO active_boosts (player_id, item_id, expires_at) VALUES ($1, $2, $3) RETURNING id', [playerId, itemId, expiresAt]);
      return r.rows[0]!.id;
    },
  };
}

export type ShopRepo = ReturnType<typeof createShopRepo>;
