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

  await t.test('GET /vault/bonus anon: authenticated:false, no purchased', async () => {
    handler = (sql) => {
      if (/FROM vault_training_items/.test(sql)) return { rows: [{ id: 1, name: 'V', item_type: 'premium_tip', gold_cost: 100 }] };
      throw new Error('should not query players when anon');
    };
    const r = await fetch(base + '/api/vault/bonus');
    const j = (await r.json()) as { authenticated: boolean; gold_balance: number | null; items: Array<{ purchased: boolean; type_label: string }> };
    assert.equal(j.authenticated, false);
    assert.equal(j.gold_balance, null);
    assert.equal(j.items[0]!.purchased, false);
    assert.equal(j.items[0]!.type_label, 'Premium Tip');
  });

  await t.test('GET /vault/bonus authed: gold + purchased flag', async () => {
    handler = (sql) => {
      if (/FROM vault_training_items/.test(sql)) return { rows: [{ id: 1, name: 'V', item_type: 'disc_guide', gold_cost: 50 }, { id: 2, name: 'W', item_type: 'disc_guide', gold_cost: 50 }] };
      if (/SELECT gold FROM players/.test(sql)) return { rows: [{ gold: 250 }] };
      if (/player_vault_training_unlocks/.test(sql)) return { rows: [{ item_id: 2 }] };
      return { rows: [] };
    };
    const r = await fetch(base + '/api/vault/bonus', { headers: auth });
    const j = (await r.json()) as { authenticated: boolean; gold_balance: number; items: Array<{ id: number; purchased: boolean }> };
    assert.equal(j.gold_balance, 250);
    assert.equal(j.items.find((i) => i.id === 2)!.purchased, true);
    assert.equal(j.items.find((i) => i.id === 1)!.purchased, false);
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
