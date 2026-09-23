import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from './app';
import type { Database } from '../db/types';

const db = {
  query: async () => ({ rows: [] }) as never,
  connect: async () => ({ query: async () => ({ rows: [] }), release() {} }) as never,
} as unknown as Database;

// Raw request so we can read redirect status + Location without following it.
function req(port: number, path: string, host: string): Promise<{ status: number; location?: string; body: string }> {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path, method: 'GET', headers: { Host: host } }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, location: res.headers.location, body: b }));
    });
    r.on('error', reject);
    r.end();
  });
}

test('discgolfgo.com host split', async (t) => {
  const app = createApp(db);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;

  await t.test('.com app route -> 301 to same path on .app', async () => {
    const r = await req(port, '/training', 'discgolfgo.com');
    assert.equal(r.status, 301);
    assert.equal(r.location, 'https://discgolfgo.app/training');
  });

  await t.test('.com /api -> 308 to .app (method preserved)', async () => {
    const r = await req(port, '/api/training/categories', 'discgolfgo.com');
    assert.equal(r.status, 308);
    assert.equal(r.location, 'https://discgolfgo.app/api/training/categories');
  });

  await t.test('.com root serves the promo page (not a redirect)', async () => {
    const r = await req(port, '/', 'discgolfgo.com');
    assert.equal(r.status, 200);
    assert.match(r.body, /the world's best|touring pros/i);
  });

  await t.test('.com marketing guide page serves (not a redirect)', async () => {
    const r = await req(port, '/guides/how-to-putt-disc-golf', 'discgolfgo.com');
    assert.equal(r.status, 200);
    assert.match(r.body, /how to putt in disc golf/i);
  });

  await t.test('.com static asset is not redirected', async () => {
    const r = await req(port, '/styles/app.css', 'discgolfgo.com');
    assert.notEqual(r.status, 301);
    assert.notEqual(r.status, 308);
  });

  await t.test('.app app route is untouched (served, no redirect)', async () => {
    const r = await req(port, '/training', 'discgolfgo.app');
    assert.equal(r.status, 200);
  });

  server.close();
});
