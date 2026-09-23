// src/modules/vault/vault.service.ts — vault logic: library grouping, bonus
// catalog with purchase status, gold balance, and gold purchases.

import { notFound, conflict, AppError } from '../../http/errors';
import { withTransaction } from '../../db/pool';
import type { Database } from '../../db/types';
import { createVaultRepo, type VaultRepo, type LessonVideoRow } from './vault.repo';

// Merge duplicate channel spellings from the lesson data into one canonical name.
const CHANNEL_ALIASES: Record<string, string> = {
  dynamicdiscs: 'Dynamic Discs',
  'robbie c discgolf': 'Robbie C Disc Golf',
};
function canonChannel(raw: string | null): string {
  const name = (raw ?? '').trim();
  if (!name || name.toLowerCase() === 'youtube') return 'Other creators';
  return CHANNEL_ALIASES[name.toLowerCase()] ?? name;
}

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

    // Bonus = a by-creator catalog of every lesson video. A video is only
    // watchable once the player has completed its lesson (no paywall); locked
    // videos show which lesson unlocks them. Each video notes its source lesson.
    async bonus(playerId: number | null) {
      const rows = await repo.allVideoLessonsWithCompletion(playerId);

      const map = new Map<string, { channel: string; unlocked: number; videos: unknown[] }>();
      for (const l of rows) {
        const ch = canonChannel(l.youtube_channel);
        const group = map.get(ch) ?? { channel: ch, unlocked: 0, videos: [] };
        if (l.completed) group.unlocked++;
        group.videos.push({
          lesson_id: l.id,
          lesson_title: l.title,
          category: l.category_name,
          youtube_title: l.youtube_title || l.title,
          completed: l.completed,
          youtube_url: l.completed ? l.youtube_url : null, // access-gated by completion
        });
        map.set(ch, group);
      }

      const channels = [...map.values()]
        .map((c) => ({ channel: c.channel, unlocked: c.unlocked, video_count: c.videos.length, videos: c.videos }))
        // Creators you've unlocked most rise to the top; then by size, then A–Z.
        .sort((a, b) => b.unlocked - a.unlocked || b.video_count - a.video_count || a.channel.localeCompare(b.channel));

      return {
        authenticated: playerId != null,
        totals: { channels: channels.length, videos: rows.length, unlocked: rows.filter((r) => r.completed).length },
        channels,
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
