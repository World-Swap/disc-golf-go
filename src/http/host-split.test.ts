import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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

  // /lounge was built, linked to from three pages, and 404'd in production,
  // because this route table is explicit and registering the page is a
  // separate step from writing it. A page that exists but is unreachable looks
  // exactly like a page that was never built. Every app page a link can point
  // at is walked here, so the next one cannot ship unrouted.
  await t.test('every page the app links to is actually routed', async () => {
    const linked = new Set<string>();
    const webDir = path.join(process.cwd(), 'web');
    for (const file of fs.readdirSync(webDir)) {
      if (!file.endsWith('.html')) continue;
      const html = fs.readFileSync(path.join(webDir, file), 'utf8');
      // Same-origin hrefs only -- an absolute URL is another host's problem --
      // and the query string is cut off rather than required to be absent:
      // the first version of this anchored on the closing quote, so it matched
      // /lounge but not /assessment?from=training, and silently passed when
      // that route was removed to check the test bites.
      for (const m of html.matchAll(/href=["'](\/[a-z0-9-]+)(?:[?#][^"']*)?["']/g)) linked.add(m[1]!);
    }
    // Checked against BOTH hosts, because web/ holds marketing pages too and
    // /events and /learn are deliberately .com-only -- the first run of this
    // test reported exactly those two. The claim is that a link written
    // anywhere in web/ reaches a page on the host that is supposed to serve
    // it, not that every path works everywhere.
    const missing: string[] = [];
    for (const route of [...linked].sort()) {
      const app = await req(port, route, 'discgolfgo.app');
      const com = await req(port, route, 'discgolfgo.com');
      // .com must SERVE it (200), not merely redirect: an app route on .com
      // answers 301 pointing at .app, which is exactly the host being tested,
      // so accepting any non-404 let a missing .app route hide behind its own
      // redirect -- this passed with /assessment deliberately unregistered.
      if (app.status === 404 && com.status !== 200) missing.push(route);
    }
    assert.deepEqual(missing, [], 'these are linked from web/ but 404 on both hosts');
  });

  await t.test('.app app route is untouched (served, no redirect)', async () => {
    const r = await req(port, '/training', 'discgolfgo.app');
    assert.equal(r.status, 200);
  });

  server.close();
});
