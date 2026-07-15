// src/modules/vault/vault.service.ts — vault logic: library grouping, bonus
// catalog with purchase status, gold balance, and gold purchases.

import { notFound, conflict, AppError } from '../../http/errors';
import { withTransaction } from '../../db/pool';
import type { Database } from '../../db/types';
import { createVaultRepo, type VaultRepo, type LessonVideoRow } from './vault.repo';

const TYPE_LABELS: Record<string, string> = {
  premium_tip: 'Premium Tip',
  disc_guide: 'Disc Guide',
  technique_breakdown: 'Technique Breakdown',
  instructor_video: 'Instructor Video',
};

export function createVaultService(db: Database, repo: VaultRepo = createVaultRepo(db)) {
  return {
    async library(playerId: number) {
      const completedIds = await repo.completedLessonIds(playerId);
      if (completedIds.length === 0) return { authenticated: true, categories: [] };

      const lessons = await repo.completedVideoLessons(completedIds);
      if (lessons.length === 0) return { authenticated: true, categories: [] };

      const resources = await repo.resourcesForLessons(lessons.map((l) => l.id));
      const byLesson = new Map<number, Array<{ title: string; url: string; resource_type: string }>>();
      for (const r of resources) {
        const list = byLesson.get(r.lesson_id) ?? [];
        list.push({ title: r.title, url: r.url, resource_type: r.resource_type });
        byLesson.set(r.lesson_id, list);
      }

      // Insertion order follows the query's sort (c.sort_order, l.sort_order).
      const categories = new Map<number, { id: number; name: string; icon: string | null; slug: string; lessons: unknown[] }>();
      for (const l of lessons as LessonVideoRow[]) {
        const cat = categories.get(l.category_id) ?? { id: l.category_id, name: l.category_name, icon: l.category_icon, slug: l.category_slug, lessons: [] };
        cat.lessons.push({
          id: l.id,
          title: l.title,
          youtube_url: l.youtube_url,
          youtube_title: l.youtube_title,
          youtube_channel: l.youtube_channel,
          resources: byLesson.get(l.id) ?? [],
        });
        categories.set(l.category_id, cat);
      }

      return { authenticated: true, categories: [...categories.values()] };
    },

    async bonus(playerId: number | null) {
      const items = await repo.bonusItems();

      let purchasedIds = new Set<number>();
      let goldBalance: number | null = null;
      if (playerId != null) {
        const [gold, purchased] = await Promise.all([repo.gold(playerId), repo.purchasedItemIds(playerId)]);
        goldBalance = gold;
        purchasedIds = purchased;
      }

      return {
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          preview: item.preview,
          icon: item.icon,
          gold_cost: item.gold_cost,
          item_type: item.item_type,
          type_label: TYPE_LABELS[item.item_type] ?? item.item_type,
          purchased: purchasedIds.has(item.id),
          instructor_name: item.instructor_name ?? null,
          youtube_url: item.youtube_url ?? null,
          thumbnail_url: item.thumbnail_url ?? null,
          content: item.content ?? null,
        })),
        gold_balance: goldBalance,
        authenticated: goldBalance !== null,
      };
    },

    async gold(playerId: number) {
      const [gold_balance, transactions] = await Promise.all([repo.gold(playerId), repo.recentGoldTransactions(playerId)]);
      return { gold_balance, transactions };
    },

    async unlockTraining(playerId: number, itemId: number) {
      return withTransaction(db, async (client) => {
        const currentGold = await repo.lockGold(client, playerId);
        if (currentGold == null) throw notFound('Player not found');

        const item = await repo.findActiveItem(client, itemId);
        if (!item) throw notFound('Training item not found');

        if (await repo.isUnlocked(client, playerId, itemId)) {
          throw conflict('Already unlocked');
        }
        if (currentGold < item.gold_cost) {
          throw new AppError(402, 'Not enough gold', { gold: currentGold, cost: item.gold_cost, shortfall: item.gold_cost - currentGold });
        }

        await repo.recordPurchase(client, playerId, item);
        return { success: true, item_name: item.name, gold_spent: item.gold_cost, gold: currentGold - item.gold_cost };
      });
    },
  };
}

export type VaultService = ReturnType<typeof createVaultService>;
