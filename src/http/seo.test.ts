import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from './app';
import { learnUrls } from './learn';
import { LESSONS, CATEGORIES } from '../db/data/lessons';
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

  // Every number the promo page states, counted from the library rather than
  // trusted. This exists because "13 touring pros" survived a pass that claimed
  // to have retired it from "every instance" -- that pass worked from a list of
  // TEXT locations (meta, OpenGraph, JSON-LD, hero, FAQs) and never looked at
  // the stats panel. A day later the page still said 13, alongside 77 and 200
  // that had gone stale when 19 videos were replaced. A list of places to check
  // is not a guard; counting is.
  await t.test('the promo page states only numbers the library supports', async () => {
    const html = fs.readFileSync(path.join(WEB, 'promo.html'), 'utf8');
    const stat = (label: string): number | null => {
      const m = new RegExp(
        `statbig__n">(\\d[\\d,]*)</div><div class="statbig__l">${label}<`, 'i'
      ).exec(html);
      return m ? Number(m[1]!.replace(/,/g, '')) : null;
    };

    const videos = new Set<string>();
    const creators = new Set<string>();
    for (const l of LESSONS) {
      if (l.youtube_url) videos.add(l.youtube_url);
      if (l.youtube_channel?.trim()) creators.add(l.youtube_channel.trim());
      for (const r of l.resources) {
        if (r.resource_type === 'video' && r.url) videos.add(r.url);
        if (r.author?.trim()) creators.add(r.author.trim());
      }
    }
    // Creators are counted over VIDEO credits only -- an article's author is a
    // writer, not someone you learn the shot from.
    const videoCreators = new Set<string>();
    for (const l of LESSONS) {
      if (l.youtube_url && l.youtube_channel?.trim()) videoCreators.add(l.youtube_channel.trim());
      for (const r of l.resources) {
        if (r.resource_type === 'video' && r.url && r.author?.trim()) videoCreators.add(r.author.trim());
      }
    }

    assert.equal(stat('Lessons'), LESSONS.length, 'lesson count');
    assert.equal(stat('Videos'), videos.size, 'distinct video count');
    assert.equal(stat('Creators'), videoCreators.size, 'video-credit count');
    assert.equal(stat('Skill paths'), CATEGORIES.length, 'skill path count');

    // A pro count is a JUDGEMENT, not a fact, and it has been wrong in both
    // directions. The page names pros and does not count them; keep it so.
    // Match the STAT MARKUP, not the phrase anywhere: the comment above this
    // panel in promo.html explains why the count was removed and necessarily
    // quotes it, which a loose regex flags as the very thing it is warning
    // about. (It did, on the first run.)
    assert.doesNotMatch(html, /statbig__l">\s*Touring pros/i,
      'do not put a pro COUNT back in the stats band');
    assert.doesNotMatch(html, /statbig__l">\s*Pro-coached/i,
      'same: that number needs re-judging on every content change');

    // Every name the page claims must actually appear in the library.
    const hay = JSON.stringify(LESSONS).toLowerCase();
    const chips = [...html.matchAll(/<span class="pro-chip">(?:<b>)?([^<]+)/g)].map((m) => m[1]!.trim());
    assert.ok(chips.length >= 10, 'expected the pro list to still be there');
    const absent = chips.filter((n) => !hay.includes(n.toLowerCase()));
    assert.deepEqual(absent, [], 'named on the promo page but not in the library');
  });

  // discgolfgo.app has no inbox. Every address a human is told to write to had
  // been on it -- including the account-deletion email, which tells someone
  // "if you did not request this, contact us immediately" and gave an address
  // that bounces. A guard, because a dead contact address fails silently: the
  // sender gets nothing back and we never learn they tried.
  await t.test('no contact address is on a domain that receives no mail', () => {
    const roots = [path.join(__dirname, '..'), WEB];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(ts|html|js)$/.test(entry.name)) continue;
        const text = fs.readFileSync(full, 'utf8');
        // Any mailbox on .app EXCEPT a sender: a domain can be verified for
        // sending without receiving, so EMAIL_FROM may legitimately live there.
        for (const m of text.matchAll(/([A-Za-z0-9._%+-]+)@discgolfgo\.app/g)) {
          if (/^no-?reply$/i.test(m[1]!)) continue;
          offenders.push(`${path.relative(path.join(__dirname, '..', '..'), full)}: ${m[0]}`);
        }
      }
    };
    roots.forEach(walk);
    assert.deepEqual(offenders, [], 'these addresses bounce — use contact@discgolfgo.com');
  });

  await new Promise<void>((r) => server.close(() => r()));
});
