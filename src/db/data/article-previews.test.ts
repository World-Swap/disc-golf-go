// src/db/data/article-previews.test.ts — guards on the article link previews.
//
// The card shows SOMEBODY ELSE'S words about their own page, so the things
// worth guarding are different from the rest of the library: that the data is
// in step with what the lessons actually cite, that it stays a preview rather
// than becoming an excerpt, and that no third-party asset is pulled into the
// page behind it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LESSONS } from './lessons';
import { ARTICLE_PREVIEWS, NO_PREVIEW, articlePreview } from './article-previews';

const citedArticleUrls = () => {
  const s = new Set<string>();
  for (const l of LESSONS) {
    for (const r of l.resources) if (r.resource_type === 'article') s.add(r.url);
  }
  return s;
};

test('every preview is for an article the library actually cites', () => {
  // A preview left behind after a lesson changed its link is dead weight that
  // nobody will ever notice is wrong.
  const cited = citedArticleUrls();
  const orphans = Object.keys(ARTICLE_PREVIEWS).filter((u) => !cited.has(u));
  assert.deepEqual(orphans, [], `previews for urls no lesson cites: ${orphans.join(', ')}`);
});

test('every cited article is either previewed or recorded as having none', () => {
  // Not all are previewed: one cited page (a Wikipedia profile) publishes no
  // description at all, and the card degrades to a plain row rather than
  // inventing one. But "checked and there is nothing to show" and "nobody has
  // run the fetcher" must not look the same, or the gap never gets noticed.
  const cited = citedArticleUrls();
  const unaccounted = [...cited].filter((u) => !articlePreview(u) && !NO_PREVIEW[u]);
  assert.deepEqual(unaccounted, [],
    `run npm run articles:previews — these are neither previewed nor recorded:\n  ${unaccounted.join('\n  ')}`);
  assert.ok(cited.size - Object.keys(NO_PREVIEW).length >= 50, 'preview coverage has collapsed');
});

test('nothing is recorded as unavailable that was never cited', () => {
  const cited = citedArticleUrls();
  const orphans = Object.keys(NO_PREVIEW).filter((u) => !cited.has(u));
  assert.deepEqual(orphans, [], `NO_PREVIEW entries no lesson cites: ${orphans.join(', ')}`);
});

test('every unavailable url says why', () => {
  for (const [url, reason] of Object.entries(NO_PREVIEW)) {
    assert.ok(reason.trim().length > 5, `${url}: no reason given`);
  }
});

test('a preview is a preview, not an excerpt', () => {
  // The whole basis for showing these words is that this is a link preview:
  // a short description the publisher wrote FOR this purpose, credited, with
  // the link going to them. A long extract would be republishing their article.
  for (const [url, p] of Object.entries(ARTICLE_PREVIEWS)) {
    assert.ok(p.description.length <= 190, `${url}: description is ${p.description.length} chars, too long for a preview`);
    assert.ok(p.description.length >= 20, `${url}: description is too short to be useful`);
    assert.ok(p.title.length <= 120, `${url}: title is ${p.title.length} chars`);
  }
});

test('every preview credits its publisher and names the destination', () => {
  // A reader is entitled to see where a link goes before pressing it, and the
  // publisher is entitled to the credit for the words being shown.
  for (const [url, p] of Object.entries(ARTICLE_PREVIEWS)) {
    assert.ok(p.site.trim().length > 0, `${url}: no site name`);
    assert.ok(p.domain.trim().length > 0, `${url}: no domain`);
    assert.ok(!p.domain.startsWith('www.'), `${url}: domain should be bare, got ${p.domain}`);
    // The domain shown must be the domain actually linked to, or the card is
    // telling the reader something untrue about where they are going.
    assert.equal(new URL(url).hostname.replace(/^www\./, ''), p.domain,
      `${url}: card says ${p.domain}`);
  }
});

test('no preview carries a third-party asset url', () => {
  // Deliberately no og:image. Hotlinking serves the publisher's bandwidth from
  // our page and makes a player's browser call them to render a lesson;
  // copying the file in is republishing their artwork. The card is built from
  // text plus our own mark.
  const src = readFileSync('src/db/data/article-previews.ts', 'utf8');
  assert.ok(!/image|img|\.jpg|\.png|\.webp|\.svg/i.test(src.split('export const')[1] ?? ''),
    'article-previews.ts contains an image reference');
});

test('the library cites no url that is known to redirect', () => {
  // Four infinitediscs.com/blog/... urls 301'd to blog.infinitediscs.com and
  // were corrected. Citing a redirect costs the player a hop and made the
  // preview fetch look like the publisher was failing.
  const stale = [...citedArticleUrls()].filter((u) => /^https:\/\/infinitediscs\.com\/blog\//.test(u));
  assert.deepEqual(stale, [], `these urls redirect; cite the destination instead: ${stale.join(', ')}`);
});

test('the lesson page reports a resource click by intent, not by CSS class', () => {
  // THE IMPORTANT ONE. The completion gate needs a `resource_opened` signal,
  // and the listener used to match `classList.contains('row')`. Articles are
  // now preview cards rather than rows, so that check would have silently
  // stopped firing and stranded every player who read the article instead of
  // watching the video -- the identical failure the video pane had when it
  // became a <div role="button">. Both renderers must mark themselves.
  const page = readFileSync('web/training.html', 'utf8');
  assert.match(page, /getAttribute\('data-resource'\) !== null/,
    'wireEngagement must key on data-resource');
  assert.ok(!/classList\.contains\('row'\) && a\.target === '_blank'/.test(page),
    'the old class-based check is back');
  assert.match(page, /class="lprev" data-resource=/, 'the preview card must mark itself');
  assert.match(page, /class="row" data-resource=/, 'the fallback row must mark itself');
});

test('the card\'s stacked lines are block, not inline', () => {
  // These are <span>s inside an <a>, so they are inline by default and ignore
  // the vertical margins the card depends on -- the site name, title and
  // description all ran together on one line. Invisible when reading the CSS
  // and obvious the moment it is rendered. This repo has now made the same
  // mistake twice: ".stat span is inline" produced "AVAILABLE$20 outstanding"
  // on the admin summary tiles.
  const page = readFileSync('web/training.html', 'utf8');
  assert.match(page, /\.lprev__site,\s*\.lprev__title,\s*\.lprev__desc,\s*\.lprev__go\s*\{\s*display:\s*block;?\s*\}/,
    'the preview card\'s lines must be display:block or they run together');
  // Widened after making the identical mistake one commit later on the upload
  // row: flex blockifies its CHILDREN, not its grandchildren, so spans nested
  // one level inside a flex item are still inline.
  assert.match(page, /\.uprow__title,\s*\.uprow__sub\s*\{\s*display:\s*block;?\s*\}/,
    'the upload row\'s title and channel must be display:block');
});

test('the card\'s mark comes from the domain, not the site name', () => {
  // A UDisc article showed "R", because they call their blog Release Point.
  // The domain is what a reader recognises and where the link goes.
  const page = readFileSync('web/training.html', 'utf8');
  const fn = page.slice(page.indexOf('function siteInitial'), page.indexOf('function previewCard'));
  assert.ok(fn.includes('p.domain || p.site'), 'siteInitial must prefer the domain');
});

test('the preview card does not fetch anything at render time', () => {
  const page = readFileSync('web/training.html', 'utf8');
  const fn = page.slice(page.indexOf('function previewCard'), page.indexOf('function plainRow'));
  assert.ok(fn.length > 100, 'previewCard not found');
  for (const bad of ['fetch(', 'XMLHttpRequest', '<img', 'background-image']) {
    assert.ok(!fn.includes(bad), `previewCard contains ${bad} — it must render from committed data only`);
  }
});
