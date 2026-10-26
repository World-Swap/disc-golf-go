// src/modules/market/market.test.ts — guards on the Market search.
//
// The Market shows real money, so what is pinned here is what would be wrong
// quietly: a price compared against a different currency, a made-up price
// scraped off a banner, a source that vanishes instead of reporting itself
// down, and the page implying it searched the web when no key is set.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMarketService, shapeQuery } from './market.service';
import { extractPrice, toNumber, looksLikeProduct } from './extract';
import { STOREFRONTS, STOREFRONT_HOSTS } from './retailers';
import { DEPARTMENTS, featuredDepartment } from './market.catalog';

const SERVICE = readFileSync('src/modules/market/market.service.ts', 'utf8');
const PROVIDERS = readFileSync('src/modules/market/providers.ts', 'utf8');
const PAGE = readFileSync('web/market.html', 'utf8');

/** A fetch stand-in routed by url substring; no network is touched. */
function fakeFetch(routes: Record<string, () => unknown>, log?: string[]) {
  return (async (url: string | URL) => {
    const u = String(url);
    log?.push(u);
    const key = Object.keys(routes).find((k) => u.includes(k));
    const out = key ? routes[key]!() : '';
    if (out instanceof Error) throw out;
    if (typeof out === 'number') return { ok: false, status: out, text: async () => '' } as unknown as Response;
    const body = typeof out === 'string' ? out : JSON.stringify(out);
    return { ok: true, text: async () => body, json: async () => JSON.parse(body) } as unknown as Response;
  }) as unknown as typeof fetch;
}

function productPage(price: string, currency = 'USD', avail = 'InStock') {
  return `<html><head><script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Discraft ESP Buzzz',
    image: 'https://cdn.example/x.jpg',
    offers: { '@type': 'Offer', price, priceCurrency: currency, availability: `https://schema.org/${avail}` },
  })}</script></head><body></body></html>`;
}

/* ── the extractor ──────────────────────────────────────────────────── */

test('a price is read from JSON-LD, OpenGraph or microdata', () => {
  const ld = extractPrice(productPage('18.99'));
  assert.equal(ld?.price, 18.99);
  assert.equal(ld?.how, 'json-ld');
  assert.equal(ld?.available, true);

  const og = extractPrice('<meta property="og:price:amount" content="24.50"><meta property="og:price:currency" content="GBP">');
  assert.equal(og?.price, 24.5);
  assert.equal(og?.currency, 'GBP');
  assert.equal(og?.how, 'opengraph');

  // Attribute order is reversed on plenty of real pages.
  const flipped = extractPrice('<meta content="11.00" property="product:price:amount">');
  assert.equal(flipped?.price, 11);

  const micro = extractPrice('<span itemprop="price" content="7.25"></span>');
  assert.equal(micro?.price, 7.25);
  assert.equal(micro?.how, 'microdata');
});

test('a page with no price markup yields nothing, never a guess', () => {
  // The banner is exactly what a loose "$\\d+" regex would grab.
  const page = '<html><body><p>Free shipping on orders over $50!</p><h1>Buzzz</h1></body></html>';
  assert.equal(extractPrice(page), null, 'a price was invented from body text');
});

test('a European decimal comma is not read as thousands', () => {
  assert.equal(toNumber('1.299,00'), 1299);
  assert.equal(toNumber('1,299.00'), 1299);
  assert.equal(toNumber('18,99'), 18.99);
  assert.equal(toNumber('0.00'), null, 'zero was treated as a real price');
  assert.equal(toNumber('free'), null);
});

test('malformed JSON-LD does not abandon the rest of the page', () => {
  const page =
    '<script type="application/ld+json">{ this is not json </script>' + productPage('9.99');
  assert.equal(extractPrice(page)?.price, 9.99);
});

test('only product-shaped urls are fetched, and never a reference site', () => {
  assert.equal(looksLikeProduct('https://shop.example/products/buzzz'), true);
  assert.equal(looksLikeProduct('https://shop.example/p/123'), true);
  assert.equal(looksLikeProduct('https://en.wikipedia.org/wiki/Discraft'), false);
  assert.equal(looksLikeProduct('https://www.reddit.com/r/discgolf/products/x'), false);
  assert.equal(looksLikeProduct('https://brand.example/about'), false);
});

/* ── the search ─────────────────────────────────────────────────────── */

test('a bare query is given the sport, so "buzzz" does not find a bee', () => {
  assert.match(shapeQuery('buzzz'), /disc golf/);
  // Already said it: do not say it twice.
  assert.equal(shapeQuery('disc golf bag'), 'disc golf bag');
  assert.equal(shapeQuery('understable putter'), 'understable putter');
});

test('with no key the Market says so rather than implying it searched the web', async () => {
  const svc = createMarketService({ fetchImpl: fakeFetch({}), keys: {}, hosts: [] });
  assert.equal(svc.status().webSearch, false, 'claimed a web search with no engine configured');
  const r = await svc.search('buzzz');
  assert.equal(r.fallbackOnly, true);
});

test('a configured engine is used and its retailer names are kept', async () => {
  const svc = createMarketService({
    hosts: [],
    keys: { serpApiKey: 'k' },
    fetchImpl: fakeFetch({
      'serpapi.com': () => ({
        shopping_results: [
          { title: 'Discraft Buzzz', extracted_price: 15.99, source: 'Infinite Discs', link: 'https://infinitediscs.com/products/buzzz', thumbnail: 't' },
          { title: 'Buzzz OS', price: '$21.00', source: 'Marshall Street', link: 'https://marshallstreet.example/products/os' },
        ],
      }),
    }),
  });
  assert.equal(svc.status().webSearch, true);
  const r = await svc.search('buzzz');
  assert.equal(r.products.length, 2);
  assert.equal(r.products[0]!.retailer, 'Infinite Discs', "the engine's retailer name was discarded");
  assert.equal(r.products[0]!.price, 15.99);
  assert.equal(r.products[1]!.price, 21, 'a display price string was not parsed');
  assert.equal(r.fallbackOnly, false);
});

test('a web engine turns results into prices by reading each page', async () => {
  const svc = createMarketService({
    hosts: [],
    keys: { braveKey: 'k' },
    fetchImpl: fakeFetch({
      'api.search.brave.com': () => ({
        web: {
          results: [
            { url: 'https://shopa.example/products/buzzz' },
            { url: 'https://en.wikipedia.org/wiki/Discraft' }, // must not be fetched
            { url: 'https://shopb.example/products/buzzz' },
          ],
        },
      }),
      'shopa.example': () => productPage('14.00'),
      'shopb.example': () => productPage('19.00'),
    }),
  });
  const r = await svc.search('buzzz');
  assert.deepEqual(r.products.map((p) => p.retailer).sort(), ['shopa.example', 'shopb.example']);
  assert.equal(r.cheapest, 14);
});

test('prices in different currencies are never compared', async () => {
  const svc = createMarketService({
    hosts: [],
    keys: { braveKey: 'k' },
    fetchImpl: fakeFetch({
      'api.search.brave.com': () => ({
        web: { results: [{ url: 'https://us.example/products/a' }, { url: 'https://uk.example/products/b' }] },
      }),
      'us.example': () => productPage('20.00', 'USD'),
      'uk.example': () => productPage('9.00', 'GBP'),
    }),
  });
  const r = await svc.search('buzzz');
  assert.equal(r.products.length, 2, 'the fixture did not produce two currencies');
  assert.equal(r.cheapest, null, 'a cheapest price was claimed across two currencies');
  assert.equal(r.currency, null);
  const codes = r.products.map((p) => p.currency);
  assert.deepEqual([...codes].sort(), codes, 'two currencies were interleaved by raw price');
});

test('a failing source is reported, never silently dropped', async () => {
  const svc = createMarketService({
    hosts: [],
    keys: { serpApiKey: 'k' },
    fetchImpl: fakeFetch({ 'serpapi.com': () => 503 }),
  });
  const r = await svc.search('buzzz');
  const bad = r.sources.find((s) => !s.ok);
  assert.ok(bad, 'the dead engine did not report itself');
  assert.match(bad!.error ?? '', /503/);
});

test('the same listing from two sources appears once', async () => {
  const svc = createMarketService({
    hosts: ['shopa.example'],
    keys: { serpApiKey: 'k' },
    fetchImpl: fakeFetch({
      'serpapi.com': () => ({
        shopping_results: [
          { title: 'Buzzz', extracted_price: 16, source: 'Shop A', link: 'https://shopa.example/products/buzzz' },
        ],
      }),
      'meta.json': () => ({ currency: 'USD', name: 'Shop A' }),
      'suggest.json': () => ({
        resources: { results: { products: [{ id: 1, title: 'Buzzz', url: '/products/buzzz?_pos=1', price: '16.00', available: true }] } },
      }),
    }),
  });
  const r = await svc.search('buzzz');
  assert.equal(r.products.length, 1, 'one listing was shown twice');
  // The storefront entry knows the stock state, so it is the one kept.
  assert.equal(r.products[0]!.available, true, 'the entry that knew stock was discarded');
});

test("a storefront's own currency is read, not assumed", async () => {
  const svc = createMarketService({
    hosts: ['discgolfuk.com'],
    keys: {},
    fetchImpl: fakeFetch({
      'meta.json': () => ({ currency: 'GBP', name: 'Disc Golf UK' }),
      'suggest.json': () => ({
        resources: { results: { products: [{ id: 2, title: 'Putter', url: '/products/putter', price: '12.00', available: true }] } },
      }),
    }),
  });
  const r = await svc.search('putter');
  assert.equal(r.products[0]!.currency, 'GBP', 'a GBP shop was reported in dollars');
});

test('a blank query touches nothing', async () => {
  const log: string[] = [];
  const svc = createMarketService({ fetchImpl: fakeFetch({}, log), keys: { serpApiKey: 'k' } });
  const r = await svc.search('   ');
  assert.equal(r.products.length, 0);
  assert.equal(log.length, 0, 'a blank query still went out');
});

test('a repeat search is cached rather than re-run', async () => {
  const log: string[] = [];
  const svc = createMarketService({
    hosts: [],
    keys: { serpApiKey: 'k' },
    fetchImpl: fakeFetch({ 'serpapi.com': () => ({ shopping_results: [] }) }, log),
  });
  await svc.search('buzzz');
  const after = log.length;
  const again = await svc.search('BUZZZ ');
  assert.equal(again.cached, true);
  assert.equal(log.length, after, 'the repeat search went back out');
});

/* ── structure ──────────────────────────────────────────────────────── */

test('nothing about a product is stored', () => {
  // The module has no repo and must not grow one: a cached price is a price
  // eventually shown wrongly.
  assert.ok(!/INSERT INTO|UPDATE .* SET|db\.query/i.test(SERVICE), 'the Market started writing to the database');
  assert.ok(!/INSERT INTO|db\.query/i.test(PROVIDERS), 'a provider started writing to the database');
});

test('every request is raced against a timeout', () => {
  assert.match(PROVIDERS, /new AbortController\(\)/, 'a slow retailer can hang the page');
  assert.match(PROVIDERS, /signal: ctl\.signal/, 'the abort signal is not passed to fetch');
  assert.match(SERVICE, /Promise\.allSettled/, 'one failing source now fails the whole search');
});

test('the page never lists shops to browse', () => {
  // The Market is a search. A fixed shop list in the UI is the thing that was
  // explicitly not wanted, and a filter row is how it creeps back.
  assert.ok(!/data-shop=/.test(PAGE), 'a shop filter row came back to the Market page');
  assert.ok(!/shopcount|All shops/i.test(PAGE), 'the page advertises a shop list again');
});

test('every department is a real query and the featured one is a department', () => {
  const keys = new Set(DEPARTMENTS.map((d) => d.key));
  assert.equal(keys.size, DEPARTMENTS.length, 'two departments share a key');
  for (const d of DEPARTMENTS) assert.ok(d.query.trim().length > 2, `${d.key} has no query`);
  for (const day of [0, 1, 9, 365, 20000]) {
    assert.ok(keys.has(featuredDepartment(new Date(day * 86_400_000)).key), `day ${day} featured a non-department`);
  }
});

test('storefront hosts are distinct and bare', () => {
  assert.equal(new Set(STOREFRONT_HOSTS).size, STOREFRONT_HOSTS.length, 'a host is listed twice');
  for (const s of STOREFRONTS) {
    assert.ok(!s.host.includes('/') && !s.host.startsWith('http'), `${s.host} is not a bare host`);
    assert.match(s.currency, /^[A-Z]{3}$/, `${s.host} has no ISO currency`);
  }
});

/* ── the marketing copy, pinned to what the Market actually is ───────── */

const PROMO = readFileSync('web/promo.html', 'utf8');

/**
 * Copy a player can read.
 *
 * Script blocks are NOT stripped: home.html builds its cards inside an inline
 * script, so stripping them made the guard below pass vacuously on the one
 * page that actually had the stale wording -- it was measuring something
 * other than what it claimed. Comments ARE stripped, in both syntaxes,
 * because the prose explaining a rule quotes the string the rule forbids;
 * that trap has already been recorded three times in CLAUDE.md.
 */
function visible(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

test('the promo site does not describe the Market as a fixed set of shops', () => {
  // It said "eleven disc golf shops" and named them. That was written for the
  // version that WAS a shop list, and it went stale the moment the Market
  // became a search -- a count tied to a config value drifts by itself.
  const copy = visible(PROMO);
  assert.ok(
    !/\b(eleven|ten|twelve|sixteen|\d+)\s+disc golf shops\b/i.test(copy),
    'the promo page pins the Market to a shop count again'
  );
  assert.ok(
    !/Price every disc golf shop at once/i.test(copy),
    'the old shop-list headline came back'
  );
  // And it still has to say the thing that keeps us honest.
  assert.match(copy, /not (a|the) shop/i, 'the promo page stopped saying we are not a shop');
});

test('"blank card" is our word, not the product\'s', () => {
  // The feature is "create a scorecard". Nothing a player reads should call
  // it blank.
  for (const [name, html] of [
    ['promo.html', PROMO],
    ['checkin.html', readFileSync('web/checkin.html', 'utf8')],
    ['home.html', readFileSync('web/home.html', 'utf8')],
    ['scorecard.html', readFileSync('web/scorecard.html', 'utf8')],
  ] as const) {
    assert.ok(
      !/blank (card|scorecard)/i.test(visible(html)),
      `${name} still calls it a blank card in copy a player reads`
    );
  }
});

test('the Market page and the promo page agree that it is a search', () => {
  assert.match(visible(PAGE), /Search anything disc golf/i, 'the app page stopped calling it a search');
  assert.match(visible(PROMO), /Search anything disc golf/i, 'the promo page stopped calling it a search');
});


test('no page pins the Market to a number of shops', () => {
  // "11 disc golf shops" sat on the Home card after the promo page had been
  // corrected -- the same claim, one file over. The count is a config value
  // and drifts by itself, so no copy anywhere may state it.
  for (const f of ['web/home.html', 'web/market.html', 'web/checkin.html', 'web/promo.html']) {
    const copy = visible(readFileSync(f, 'utf8'));
    assert.ok(
      !/\b(\d+|eleven|twelve|sixteen)\s+(disc golf )?shops\b/i.test(copy),
      `${f} states how many shops the Market searches`
    );
    assert.ok(!/Price every shop at once/i.test(copy), `${f} still carries the shop-list framing`);
  }
});

/* ── CLAUDE.md's live sections, which seed the next session's copy ────── */

/**
 * The reference part of CLAUDE.md: everything above "## Recent changes",
 * with the Positioning block cut out.
 *
 * Both exclusions are load-bearing. Dated changelog entries are true-when-
 * written and this file's own convention is that they are not revised, so
 * they legitimately contain the wording that was later corrected. The
 * Positioning rules QUOTE the forbidden phrases in order to forbid them --
 * exactly the trap where prose explaining a rule trips the rule, which
 * CLAUDE.md has now recorded four times. A guard that fired on either would
 * be measuring something other than what it claims.
 */
function claudeMdReference(): string {
  const doc = readFileSync('CLAUDE.md', 'utf8');
  const head = doc.slice(0, doc.indexOf('\n## Recent changes'));
  const posFrom = head.indexOf('\n## Positioning');
  const posTo = head.indexOf('\n## Stack');
  assert.ok(posFrom > 0 && posTo > posFrom, 'CLAUDE.md headings moved; fix this slice');
  return head.slice(0, posFrom) + head.slice(posTo);
}

test('CLAUDE.md does not describe the Market as a set of shops', () => {
  // The promo site and every page were corrected and CLAUDE.md was not, so
  // its intro still said "price every disc golf shop at once" and its pivot
  // note "searches eleven disc golf shops". That is the file a session reads
  // before writing any copy, so stale wording there re-seeds the mistake.
  const ref = claudeMdReference();
  assert.ok(
    !/\b(\d+|eleven|twelve|sixteen)\s+disc golf shops\b/i.test(ref),
    'CLAUDE.md pins the Market to a shop count again'
  );
  assert.ok(
    !/price every (disc golf )?shop at once/i.test(ref),
    'CLAUDE.md carries the shop-list headline again'
  );
});

test('CLAUDE.md calls it creating a scorecard, not a blank card', () => {
  assert.ok(
    !/blank (card|scorecard)/i.test(claudeMdReference()),
    'CLAUDE.md describes the feature as a blank card again'
  );
});

test('CLAUDE.md records that Throw Lab is on hold', () => {
  // The owner put Throw Lab on permanent hold on 2026-10-26. Nothing outside
  // this repo survives a session, so if the note goes the next session will
  // re-offer the merge -- which is what it was told not to do.
  const doc = readFileSync('CLAUDE.md', 'utf8');
  assert.match(doc, /Throw Lab is on permanent hold/i, 'the hold note is gone from CLAUDE.md');
  assert.match(
    doc,
    /claude\/fervent-sagan-msuwy0/,
    'the hold note no longer names the branch that must not be merged'
  );
});
