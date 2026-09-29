#!/usr/bin/env node
/**
 * Capture App Store and Google Play screenshots from the real app.
 *
 *   npm run shots                     # against http://localhost:3000
 *   BASE=http://localhost:3312 npm run shots
 *
 * Writes store-assets/screenshots/<slot>/<n>-<screen>.png.
 *
 * Playwright is deliberately NOT a dependency of this repo — it would be
 * installed on every `npm ci`, including CI and both native builds, for a tool
 * that runs a couple of times a release. Install it when you need it:
 *
 *   npm i --no-save playwright
 *
 * The browser itself is already on the image at /opt/pw-browsers/chromium.
 *
 * ── Why these four sizes ───────────────────────────────────────────────────
 * App Store Connect validates them exactly and the slots are NOT
 * interchangeable: the 6.5" slot rejects 1290x2796 outright, because that is
 * the 6.7"/6.9" size. Getting this wrong wastes a round trip through the
 * upload UI, so each slot is listed with the CSS width and scale that lands on
 * it precisely.
 *
 * Every size is an exact integer scale, and the script asserts it rather than
 * trusting it — an earlier pass shot Android at 412 CSS px, where the
 * non-integer scale silently produced 1080x1919 instead of 1080x1920.
 */
const path = require('path');
const fs = require('fs');

const REPO = path.resolve(__dirname, '..');
const OUT = path.join(REPO, 'store-assets', 'screenshots');
const BASE = process.env.BASE || 'http://localhost:3000';

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('playwright is not installed. Run:\n\n  npm i --no-save playwright\n');
  process.exit(1);
}

const DEVICES = [
  { slot: 'ios-6.5', w: 1284, h: 2778, css: 428, dsf: 3 },   // iPhone 6.5" (also takes 1242x2688)
  { slot: 'ios-6.7', w: 1290, h: 2796, css: 430, dsf: 3 },   // iPhone 6.7" / 6.9"
  { slot: 'ipad-13', w: 2048, h: 2732, css: 1024, dsf: 2 },  // iPad 12.9" / 13" (also 2064x2752)
  { slot: 'android', w: 1080, h: 1920, css: 360, dsf: 3 },   // Google Play phone
];

/**
 * Ordered by the Positioning section of CLAUDE.md: the training library leads,
 * Throw Lab is the fun rather than the pitch, and courses never open the set.
 * `lesson` is filled in at runtime once we know a real lesson id.
 */
const SCREENS = [
  { slug: '1-train', path: '/training', wait: '#cats, .cat, .artcard', settle: 2500 },
  { slug: '2-lesson', path: null, wait: '.row', settle: 2800 },
  { slug: '3-vault', path: '/vault', wait: '#view, .row', settle: 2500 },
  { slug: '4-game', path: '/game', wait: 'canvas', settle: 3500 },
  { slug: '5-play', path: '/checkin', wait: '#tournament-daily, #tournament', settle: 3000 },
  { slug: '6-home', path: '/home', wait: '.artcard, .hbanner', settle: 3000 },
];

const api = (p, opts) => fetch(BASE + p, opts).then((r) => r.json()).catch(() => ({}));

/** A player with some progress reads far better than an empty account. */
async function seedPlayer() {
  const email = 'shots@example.com';
  const body = JSON.stringify({
    email, password: 'TestPass123!', display_name: 'Casey', username: 'casey',
  });
  const headers = { 'Content-Type': 'application/json' };
  let { token } = await api('/api/auth/signup', { method: 'POST', headers, body });
  if (!token) {
    ({ token } = await api('/api/auth/login', {
      method: 'POST', headers,
      body: JSON.stringify({ email, password: 'TestPass123!' }),
    }));
  }
  if (!token) throw new Error(`could not sign in against ${BASE} — is the app running?`);

  const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const cats = await api('/api/training/categories', { headers: H });
  let lesson = null, cat = null, done = 0;
  for (const c of (cats.categories || cats || []).slice(0, 4)) {
    const { lessons = [] } = await api(`/api/training/categories/${c.slug}/lessons`, { headers: H });
    if (!lesson && lessons[0]) { lesson = lessons[0].id; cat = c.slug; }
    for (const l of lessons.slice(0, 3)) {
      await fetch(BASE + '/api/training/completions', {
        method: 'POST', headers: H, body: JSON.stringify({ lesson_id: l.id }),
      }).catch(() => {});
      done++;
    }
  }
  return { token, lesson, cat, done };
}

/**
 * /game opens on a "how many holes?" picker, which is a setup screen rather
 * than the game. Start a round and catch the power bar mid-sweep so the shot
 * shows the hole, the HUD and the meter doing something.
 */
async function intoARound(pg) {
  const pick = await pg.$('[data-len="3"]');   // the picker is data-len, not data-holes
  if (pick) { await pick.click(); await pg.waitForTimeout(2000); }
  const cv = await pg.$('canvas');
  if (!cv) return;
  const b = await cv.boundingBox();
  await pg.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await pg.waitForTimeout(380);
}

(async () => {
  const { token, lesson, cat, done } = await seedPlayer();
  console.log(`seeded: ${done} lessons completed`);
  // Lessons are a query route, not a hash: /training#lesson/<id> silently
  // renders the hub again, which is how a duplicate of screen 1 once shipped.
  SCREENS[1].path = `/training?cat=${cat}&lesson=${lesson}`;

  // The lesson's video thumbnail is a CSS background-image on i.ytimg.com.
  // Without a proxy the browser cannot reach it and the pane renders as a
  // black box with a play button — which is what shipped the first time.
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  console.log('proxy : ' + (proxy || 'none — external thumbnails will be blank'));

  const br = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
    ...(proxy ? { proxy: { server: proxy, bypass: 'localhost,127.0.0.1' } } : {}),
    args: ['--ignore-certificate-errors'],
  });

  for (const d of DEVICES) {
    if (d.css * d.dsf !== d.w || d.h % d.dsf !== 0) {
      throw new Error(`${d.slot}: ${d.w}x${d.h} is not an exact ${d.dsf}x of ${d.css} CSS px`);
    }
    const dir = path.join(OUT, d.slot);
    fs.mkdirSync(dir, { recursive: true });
    const pg = await br.newPage({
      viewport: { width: d.css, height: d.h / d.dsf },
      deviceScaleFactor: d.dsf, isMobile: d.slot !== 'ipad-13', hasTouch: true,
    });
    await pg.addInitScript((t) => localStorage.setItem('dgg_token', t), token);

    for (const s of SCREENS) {
      await pg.goto(BASE + s.path, { waitUntil: 'networkidle' }).catch(() => {});
      await pg.waitForSelector(s.wait, { timeout: 8000 }).catch(() => {});
      await pg.waitForTimeout(s.settle);
      if (s.slug === '4-game') await intoARound(pg);

      const file = path.join(dir, s.slug + '.png');
      await pg.screenshot({ path: file });

      // Say whether the thumbnail actually painted rather than assuming it did.
      let note = '';
      if (s.slug === '2-lesson') {
        const ok = await pg.evaluate(() => {
          const el = document.querySelector('.vpane__thumb');
          if (!el) return null;
          return /url\(/.test(getComputedStyle(el).backgroundImage);
        });
        note = ok === null ? '  (no video pane)' : ok ? '  thumb ok' : '  THUMB MISSING';
      }
      console.log(`  ${d.slot.padEnd(9)} ${s.slug.padEnd(9)} ${d.w}x${d.h}${note}`);
    }
    await pg.close();
  }

  await br.close();
  console.log(`\nwritten to ${path.relative(REPO, OUT)}/<slot>/`);
})().catch((e) => { console.error(e.message); process.exit(1); });
