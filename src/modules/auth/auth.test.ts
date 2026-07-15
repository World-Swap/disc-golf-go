import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import { createApp } from '../../http/app';
import type { Database } from '../../db/types';

// Swappable SQL handler; each step sets it before issuing a request.
let handler: (text: string, params?: unknown[]) => { rows: unknown[] } = () => ({ rows: [] });

const db = {
  query: async (text: string, params?: unknown[]) => handler(text, params) as never,
  connect: async () => {
    throw new Error('auth uses no transactions');
  },
} as unknown as Database;

function route(text: string): string {
  return text.replace(/\s+/g, ' ');
}

test('auth endpoints', async (t) => {
  const app = createApp(db);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const get = (path: string, headers: Record<string, string> = {}) => fetch(base + path, { headers });

  await t.test('signup missing fields -> 400', async () => {
    handler = () => ({ rows: [] });
    const r = await post('/api/auth/signup', { email: 'a@b.c' });
    assert.equal(r.status, 400);
  });

  await t.test('signup duplicate email -> 409 (email wins)', async () => {
    handler = () => ({ rows: [{ email: 'dupe@x.com', username: 'someoneelse' }] });
    const r = await post('/api/auth/signup', { display_name: 'Bob', username: 'bobby', email: 'DUPE@x.com', password: 'password1' });
    const j = (await r.json()) as { error: string };
    assert.equal(r.status, 409);
    assert.match(j.error, /email already exists/);
  });

  await t.test('signup duplicate username -> 409', async () => {
    handler = () => ({ rows: [{ email: 'other@x.com', username: 'bobby' }] });
    const r = await post('/api/auth/signup', { display_name: 'Bob', username: 'BOBBY', email: 'fresh@x.com', password: 'password1' });
    const j = (await r.json()) as { error: string };
    assert.equal(r.status, 409);
    assert.match(j.error, /username is already taken/);
  });

  await t.test('signup success -> 201 token + player', async () => {
    handler = (text) => {
      if (route(text).includes('INSERT INTO players')) {
        return { rows: [{ id: 1, player_uuid: 'u1', display_name: 'Bob', username: 'bobby', email: 'fresh@x.com', xp: 0, profile_photo_url: null, created_at: new Date() }] };
      }
      return { rows: [] }; // findConflicts -> none
    };
    const r = await post('/api/auth/signup', { display_name: 'Bob', username: 'bobby', email: 'fresh@x.com', password: 'password1' });
    const j = (await r.json()) as { token: string; player: { level: number } };
    assert.equal(r.status, 201);
    assert.equal(j.token.split('.').length, 3);
    assert.equal(j.player.level, 1);
  });

  await t.test('login success -> token + level 4 for xp 1500', async () => {
    const hash = await bcrypt.hash('password1', 10);
    handler = () => ({ rows: [{ id: 7, player_uuid: 'u7', display_name: 'Bob', username: 'bobby', email: 'b@x.com', password_hash: hash, xp: 1500, profile_photo_url: null, created_at: new Date() }] });
    const r = await post('/api/auth/login', { email: 'b@x.com', password: 'password1' });
    const j = (await r.json()) as { token: string; player: { level: number; level_progress: { needed: number } } };
    assert.equal(r.status, 200);
    assert.equal(j.player.level, 4);
    assert.equal(j.player.level_progress.needed, 1000);
  });

  await t.test('login wrong password -> 401', async () => {
    const hash = await bcrypt.hash('password1', 10);
    handler = () => ({ rows: [{ id: 7, player_uuid: 'u7', display_name: 'Bob', username: 'bobby', email: 'b@x.com', password_hash: hash, xp: 0, profile_photo_url: null, created_at: new Date() }] });
    const r = await post('/api/auth/login', { email: 'b@x.com', password: 'nope' });
    assert.equal(r.status, 401);
  });

  await t.test('login unknown email -> 401', async () => {
    handler = () => ({ rows: [] });
    const r = await post('/api/auth/login', { email: 'ghost@x.com', password: 'password1' });
    assert.equal(r.status, 401);
  });

  await t.test('guest -> 201 token + is_guest', async () => {
    handler = () => ({ rows: [{ id: 9, player_uuid: 'g9', display_name: 'Guest Player', xp: 0, is_guest: true, onboarding_completed: false, experience_level: null }] });
    const r = await post('/api/auth/guest', {});
    const j = (await r.json()) as { token: string; player: { is_guest: boolean } };
    assert.equal(r.status, 201);
    assert.equal(j.player.is_guest, true);
  });

  await t.test('forgot-password -> always { success:true }', async () => {
    handler = (text) => {
      const s = route(text);
      if (s.includes('COUNT(*) AS cnt')) return { rows: [{ cnt: '0' }] };
      if (s.includes('SELECT id FROM players WHERE email')) return { rows: [{ id: 5 }] };
      return { rows: [] };
    };
    const r = await post('/api/auth/forgot-password', { email: 'b@x.com' });
    const j = (await r.json()) as { success: boolean };
    assert.equal(r.status, 200);
    assert.equal(j.success, true);
  });

  await t.test('reset-password invalid token -> 400', async () => {
    handler = () => ({ rows: [] });
    const r = await post('/api/auth/reset-password', { token: 'nope', password: 'password1' });
    assert.equal(r.status, 400);
  });

  await t.test('verify-reset-token: missing -> {valid:false,missing}, valid -> {valid:true}', async () => {
    let r = await get('/api/auth/verify-reset-token');
    let j = (await r.json()) as { valid: boolean; error?: string };
    assert.equal(j.valid, false);
    assert.equal(j.error, 'missing');

    handler = () => ({ rows: [{ id: 1, player_id: 5, used_at: null, expires_at: new Date(Date.now() + 3600_000) }] });
    r = await get('/api/auth/verify-reset-token?token=abc');
    j = (await r.json()) as { valid: boolean };
    assert.equal(j.valid, true);
  });

  await t.test('guest-status: no header -> {valid:false}', async () => {
    const r = await get('/api/auth/guest-status');
    const j = (await r.json()) as { valid: boolean };
    assert.equal(j.valid, false);
  });

  await t.test('DB error -> 500 { error }', async () => {
    handler = () => {
      throw new Error('boom');
    };
    const r = await post('/api/auth/login', { email: 'b@x.com', password: 'password1' });
    const j = (await r.json()) as { error: string };
    assert.equal(r.status, 500);
    assert.equal(j.error, 'Internal server error');
  });

  await new Promise<void>((r) => server.close(() => r()));
});
