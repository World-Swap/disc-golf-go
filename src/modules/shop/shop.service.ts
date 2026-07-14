// src/modules/shop/shop.service.ts — gold balance, shop catalog, inventory,
// purchases, and boost activation.

import { notFound, badRequest, AppError } from '../../http/errors';
import { withTransaction } from '../../db/pool';
import type { Database } from '../../db/types';
import { createShopRepo, type ShopRepo } from './shop.repo';

export function createShopService(db: Database, repo: ShopRepo = createShopRepo(db)) {
  return {
    async balance(playerId: number) {
      if (!(await repo.playerExists(playerId))) throw notFound('Player not found');
      return { gold: await repo.gold(db, playerId) };
    },

    async items(playerId: number) {
      const [items, player_gold] = await Promise.all([repo.shopItems(), repo.gold(db, playerId)]);
      return { items, player_gold };
    },

    async inventory(playerId: number) {
      const [inventory, active_boosts, player_gold] = await Promise.all([repo.inventory(playerId), repo.activeBoosts(playerId), repo.gold(db, playerId)]);
      return { inventory, active_boosts, player_gold };
    },

    async buy(playerId: number, itemId: number) {
      if (!itemId) throw badRequest('item_id required');
      return withTransaction(db, async (client) => {
        const item = await repo.loadItem(client, itemId);
        if (!item) throw notFound('Item not found');

        const currentGold = await repo.lockGold(client, playerId);
        if (currentGold == null) throw notFound('Player not found');
        if (currentGold < item.gold_cost) {
          throw new AppError(400, 'Not enough gold', { have: currentGold, need: item.gold_cost });
        }

        await repo.recordPurchase(client, playerId, item);
        return {
          success: true,
          item: { id: item.id, name: item.name, icon: item.icon },
          gold_spent: item.gold_cost,
          new_gold: currentGold - item.gold_cost,
        };
      });
    },

    async activate(playerId: number, invId: number) {
      if (!invId || Number.isNaN(invId)) throw badRequest('inventory_id required');
      return withTransaction(db, async (client) => {
        const inv = await repo.loadInventoryEntry(client, invId, playerId);
        if (!inv) throw notFound('Item not found in inventory');

        await repo.decrementInventory(client, invId);
        const expiresAt = new Date(Date.now() + inv.duration_minutes * 60 * 1000);
        const boostId = await repo.insertBoost(client, playerId, inv.item_id, expiresAt);

        return {
          success: true,
          boost: {
            id: boostId,
            item_name: inv.name,
            item_icon: inv.icon,
            type: inv.type,
            effect_value: inv.effect_value,
            expires_at: expiresAt.toISOString(),
            duration_minutes: inv.duration_minutes,
          },
        };
      });
    },
  };
}

export type ShopService = ReturnType<typeof createShopService>;
