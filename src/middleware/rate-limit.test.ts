import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../http/app';
import { resetRateLimits } from './rate-limit';
import type { Database } from '../db/types';

// What Render's proxy hands the app: whatever the client put in the header,
// with the address IT observed appended on the right. Modelling that is the
// whole point -- a test that sends a bare spoofed value is testing a topology
// that does not exist, and would pass against the broken code.
const REAL_CLIENT = '203.0.113.50';
const asProxied = (clientSent: string) => `${clientSent}, ${REAL_CLIENT}`;

const db = {
  query: async () => ({ rows: [] }) as never,
  connect: async () => ({}) as never,
} as unknown as Database;

test('rate limiting', async (t) => {
  const app = createApp(db, { serveFrontend: false });
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  const signup = (xff: string) =>
    fetch(base + '/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': asProxied(xff) },
      body: JSON.stringify({}),           // invalid on purpose; the limiter runs first
    }).then((r) => r.status);

  const adminLogin = (xff: string, password = 'wrong') =>
    fetch(base + '/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': asProxied(xff) },
      body: JSON.stringify({ password }),
    }).then((r) => r.status);

  // A proxy APPENDS to X-Forwarded-For, so its first entry is whatever the
  // client sent. The app used to trust every hop and key limits on that entry,
  // which meant one extra header bought an unlimited budget: measured against
  // the real signup limit, a rotating X-Forwarded-For never once drew a 429.
  await t.test('a rotating X-Forwarded-For cannot buy a fresh budget', async () => {
    resetRateLimits();
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) codes.push(await signup(`198.51.100.${i}`));
    assert.ok(codes.includes(429), `spoofed addresses were never limited: ${codes.join(',')}`);
  });

  // The admin login guards a password a person chose, so it carries a second
  // bound that does not depend on the address at all.
  await t.test('admin login is capped globally, however the source varies', async () => {
    resetRateLimits();
    const codes: number[] = [];
    for (let i = 0; i < 34; i++) codes.push(await adminLogin(`203.0.113.${i}`));
    assert.ok(codes.includes(429), 'distributed guessing was never capped');
  });

  // The cap must not become a way to lock the owner out of their own dashboard
  // while someone else is guessing, so only failures feed it.
  await t.test('only failures count toward the global cap', async () => {
    resetRateLimits();
    for (let i = 0; i < 5; i++) await adminLogin('203.0.113.7');
    const ok = await adminLogin('203.0.113.8', process.env.ADMIN_PASSWORD || 'test-admin-pw');
    assert.equal(ok, 200, 'the correct password should still be accepted');
    // ...and a success clears the gate rather than leaving it part-spent.
    const after = await adminLogin('203.0.113.9');
    assert.equal(after, 401, `expected a normal rejection, got ${after}`);
  });

  // The uncomfortable half of the trade, pinned deliberately. A live run caught
  // this after an earlier comment claimed the owner always gets through: once
  // the global gate trips it refuses EVERYONE, correct password included. That
  // is inherent -- checking the password to decide whether to limit is the
  // unlimited guessing the limit exists to stop -- so the test records it as
  // intended behaviour rather than leaving the next reader to discover it in
  // production. If this ever starts failing, the cooldown is what to look at.
  await t.test('once tripped, the cooldown refuses the owner too', async () => {
    resetRateLimits();
    for (let i = 0; i < 52; i++) await adminLogin(`192.0.2.${i % 200}`);
    const owner = await adminLogin('198.18.0.1', process.env.ADMIN_PASSWORD || 'test-admin-pw');
    assert.equal(owner, 429, 'expected the owner to be inside the cooldown as well');
  });

  await new Promise<void>((r) => server.close(() => r()));
});
