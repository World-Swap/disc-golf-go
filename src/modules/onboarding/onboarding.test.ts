import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../http/app';
import { createToken } from '../../middleware/auth';
import type { Database } from '../../db/types';

let handler: (sql: string) => { rows: unknown[] } = () => ({ rows: [] });
const db = { query: async (sql: string) => handler(sql) as never, connect: async () => ({}) as never } as unknown as Database;

test('onboarding endpoints', async (t) => {
  const app = createApp(db);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const token = createToken({ id: 42, player_uuid: 'u42' });
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const json = { 'Content-Type': 'application/json' };

  await t.test('POST /onboarding/event: valid + invalid', async () => {
    handler = () => ({ rows: [] });
    let r = await fetch(base + '/api/onboarding/event', { method: 'POST', headers: json, body: JSON.stringify({ event_type: 'onboard_loaded', guest_uuid: 'g1' }) });
    assert.equal(r.status, 200);
    r = await fetch(base + '/api/onboarding/event', { method: 'POST', headers: json, body: JSON.stringify({ event_type: 'bogus' }) });
    assert.equal(r.status, 400);
  });

  await t.test('PUT /onboarding/experience: validates + updates', async () => {
    handler = () => ({ rows: [] });
    let r = await fetch(base + '/api/onboarding/experience', { method: 'PUT', headers: auth, body: JSON.stringify({ experience_level: 'wrong' }) });
    assert.equal(r.status, 400);
    r = await fetch(base + '/api/onboarding/experience', { method: 'PUT', headers: auth, body: JSON.stringify({ experience_level: 'experienced' }) });
    const j = (await r.json()) as { ok: boolean; experience_level: string };
    assert.equal(r.status, 200);
    assert.equal(j.experience_level, 'experienced');
  });

  await t.test('PUT /onboarding/experience unauth -> 401', async () => {
    const r = await fetch(base + '/api/onboarding/experience', { method: 'PUT', headers: json, body: JSON.stringify({ experience_level: 'new' }) });
    assert.equal(r.status, 401);
  });

  await t.test('POST /onboarding/complete', async () => {
    handler = () => ({ rows: [] });
    const r = await fetch(base + '/api/onboarding/complete', { method: 'POST', headers: auth });
    const j = (await r.json()) as { ok: boolean };
    assert.equal(j.ok, true);
  });

  await t.test('GET /onboarding/status: authed vs anon', async () => {
    handler = () => ({ rows: [{ onboarding_completed: false, experience_level: 'new', is_guest: true }] });
    let r = await fetch(base + '/api/onboarding/status', { headers: auth });
    let j = (await r.json()) as { needs_onboarding: boolean; is_guest: boolean };
    assert.equal(j.needs_onboarding, true);
    assert.equal(j.is_guest, true);

    r = await fetch(base + '/api/onboarding/status');
    j = (await r.json()) as { needs_onboarding: boolean; is_guest: boolean };
    assert.equal(j.needs_onboarding, false);
  });

  await new Promise<void>((r) => server.close(() => r()));
});
