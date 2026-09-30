import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from './app';
import { learnUrls } from './learn';
import type { Database } from '../db/types';

const db = {
  query: async () => ({ rows: [] }) as never,
  connect: async () => ({}) as never,
} as unknown as Database;

const WEB = path.join(__dirname, '..', '..', 'web');

// The only pages meant to be found in a search result. Everything else under
// web/ is app UI served on discgolfgo.app.
const INDEXABLE = new Set(['promo.html', 'guide-putting.html', 'guide-beginner-discs.html']);

test('search indexing', async (t) => {
  const app = createApp(db);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  // X-Forwarded-Host, not Host: undici treats Host as a forbidden header and
  // silently drops it, so a Host-based test passes or fails for the wrong
  // reason. Express resolves req.hostname from X-Forwarded-Host anyway once
  // `trust proxy` is set, which is exactly how Render delivers it in production.
  const get = (p: string, host: string) =>
    fetch(`http://127.0.0.1:${port}${p}`, { headers: { 'X-Forwarded-Host': host } });

  await t.test('robots.txt differs by host', async () => {
    const com = await (await get('/robots.txt', 'discgolfgo.com')).text();
    const appDomain = await (await get('/robots.txt', 'discgolfgo.app')).text();
    assert.match(com, /Sitemap: https:\/\/discgolfgo\.com\/sitemap\.xml/);
    assert.doesNotMatch(appDomain, /Sitemap:/, 'the app domain has no sitemap to offer');
    assert.match(appDomain, /Disallow: \/api\//);
    // Crawling the app domain stays OPEN on purpose: a disallowed URL is never
    // re-crawled, so Google would never see the noindex that drops it.
    assert.doesNotMatch(appDomain, /^Disallow: \/$/m, 'a blanket Disallow would strand indexed pages');
  });

  // Catches the real failure mode: someone adds a page to web/ and to the PAGES
  // table, and it quietly becomes an empty shell competing with the promo site.
  await t.test('every app page carries noindex; no indexable page does', () => {
    const offenders: string[] = [];
    for (const file of fs.readdirSync(WEB).filter((f) => f.endsWith('.html'))) {
      const html = fs.readFileSync(path.join(WEB, file), 'utf8');
      const hasNoindex = /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(html);
      if (INDEXABLE.has(file) && hasNoindex) offenders.push(`${file} is indexable but says noindex`);
      if (!INDEXABLE.has(file) && !hasNoindex) offenders.push(`${file} is app UI but is missing noindex`);
    }
    assert.deepEqual(offenders, []);
  });

  await t.test('the sitemap lists only .com URLs, and each one resolves there', async () => {
    const xml = fs.readFileSync(path.join(WEB, 'sitemap.xml'), 'utf8');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    assert.ok(locs.length > 0, 'the sitemap is empty');
    for (const loc of locs) {
      assert.ok(loc.startsWith('https://discgolfgo.com/'), `${loc} is not on the marketing domain`);
      const res = await get(new URL(loc).pathname, 'discgolfgo.com');
      assert.equal(res.status, 200, `${loc} is in the sitemap but returned ${res.status}`);
    }
  });

  // These exist because 134 one-page-per-lesson URLs would have been thin
  // content -- a lesson is a median of 28 words. The bar a category page has to
  // clear is the guide pages already on the site, which run about 570 words.
  await t.test('every training-library page is substantial, and only on .com', async () => {
    const thin: string[] = [];
    for (const url of learnUrls()) {
      const res = await get(url, 'discgolfgo.com');
      assert.equal(res.status, 200, `${url} returned ${res.status} on the marketing host`);
      const words = (await res.text()).replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
      if (words < 450) thin.push(`${url} is only ${words} words`);
    }
    assert.deepEqual(thin, [], 'a page this short is not worth indexing');

    // The app domain is noindex, so it must not serve a second copy of these.
    const onApp = await get('/learn', 'discgolfgo.app');
    assert.notEqual(onApp.status, 200, 'the app domain should not serve library pages');
  });

  await t.test('a library page credits the channel each video comes from', async () => {
    const html = await (await get('/learn/putting', 'discgolfgo.com')).text();
    assert.match(html, /youtube\.com|youtu\.be/, 'lessons should link out to the video they teach from');
    assert.match(html, /class="vid"/, 'the video credit line should render');
  });

  await new Promise<void>((r) => server.close(() => r()));
});
