import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../http/app';
import { createToken } from '../../middleware/auth';
import type { Database } from '../../db/types';

let handler: (sql: string) => { rows: unknown[] } = () => ({ rows: [] });
const db = { query: async (sql: string) => handler(sql) as never, connect: async () => ({}) as never } as unknown as Database;

test('training-notifications endpoints', async (t) => {
  const app = createApp(db);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const token = createToken({ id: 42, player_uuid: 'u42' });
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  await t.test('GET settings -> defaults when none', async () => {
    handler = () => ({ rows: [] });
    const r = await fetch(base + '/api/training/notifications/settings', { headers: auth });
    const j = (await r.json()) as { tips_enabled: boolean; tips_frequency: string };
    assert.equal(r.status, 200);
    assert.equal(j.tips_enabled, true);
    assert.equal(j.tips_frequency, 'daily');
  });

  await t.test('PUT settings: invalid frequency -> 400', async () => {
    const r = await fetch(base + '/api/training/notifications/settings', { method: 'PUT', headers: auth, body: JSON.stringify({ tips_frequency: 'hourly' }) });
    assert.equal(r.status, 400);
  });

  await t.test('PUT settings: valid update', async () => {
    handler = (sql) => {
      if (/SELECT \* FROM player_training_notification_settings/.test(sql)) return { rows: [{ tips_enabled: false, tips_frequency: 'weekly', reminders_enabled: true, mission_alerts_enabled: true, achievement_alerts_enabled: true, push_enabled: false }] };
      return { rows: [] };
    };
    const r = await fetch(base + '/api/training/notifications/settings', { method: 'PUT', headers: auth, body: JSON.stringify({ tips_enabled: false, tips_frequency: 'weekly' }) });
    const j = (await r.json()) as { tips_enabled: boolean; tips_frequency: string };
    assert.equal(r.status, 200);
    assert.equal(j.tips_enabled, false);
    assert.equal(j.tips_frequency, 'weekly');
  });

  await t.test('GET list -> notifications + counts', async () => {
    handler = (sql) => {
      if (/FROM training_notifications tn/.test(sql)) return { rows: [{ id: 1, type: 'daily_tip', title: 'Tip', message: 'Grip it', is_read: false }] };
      if (/COUNT\(\*\) AS total/.test(sql)) return { rows: [{ total: '1', unread: '1' }] };
      return { rows: [] };
    };
    const r = await fetch(base + '/api/training/notifications', { headers: auth });
    const j = (await r.json()) as { notifications: unknown[]; total: number; unread_count: number };
    assert.equal(j.total, 1);
    assert.equal(j.unread_count, 1);
  });

  await t.test('GET unread-count anonymous -> 0 (no 401)', async () => {
    const r = await fetch(base + '/api/training/notifications/unread-count');
    const j = (await r.json()) as { unread_count: number };
    assert.equal(r.status, 200);
    assert.equal(j.unread_count, 0);
  });

  await t.test('POST read-all', async () => {
    handler = () => ({ rows: [] });
    const r = await fetch(base + '/api/training/notifications/read-all', { method: 'POST', headers: auth });
    const j = (await r.json()) as { ok: boolean };
    assert.equal(j.ok, true);
  });

  await new Promise<void>((r) => server.close(() => r()));
});
