import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../http/app';
import { createToken } from '../../middleware/auth';
import type { Database } from '../../db/types';

let handler: (sql: string) => { rows: unknown[] } = () => ({ rows: [] });
const db = { query: async (sql: string) => handler(sql) as never, connect: async () => ({}) as never } as unknown as Database;

test('notifications endpoints', async (t) => {
  const app = createApp(db);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const token = createToken({ id: 42, player_uuid: 'u42' });
  const auth = { Authorization: `Bearer ${token}` };

  await t.test('GET /notifications/all', async () => {
    handler = () => ({ rows: [{ id: 1, title: 'Update', message: 'New training content', created_at: new Date() }] });
    const r = await fetch(base + '/api/notifications/all', { headers: auth });
    const j = (await r.json()) as { notifications: unknown[] };
    assert.equal(j.notifications.length, 1);
  });

  await t.test('GET /notifications/active -> single or null', async () => {
    handler = () => ({ rows: [] });
    const r = await fetch(base + '/api/notifications/active', { headers: auth });
    const j = (await r.json()) as { notification: unknown };
    assert.equal(j.notification, null);
  });

  await t.test('POST /notifications/:id/dismiss', async () => {
    handler = () => ({ rows: [] });
    const r = await fetch(base + '/api/notifications/5/dismiss', { method: 'POST', headers: auth });
    const j = (await r.json()) as { ok: boolean };
    assert.equal(j.ok, true);
  });

  await t.test('unauth -> 401', async () => {
    const r = await fetch(base + '/api/notifications/all');
    assert.equal(r.status, 401);
  });

  await new Promise<void>((r) => server.close(() => r()));
});
