import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../http/app';
import { createToken } from '../../middleware/auth';
import type { Database } from '../../db/types';

let handler: (sql: string) => { rows: unknown[] } = () => ({ rows: [] });
const db = {
  query: async (sql: string) => handler(sql) as never,
  connect: async () => ({ query: async (sql: string) => handler(sql), release() {} }) as never,
} as unknown as Database;

test('vault endpoints', async (t) => {
  const app = createApp(db);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const token = createToken({ id: 7, player_uuid: 'u7' });
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  await t.test('GET /vault/bonus anon: grouped by creator, all locked/gated', async () => {
    handler = (sql) => {
      if (/FROM training_lessons/.test(sql)) return { rows: [
        { id: 1, title: 'Grip Basics', youtube_url: 'https://y/1', youtube_title: 'Grip', youtube_channel: 'Gannon Buhr', category_name: 'Form & Technique', completed: false },
        { id: 2, title: 'Putt Stance', youtube_url: 'https://y/2', youtube_title: 'Putt', youtube_channel: 'Gannon Buhr', category_name: 'Putting', completed: false },
      ] };
      return { rows: [] };
    };
    const r = await fetch(base + '/api/vault/bonus');
    const j = (await r.json()) as { authenticated: boolean; totals: { channels: number; videos: number; unlocked: number }; channels: Array<{ channel: string; unlocked: number; video_count: number; videos: Array<{ completed: boolean; youtube_url: string | null }> }> };
    assert.equal(j.authenticated, false);
    assert.equal(j.totals.unlocked, 0);
    assert.equal(j.channels.length, 1);
    assert.equal(j.channels[0]!.channel, 'Gannon Buhr');
    assert.equal(j.channels[0]!.video_count, 2);
    assert.equal(j.channels[0]!.videos[0]!.youtube_url, null); // locked -> access-gated
  });

  await t.test('GET /vault/bonus authed: completed video unlocked with url, others gated', async () => {
    handler = (sql) => {
      if (/FROM training_lessons/.test(sql)) return { rows: [
        { id: 1, title: 'Grip Basics', youtube_url: 'https://y/1', youtube_title: 'Grip', youtube_channel: 'Foundation Disc Golf', category_name: 'Form', completed: true },
        { id: 2, title: 'Anhyzer', youtube_url: 'https://y/2', youtube_title: 'Anhyzer', youtube_channel: 'Foundation Disc Golf', category_name: 'Form', completed: false },
      ] };
      return { rows: [] };
    };
    const r = await fetch(base + '/api/vault/bonus', { headers: auth });
    const j = (await r.json()) as { authenticated: boolean; totals: { unlocked: number }; channels: Array<{ unlocked: number; videos: Array<{ completed: boolean; youtube_url: string | null }> }> };
    assert.equal(j.authenticated, true);
    assert.equal(j.totals.unlocked, 1);
    assert.equal(j.channels[0]!.unlocked, 1);
    assert.equal(j.channels[0]!.videos.find((v) => v.completed)!.youtube_url, 'https://y/1');
    assert.equal(j.channels[0]!.videos.find((v) => !v.completed)!.youtube_url, null);
  });

  await t.test('GET /vault/library: empty when nothing completed', async () => {
    handler = () => ({ rows: [] });
    const r = await fetch(base + '/api/vault/library', { headers: auth });
    const j = (await r.json()) as { authenticated: boolean; categories: unknown[] };
    assert.equal(j.authenticated, true);
    assert.deepEqual(j.categories, []);
  });

  await t.test('POST /vault/training/unlock: not enough gold -> 402', async () => {
    handler = (sql) => {
      if (/FOR UPDATE/.test(sql)) return { rows: [{ gold: 10 }] };
      if (/FROM vault_training_items WHERE id/.test(sql)) return { rows: [{ id: 3, name: 'Pro Tips', gold_cost: 100 }] };
      if (/player_vault_training_unlocks WHERE player_id/.test(sql)) return { rows: [] };
      return { rows: [] };
    };
    const r = await fetch(base + '/api/vault/training/unlock', { method: 'POST', headers: auth, body: JSON.stringify({ item_id: 3 }) });
    const j = (await r.json()) as { error: string; shortfall: number };
    assert.equal(r.status, 402);
    assert.match(j.error, /Not enough gold/);
    assert.equal(j.shortfall, 90);
  });

  await t.test('POST /vault/training/unlock: success', async () => {
    handler = (sql) => {
      if (/FOR UPDATE/.test(sql)) return { rows: [{ gold: 300 }] };
      if (/FROM vault_training_items WHERE id/.test(sql)) return { rows: [{ id: 3, name: 'Pro Tips', gold_cost: 100 }] };
      if (/player_vault_training_unlocks WHERE player_id/.test(sql)) return { rows: [] };
      return { rows: [] };
    };
    const r = await fetch(base + '/api/vault/training/unlock', { method: 'POST', headers: auth, body: JSON.stringify({ item_id: 3 }) });
    const j = (await r.json()) as { success: boolean; gold: number; gold_spent: number };
    assert.equal(r.status, 200);
    assert.equal(j.success, true);
    assert.equal(j.gold_spent, 100);
    assert.equal(j.gold, 200);
  });

  await new Promise<void>((r) => server.close(() => r()));
});
