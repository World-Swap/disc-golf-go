import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from './app';
import { learnUrls } from './learn';
import { LESSONS, CATEGORIES } from '../db/data/lessons';
import { EVENTS } from '../db/data/events';
import { MILESTONE_DEFS } from '../modules/training/training.service';
import type { Database } from '../db/types';

const db = {
  query: async () => ({ rows: [] }) as never,
  connect: async () => ({}) as never,
} as unknown as Database;

const WEB = path.join(__dirname, '..', '..', 'web');

// The only pages meant to be found in a search result. Everything else under
// web/ is app UI served on discgolfgo.app.
const INDEXABLE = new Set(['promo.html', 'events.html', 'support.html', 'guide-putting.html', 'guide-beginner-discs.html']);

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
  // The same request with redirects left UNFOLLOWED. fetch follows by default,
  // so asserting on `get` would read the status of wherever it landed -- a
  // redirect test written against it passes on a 200 from the wrong page.
  const hop = (p: string, host: string) =>
    fetch(`http://127.0.0.1:${port}${p}`, {
      headers: { 'X-Forwarded-Host': host },
      redirect: 'manual',
    });

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

  // The training library used to be at /training/<category>. Google still holds
  // those URLs -- five of thirteen were visible in Search Console, split across
  // "Not found (404)" and "Page with redirect" -- and the .com catch-all sent
  // every one of them to the app, where /training/<category> 404s. That is a
  // dead end pointing away from the pages that replaced them.
  await t.test('an old /training/<category> URL lands on the page that replaced it', async () => {
    const slugs = learnUrls()
      .map((u) => u.slice('/learn/'.length))
      .filter((slug) => slug && !slug.includes('/'));
    assert.ok(slugs.length >= 13, 'expected every category to be covered');

    for (const slug of slugs) {
      const res = await hop(`/training/${slug}`, 'discgolfgo.com');
      assert.equal(res.status, 301, `/training/${slug} should redirect`);
      assert.equal(
        res.headers.get('location'),
        `https://discgolfgo.com/learn/${slug}`,
        `/training/${slug} must reach its replacement, not the app`
      );
    }
  });

  // The other half of that rule: only the real categories are claimed. Anything
  // else under /training/ is an app route or an API path and must keep falling
  // through -- /training/recommendations is an API endpoint, not a category.
  await t.test('/training paths that are not categories still go to the app', async () => {
    for (const p of ['/training', '/training/recommendations', '/training/not-a-category']) {
      const res = await hop(p, 'discgolfgo.com');
      assert.equal(res.status, 301, `${p} should still redirect`);
      assert.equal(
        res.headers.get('location'),
        `https://discgolfgo.app${p}`,
        `${p} is not a category and must not be captured`
      );
    }
  });

  // Google crawled https://discgolfgo.com/training/${catSlug}/${l.slug} and
  // .../training/${esc(c.slug)} -- literal, un-interpolated template strings
  // that reached the served HTML and then the index. A template literal written
  // inside a quoted string does not interpolate, and this repo builds HTML by
  // concatenation, so it is a live hazard rather than a one-off.
  //
  // Script bodies legitimately contain `${`, so they are stripped first: what is
  // left is markup, where a `${` can only be a leak.
  await t.test('no served page leaks an un-interpolated template string', async () => {
    const pages = ['/', '/events', '/guides/how-to-putt-disc-golf',
                   '/guides/best-beginner-disc-golf-discs', ...learnUrls()];
    const offenders: string[] = [];
    for (const p of pages) {
      const html = await (await get(p, 'discgolfgo.com')).text();
      const markup = html.replace(/<script[\s\S]*?<\/script>/gi, '');
      for (const m of markup.matchAll(/\$\{[^}]{0,60}\}/g)) offenders.push(`${p}: ${m[0]}`);
    }
    assert.deepEqual(offenders, [], 'a ${...} outside a script tag reached the HTML');
  });

  // The event is written in two places on purpose -- web/events.html for people,
  // src/db/data/events.ts for the training plan that counts down to it, because
  // a static page cannot be read by the path builder. Two copies are only safe
  // if they cannot silently disagree, so this is the lock. CLAUDE.md calls
  // drifting duplicates the failure mode this repo documents more than any
  // other; change one of the two and this test names the other.
  await t.test('every event in the data file matches the page', () => {
    const html = fs.readFileSync(path.join(WEB, 'events.html'), 'utf8');
    for (const e of EVENTS) {
      assert.ok(
        html.includes(e.name),
        `events.html does not mention "${e.name}" — the page and src/db/data/events.ts have drifted`
      );
      // The page carries the machine-readable date twice: a <time datetime> and
      // the SportsEvent startDate. Both must agree with the data file's day.
      const day = e.startsAt.slice(0, 10);
      assert.ok(
        html.includes(`datetime="${day}"`),
        `events.html has no <time datetime="${day}"> for ${e.name}`
      );
      assert.ok(
        html.includes(`"startDate": "${e.startsAt}"`),
        `the JSON-LD startDate for ${e.name} is not ${e.startsAt}`
      );
      assert.ok(html.includes(e.url), `events.html does not link ${e.url}`);
    }
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
  // The footer lists the social accounts and the Organization JSON-LD lists the
  // same ones under sameAs, which is what tells Google the profiles are the
  // same entity. Two hand-maintained lists of the same thing is the drift this
  // file keeps catching, so they are asserted equal: adding an account to the
  // footer and forgetting the schema costs the SEO benefit silently.
  await t.test('every social link on the page is in the schema sameAs', () => {
    const html = fs.readFileSync(path.join(WEB, 'promo.html'), 'utf8');

    // Scanned over the WHOLE page, not just the footer row: the community band
    // added a second place these links live, and a guard that only knew about
    // the footer would have let an account be added there and silently miss
    // sameAs. Matched on the social hosts specifically, so the App Store and
    // Play badges -- which are outbound but not profiles -- are not dragged in.
    const SOCIAL_HOSTS = /^https:\/\/(www\.)?(instagram\.com|facebook\.com|x\.com|twitter\.com|reddit\.com|youtube\.com|tiktok\.com)\//;
    const onPage = [...new Set([...html.matchAll(/href="(https:\/\/[^"]+)"/g)].map((m) => m[1]!))]
      .filter((u) => SOCIAL_HOSTS.test(u));
    assert.ok(onPage.length >= 4, `expected the social accounts, found ${onPage.length}`);

    const org = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1]!))
      .flatMap((d) => (d['@graph'] as Record<string, unknown>[]) ?? [d])
      .find((n) => n['@type'] === 'Organization') as { sameAs?: string[] } | undefined;
    assert.ok(org?.sameAs?.length, 'the Organization schema has no sameAs');

    assert.deepEqual(
      onPage.filter((u) => !org!.sameAs!.includes(u)),
      [],
      'these social links are on the page but not in sameAs'
    );
  });

  // External links opened from our pages must not hand the opener over.
  await t.test('every outbound social link is safe to open', () => {
    const offenders: string[] = [];
    for (const file of ['promo.html', 'events.html', 'support.html', 'guide-putting.html', 'guide-beginner-discs.html']) {
      const html = fs.readFileSync(path.join(WEB, file), 'utf8');
      // every anchor to a social host on the page, wherever it sits
      for (const a of html.match(/<a [^>]*>/g) ?? []) {
        const href = /href="([^"]+)"/.exec(a)?.[1] ?? '';
        if (!/^https:\/\/(www\.)?(instagram|facebook|x|twitter|reddit)\.com\//.test(href)) continue;
        if (!a.includes('target="_blank"') || !a.includes('noopener')) offenders.push(`${file}: ${a.slice(0, 70)}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  // The app's /training orders categories by sort_order; promo.html lists them
  // by hand. They had silently diverged: the promo page led with Getting
  // Started, while in the app it sat at sort_order 104 -- LAST, below all 126
  // other lessons -- because the later content batches were appended with 100+
  // to park them at the end and nobody renumbered. A "start here" category at
  // the bottom of the page is the opposite of what its name promises, and two
  // hand-maintained orders cannot be kept in step by intention alone.
  await t.test('the library order matches the one the promo page advertises', () => {
    const html = fs.readFileSync(path.join(WEB, 'promo.html'), 'utf8');
    const advertised = [...html.matchAll(/numrow__name">([^<]+)</g)].map((m) =>
      m[1]!.replace(/&amp;/g, '&').trim()
    );
    const inApp = [...CATEGORIES].sort((a, b) => a.sort_order - b.sort_order).map((c) => c.name);
    assert.deepEqual(advertised, inApp, 'promo.html and CATEGORIES disagree on order or naming');
  });

  await t.test('sort_order is a dense 1..n, so "append at 100" cannot recur', () => {
    const orders = CATEGORIES.map((c) => c.sort_order).sort((a, b) => a - b);
    assert.deepEqual(
      orders,
      CATEGORIES.map((_, i) => i + 1),
      'every category needs its own place in one unbroken run'
    );
  });

  // The category and a milestone badge were BOTH called "Getting Started",
  // which is where the ambiguity came from: one meant the sport, the other
  // meant five lessons done.
  await t.test('no category shares a name with a training milestone', () => {
    const milestones = new Set(MILESTONE_DEFS.map((m) => m.title.toLowerCase()));
    const clash = CATEGORIES.filter((c) => milestones.has(c.name.toLowerCase())).map((c) => c.name);
    assert.deepEqual(clash, []);
  });

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

  // discgolfgo.app has no mail of any kind -- Resend is verified for .com and
  // only .com. Every address a human was told to write to had been on .app,
  // including the account-deletion email that says "if you did not request
  // this, contact us immediately" and gave an address that bounces.
  //
  // NO exception for a sender. An earlier version allowed a no-reply mailbox
  // on that domain, reasoning that a domain can be verified for sending
  // without receiving -- true in general, false here, and the exception would
  // have protected exactly the value that breaks every outbound email if it
  // reaches EMAIL_FROM.
  //
  // The comment deliberately spells no address out. This check walks its own
  // source, so a literal one here fails the test that contains it -- which is
  // how the first version of this comment was caught, and how the promo-number
  // guard was caught before it.
  await t.test('no address anywhere is on a domain with no mail', () => {
    const roots = [path.join(__dirname, '..'), WEB];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(ts|html|js)$/.test(entry.name)) continue;
        const text = fs.readFileSync(full, 'utf8');
        for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@discgolfgo\.app/g)) {
          offenders.push(`${path.relative(path.join(__dirname, '..', '..'), full)}: ${m[0]}`);
        }
      }
    };
    roots.forEach(walk);
    assert.deepEqual(offenders, [], 'discgolfgo.app has no mail, sending or receiving — use discgolfgo.com');
  });

  // Share links replaced the referral system. The one rule that makes them work
  // is that a shared URL must be openable by someone with no account: the app is
  // behind an auth check and noindex, so a /training link is a login wall.
  await t.test('shared links point at the public library, with lesson anchors', async () => {
    const html = await (await get('/learn/putting', 'discgolfgo.com')).text();

    const shared = [...html.matchAll(/data-share="([^"]+)"/g)].map((m) => m[1]!);
    assert.ok(shared.length > 0, 'the category page should offer a share link');
    for (const url of shared) {
      assert.ok(url.startsWith('https://discgolfgo.com/'),
        `${url} is not openable without an account`);
      assert.equal((await get(new URL(url).pathname, 'discgolfgo.com')).status, 200);
    }

    // Every lesson is anchored, which is what lets a share land on the lesson
    // somebody meant rather than the top of a 16-lesson page.
    const putting = LESSONS.filter((l) => l.category_slug === 'putting');
    const missing = putting.filter((l) => !html.includes(`id="${l.slug}"`)).map((l) => l.slug);
    assert.deepEqual(missing, [], 'these lessons cannot be linked to');
  });

  await t.test('the app builds share URLs on the marketing domain, never its own', () => {
    const appJs = fs.readFileSync(path.join(WEB, 'js', 'app.js'), 'utf8');
    assert.match(appJs, /PUBLIC_SITE\s*=\s*'https:\/\/discgolfgo\.com'/,
      'shares must target the public site');
    // learnUrl is the only thing that builds a shared URL; if it ever took the
    // current origin, every share would become a login wall.
    assert.doesNotMatch(appJs, /function learnUrl[\s\S]{0,200}location\.origin/,
      'learnUrl must not build links from the app origin');
  });

  await new Promise<void>((r) => server.close(() => r()));
});
