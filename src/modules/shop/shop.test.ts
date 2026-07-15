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

test('shop endpoints', async (t) => {
  const app = createApp(db);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const token = createToken({ id: 42, player_uuid: 'u42' });
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  await t.test('GET /gold/balance', async () => {
    handler = (sql) => (/SELECT 1 FROM players/.test(sql) ? { rows: [{ '?column?': 1 }] } : { rows: [{ gold: 250 }] });
    const r = await fetch(base + '/api/gold/balance', { headers: auth });
    const j = (await r.json()) as { gold: number };
    assert.equal(j.gold, 250);
  });

  await t.test('GET /vault/items -> catalog + player_gold', async () => {
    handler = (sql) => {
      if (/FROM items ORDER BY gold_cost/.test(sql)) return { rows: [{ id: 1, name: 'XP Boost', type: 'boost_xp', gold_cost: 100 }] };
      return { rows: [{ gold: 250 }] };
    };
    const r = await fetch(base + '/api/vault/items', { headers: auth });
    const j = (await r.json()) as { items: unknown[]; player_gold: number };
    assert.equal(j.items.length, 1);
    assert.equal(j.player_gold, 250);
  });

  await t.test('POST /vault/buy: not enough gold -> 400 {have,need}', async () => {
    handler = (sql) => {
      if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(sql.trim())) return { rows: [] };
      if (/FROM items WHERE id/.test(sql)) return { rows: [{ id: 1, name: 'XP Boost', icon: '🔥', gold_cost: 500 }] };
      if (/FOR UPDATE/.test(sql)) return { rows: [{ gold: 100 }] };
      return { rows: [] };
    };
    const r = await fetch(base + '/api/vault/buy', { method: 'POST', headers: auth, body: JSON.stringify({ item_id: 1 }) });
    const j = (await r.json()) as { error: string; have: number; need: number };
    assert.equal(r.status, 400);
    assert.equal(j.have, 100);
    assert.equal(j.need, 500);
  });

  await t.test('POST /vault/buy: success', async () => {
    handler = (sql) => {
      if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(sql.trim())) return { rows: [] };
      if (/FROM items WHERE id/.test(sql)) return { rows: [{ id: 1, name: 'XP Boost', icon: '🔥', gold_cost: 100 }] };
      if (/FOR UPDATE/.test(sql)) return { rows: [{ gold: 250 }] };
      return { rows: [] };
    };
    const r = await fetch(base + '/api/vault/buy', { method: 'POST', headers: auth, body: JSON.stringify({ item_id: 1 }) });
    const j = (await r.json()) as { success: boolean; gold_spent: number; new_gold: number };
    assert.equal(j.success, true);
    assert.equal(j.gold_spent, 100);
    assert.equal(j.new_gold, 150);
  });

  await t.test('POST /vault/activate/:invId: creates boost', async () => {
    handler = (sql) => {
      if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(sql.trim())) return { rows: [] };
      if (/FROM player_inventory pi JOIN items/.test(sql)) return { rows: [{ id: 9, item_id: 1, type: 'boost_xp', duration_minutes: 60, name: 'XP Boost', icon: '🔥', rarity: 'rare', effect_value: 50 }] };
      if (/INSERT INTO active_boosts/.test(sql)) return { rows: [{ id: 77 }] };
      return { rows: [] };
    };
    const r = await fetch(base + '/api/vault/activate/9', { method: 'POST', headers: auth });
    const j = (await r.json()) as { success: boolean; boost: { id: number; type: string; duration_minutes: number } };
    assert.equal(j.success, true);
    assert.equal(j.boost.id, 77);
    assert.equal(j.boost.duration_minutes, 60);
  });

  await t.test('unauth -> 401', async () => {
    const r = await fetch(base + '/api/vault/inventory');
    assert.equal(r.status, 401);
  });

  await new Promise<void>((r) => server.close(() => r()));
});
