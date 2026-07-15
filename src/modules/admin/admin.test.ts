import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../http/app';
import { createAdminToken } from '../../middleware/admin-auth';
import type { Database } from '../../db/types';

let handler: (sql: string) => { rows: unknown[] } = () => ({ rows: [] });
const db = { query: async (sql: string) => handler(sql) as never, connect: async () => ({}) as never } as unknown as Database;

test('admin endpoints', async (t) => {
  process.env.ADMIN_PASSWORD = 'secret123';
  const app = createApp(db);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const adminAuth = { 'x-admin-token': createAdminToken(), 'Content-Type': 'application/json' };
  const json = { 'Content-Type': 'application/json' };

  await t.test('POST /admin/login: wrong + right password', async () => {
    let r = await fetch(base + '/api/admin/login', { method: 'POST', headers: json, body: JSON.stringify({ password: 'nope' }) });
    assert.equal(r.status, 401);
    r = await fetch(base + '/api/admin/login', { method: 'POST', headers: json, body: JSON.stringify({ password: 'secret123' }) });
    const j = (await r.json()) as { token: string };
    assert.equal(r.status, 200);
    assert.equal(j.token.split('.').length, 3);
  });

  await t.test('admin routes require x-admin-token', async () => {
    const r = await fetch(base + '/api/admin/stats');
    assert.equal(r.status, 401);
  });

  await t.test('GET /admin/stats', async () => {
    handler = () => ({ rows: [{ count: '10' }] });
    const r = await fetch(base + '/api/admin/stats', { headers: adminAuth });
    const j = (await r.json()) as { players: { total: number }; activity: unknown; traffic: unknown };
    assert.equal(r.status, 200);
    assert.equal(j.players.total, 10);
  });

  await t.test('POST /admin/users/:id/grant', async () => {
    handler = (sql) => (/SELECT xp FROM players/.test(sql) ? { rows: [{ xp: 100 }] } : { rows: [] });
    const r = await fetch(base + '/api/admin/users/7/grant', { method: 'POST', headers: adminAuth, body: JSON.stringify({ type: 'xp', amount: 50 }) });
    const j = (await r.json()) as { new_value: number };
    assert.equal(r.status, 200);
    assert.equal(j.new_value, 150);
  });

  await t.test('grant: bad type -> 400', async () => {
    const r = await fetch(base + '/api/admin/users/7/grant', { method: 'POST', headers: adminAuth, body: JSON.stringify({ type: 'diamonds', amount: 50 }) });
    assert.equal(r.status, 400);
  });

  await t.test('POST /admin/users/:id/badges', async () => {
    handler = (sql) => {
      if (/SELECT id, display_name, username FROM players/.test(sql)) return { rows: [{ id: 7 }] };
      if (/INSERT INTO player_badges/.test(sql)) return { rows: [{ id: 3, category: 'explorer', tier: 'gold', earned_at: new Date() }] };
      return { rows: [] };
    };
    const r = await fetch(base + '/api/admin/users/7/badges', { method: 'POST', headers: adminAuth, body: JSON.stringify({ category: 'explorer', tier: 'gold' }) });
    const j = (await r.json()) as { badge: { tier: string } };
    assert.equal(r.status, 201);
    assert.equal(j.badge.tier, 'gold');
  });

  await new Promise<void>((r) => server.close(() => r()));
});
