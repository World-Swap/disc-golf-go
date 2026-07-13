// src/modules/vault/vault.repo.ts — data access for the vault (library videos,
// bonus catalog, gold balance/transactions, purchases).

import type { PoolClient } from 'pg';
import type { Queryable, Database } from '../../db/types';

export interface LessonVideoRow {
  id: number;
  title: string;
  youtube_url: string;
  youtube_title: string | null;
  youtube_channel: string | null;
  category_id: number;
  category_name: string;
  category_icon: string | null;
  category_slug: string;
}

export interface BonusItemRow {
  id: number;
  name: string;
  description: string | null;
  preview: string | null;
  icon: string | null;
  gold_cost: number;
  item_type: string;
  content: string | null;
  instructor_name: string | null;
  youtube_url: string | null;
  thumbnail_url: string | null;
}

export function createVaultRepo(db: Database) {
  return {
    async completedLessonIds(playerId: number): Promise<number[]> {
      const r = await db.query<{ lesson_id: number }>('SELECT lesson_id FROM training_completions WHERE player_id = $1', [playerId]);
      return r.rows.map((row) => row.lesson_id);
    },

    async completedVideoLessons(lessonIds: number[]): Promise<LessonVideoRow[]> {
      const r = await db.query<LessonVideoRow>(
        `SELECT l.id, l.title, l.youtube_url, l.youtube_title, l.youtube_channel,
                c.id AS category_id, c.name AS category_name, c.icon AS category_icon, c.slug AS category_slug
         FROM training_lessons l JOIN training_categories c ON c.id = l.category_id
         WHERE l.id = ANY($1::int[]) AND l.is_active = true AND l.youtube_url IS NOT NULL AND l.youtube_url != ''
         ORDER BY c.sort_order, l.sort_order`,
        [lessonIds]
      );
      return r.rows;
    },

    async resourcesForLessons(lessonIds: number[]) {
      const r = await db.query<{ lesson_id: number; title: string; url: string; resource_type: string }>(
        `SELECT lr.lesson_id, lr.title, lr.url, lr.resource_type FROM lesson_resources lr
         WHERE lr.lesson_id = ANY($1::int[]) ORDER BY lr.display_order ASC, lr.id ASC`,
        [lessonIds]
      );
      return r.rows;
    },

    async bonusItems(): Promise<BonusItemRow[]> {
      const r = await db.query<BonusItemRow>(
        `SELECT id, name, description, preview, icon, gold_cost, item_type, content, instructor_name, youtube_url, thumbnail_url
         FROM vault_training_items
         WHERE is_active = true AND youtube_url IS NOT NULL AND youtube_url <> ''
         ORDER BY sort_order, id`
      );
      return r.rows;
    },

    async gold(playerId: number): Promise<number> {
      const r = await db.query<{ gold: number }>('SELECT gold FROM players WHERE id = $1', [playerId]);
      return r.rows[0]?.gold ?? 0;
    },

    async purchasedItemIds(playerId: number): Promise<Set<number>> {
      const r = await db.query<{ item_id: number }>('SELECT item_id FROM player_vault_training_unlocks WHERE player_id = $1', [playerId]);
      return new Set(r.rows.map((row) => row.item_id));
    },

    async recentGoldTransactions(playerId: number) {
      const r = await db.query(
        `SELECT amount, event_type, metadata, created_at FROM gold_transactions
         WHERE player_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [playerId]
      );
      return r.rows;
    },

    // ── purchase (transaction) ──
    async lockGold(client: PoolClient, playerId: number): Promise<number | null> {
      const r = await client.query<{ gold: number }>('SELECT gold FROM players WHERE id = $1 FOR UPDATE', [playerId]);
      return r.rows[0]?.gold ?? null;
    },

    async findActiveItem(client: PoolClient, itemId: number) {
      const r = await client.query<{ id: number; name: string; gold_cost: number }>(
        'SELECT id, name, gold_cost FROM vault_training_items WHERE id = $1 AND is_active = true',
        [itemId]
      );
      return r.rows[0] ?? null;
    },

    async isUnlocked(client: PoolClient, playerId: number, itemId: number): Promise<boolean> {
      const r = await client.query('SELECT 1 FROM player_vault_training_unlocks WHERE player_id = $1 AND item_id = $2', [playerId, itemId]);
      return r.rows.length > 0;
    },

    async recordPurchase(client: PoolClient, playerId: number, item: { id: number; name: string; gold_cost: number }) {
      await client.query('UPDATE players SET gold = gold - $1 WHERE id = $2', [item.gold_cost, playerId]);
      await client.query(
        `INSERT INTO gold_transactions (player_id, amount, event_type, metadata) VALUES ($1, $2, 'training_unlock', $3)`,
        [playerId, -item.gold_cost, JSON.stringify({ item_id: item.id, item_name: item.name })]
      );
      await client.query('INSERT INTO player_vault_training_unlocks (player_id, item_id) VALUES ($1, $2)', [playerId, item.id]);
    },
  };
}

export type VaultRepo = ReturnType<typeof createVaultRepo>;
