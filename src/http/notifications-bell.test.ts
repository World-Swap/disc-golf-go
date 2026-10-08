// src/http/notifications-bell.test.ts — the notifications bell, and the
// cache-buster convention it depends on.
//
// The three scheduled jobs wrote training_notifications rows for weeks while
// NOTHING in web/ read them: /training/notifications and its unread-count had
// no caller at all, so Settings offered toggles for notifications that could
// never be seen. The bell is that surface, and these guards keep it wired.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const APP_JS = readFileSync('web/js/app.js', 'utf8');
const APP_CSS = readFileSync('web/styles/app-ui.css', 'utf8');
const PAGES = readdirSync('web').filter((f) => f.endsWith('.html'));

test('the bell actually calls the endpoints that had no caller', () => {
  for (const ep of [
    '/training/notifications?limit=',      // the list
    '/training/notifications/unread-count', // the badge
    '/training/notifications/read-all',     // mark all
  ]) {
    assert.ok(APP_JS.includes(ep), `the bell never calls ${ep}`);
  }
  assert.match(APP_JS, /\/training\/notifications\/' \+ encodeURIComponent\(id\) \+ '\/read/,
    'the bell never marks an individual notification read');
});

test('no bell is rendered for a signed-out visitor', () => {
  // unread-count answers 0 for anonymous callers, so a bell there would be a
  // control that can never do anything.
  assert.match(APP_JS, /!API\.token\(\) && !API\.guestUuid\(\)/,
    'bell() does not gate on being signed in');
});

test('a notification with no lesson is not rendered as a link', () => {
  // A streak reminder has no lesson_id. Making it an <a> would promise a
  // destination that does not exist.
  const at = APP_JS.indexOf('function notifHref');
  assert.ok(at > 0, 'notifHref not found');
  const fn = APP_JS.slice(at, APP_JS.indexOf('\n  }', at));
  assert.match(fn, /if \(!n\.lesson_id \|\| !n\.category_slug\) return ''/,
    'notifHref does not refuse a notification with no lesson');
  // And the renderer must switch element type on that, not style it as a link.
  assert.match(APP_JS, /var tag = href \? 'a' : 'div'/,
    'every notification row is rendered as a link regardless of destination');
});

test('the lesson link carries the category, not just the lesson', () => {
  // The lesson page is /training?cat=<category>&lesson=<id>. Without the
  // category the link can only dump the reader on the hub, which is why the
  // repo query joins training_categories for category_slug.
  const repo = readFileSync('src/modules/training-notifications/training-notifications.repo.ts', 'utf8');
  assert.match(repo, /c\.slug AS category_slug/, 'the list query stopped returning category_slug');
  assert.match(repo, /LEFT JOIN training_categories c/, 'the category join is gone');
  assert.match(APP_JS, /'\/training\?cat=' \+ encodeURIComponent\(n\.category_slug\)/,
    'the bell builds a lesson link without the category');
});

test('the notification row stacks its lines instead of running them together', () => {
  // .nrow__body is a flex ITEM, not a flex container, so these spans stay
  // inline and render as "Keep your streak goingYour 5-day streak...". Flex
  // blockifies its children, not its grandchildren. This exact bug has now
  // shipped in .lprev__*, .uprow__* and the admin .stat span.
  assert.match(APP_CSS, /\.nrow__title,\s*\.nrow__msg,\s*\.nrow__time\s*\{[^}]*display:\s*block/,
    'the notification row spans are not forced to display:block');
});

test('every page agrees on the version of each shared asset', () => {
  // The repo caches /styles, /js and /img with a ?v= for a YEAR, immutable.
  // Bumping 23 pages and missing one leaves that page pinned to a stale file
  // until the cache expires, which is the failure this convention exists to
  // prevent -- and nothing was checking it.
  for (const asset of ['app.js', 'app-ui.css', 'tokens.css']) {
    const seen = new Map<string, string[]>();
    for (const f of PAGES) {
      const m = readFileSync(`web/${f}`, 'utf8').match(
        new RegExp(asset.replace('.', '\\.') + '\\?v=([a-z0-9]+)')
      );
      if (!m) continue;
      if (!seen.has(m[1])) seen.set(m[1], []);
      seen.get(m[1])!.push(f);
    }
    assert.equal(seen.size <= 1, true,
      `pages disagree on ${asset} version: ` +
      [...seen.entries()].map(([v, fs]) => `${v} (${fs.length}: ${fs.slice(0, 4).join(', ')})`).join(' vs '));
  }
});

test('shared assets are always requested with a version', () => {
  // Without ?v= the file revalidates on every navigation instead of being
  // cached, which is the round-trip cost static-cache.test.ts exists to avoid.
  for (const f of PAGES) {
    const html = readFileSync(`web/${f}`, 'utf8');
    for (const m of html.matchAll(/(?:href|src)="\/(?:js|styles)\/([^"?]+)(\?v=[a-z0-9]+)?"/g)) {
      assert.ok(m[2], `web/${f} loads /${m[1]} with no ?v= cache-buster`);
    }
  }
});
