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

test('upload + delete-account endpoints', async (t) => {
  const app = createApp(db);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const token = createToken({ id: 42, player_uuid: 'u42' });
  const auth = { Authorization: `Bearer ${token}` };
  const json = { 'Content-Type': 'application/json' };

  await t.test('POST /players/me/photo: no file -> 400', async () => {
    const r = await fetch(base + '/api/players/me/photo', { method: 'POST', headers: auth });
    assert.equal(r.status, 400);
  });

  await t.test('POST /players/me/photo unauth -> 401', async () => {
    const r = await fetch(base + '/api/players/me/photo', { method: 'POST' });
    assert.equal(r.status, 401);
  });

  await t.test('DELETE /delete-account: wipes data + success', async () => {
    let deletedPlayers = false;
    handler = (sql) => {
      if (/SELECT email, display_name FROM players/.test(sql)) return { rows: [{ email: 'b@x.com', display_name: 'Bob' }] };
      if (/DELETE FROM players WHERE id/.test(sql)) { deletedPlayers = true; return { rows: [] }; }
      return { rows: [] };
    };
    const r = await fetch(base + '/api/delete-account', { method: 'DELETE', headers: auth });
    const j = (await r.json()) as { success: boolean };
    assert.equal(r.status, 200);
    assert.equal(j.success, true);
    assert.equal(deletedPlayers, true);
  });

  await t.test('POST /delete-account/request: invalid email -> 400', async () => {
    const r = await fetch(base + '/api/delete-account/request', { method: 'POST', headers: json, body: JSON.stringify({ email: 'nope' }) });
    assert.equal(r.status, 400);
  });

  await t.test('POST /delete-account/request: always success (privacy)', async () => {
    handler = (sql) => (/SELECT id FROM players WHERE email/.test(sql) ? { rows: [] } : { rows: [] }); // no account
    const r = await fetch(base + '/api/delete-account/request', { method: 'POST', headers: json, body: JSON.stringify({ email: 'ghost@x.com' }) });
    const j = (await r.json()) as { success: boolean };
    assert.equal(r.status, 200);
    assert.equal(j.success, true);
  });

  await new Promise<void>((r) => server.close(() => r()));
});
