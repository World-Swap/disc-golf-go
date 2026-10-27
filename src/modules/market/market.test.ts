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

  // This used to assert `cheapest === null` on any mixed set. That was the
  // IMPLEMENTATION of the rule, not the rule: refusing outright suppressed the
  // headline on most real searches (one GBP shop was enough), so the service
  // now reports the minimum WITHIN one currency. The condition the old
  // assertion stood in for is the one pinned here, and it is strictly stronger
  // because it holds for a single-currency set too -- a price and a currency
  // can never be mismatched, and nothing is ever converted.
  assert.ok(r.currency, 'no currency was named for the price reported');
  const inNamed = r.products.filter((p) => p.currency === r.currency).map((p) => p.price);
  assert.equal(r.cheapest, Math.min(...inNamed), 'the headline is not the minimum of its own currency');
  const others = r.products.filter((p) => p.currency !== r.currency).map((p) => p.price);
  assert.ok(
    others.every((v) => v !== r.cheapest) || inNamed.includes(r.cheapest!),
    'the headline came from a product in a different currency'
  );
  assert.equal(r.mixedCurrency, true, 'a two-currency set was not reported as mixed');

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

/* ── the WooCommerce adapter, and the two 100x traps in it ───────────── */

import { fromMinorUnits, decodeEntities } from './providers';
import { STOREFRONTS as SF, PLATFORM_BY_HOST } from './retailers';
import { existsSync } from 'node:fs';

/** One product in the shape the Store API actually serves. */
function wooProduct(over: Record<string, unknown> = {}) {
  return {
    name: 'Paul McBeth ESP Buzzz SS &#8211; 6-Claw',
    permalink: 'https://otbdiscs.com/product/paul-mcbeth-esp-buzzz-ss/',
    is_in_stock: true,
    images: [{ src: 'https://otbdiscs.com/wp-content/uploads/x.png' }],
    prices: { price: '2399', currency_code: 'USD', currency_minor_unit: 2 },
    ...over,
  };
}

test('a WooCommerce price is minor units, so it is divided by the unit it states', () => {
  // "2399" at minor_unit 2 is $23.99. Read as-is it is $2,399.
  assert.equal(fromMinorUnits('2399', 2), 23.99);
  assert.equal(fromMinorUnits(2399, 2), 23.99);
  // The unit is READ, never assumed: JPY has none.
  assert.equal(fromMinorUnits('2399', 0), 2399);
  assert.equal(fromMinorUnits('2399', 3), 2.399);
  // An absent or absurd unit falls back to 2 rather than to a guess.
  assert.equal(fromMinorUnits('2399', undefined), 23.99);
  assert.equal(fromMinorUnits('2399', 99), 23.99);
  assert.equal(fromMinorUnits('', 2), null);
  assert.equal(fromMinorUnits(null, 2), null);
});

test('a shop that sends a decimal anyway is not divided again', () => {
  // The spec says minor units, but dividing "23.99" by 100 prints $0.24 for a
  // $24 disc, so the decimal point is detected rather than trusted away.
  assert.equal(fromMinorUnits('23.99', 2), 23.99);
  assert.equal(fromMinorUnits('1.299,00', 2), 1299); // European separators
});

test('a product name is decoded, so no card prints a raw entity', () => {
  assert.equal(decodeEntities('Buzzz SS &#8211; 6-Claw'), 'Buzzz SS – 6-Claw');
  assert.equal(decodeEntities('Jay &amp; Sons'), 'Jay & Sons');
  assert.equal(decodeEntities('&quot;Z&quot; Buzzz'), '"Z" Buzzz');
  // The ampersand is decoded LAST; decoding it first would turn this into
  // "&#38;" and then decode that too, inventing a character.
  assert.equal(decodeEntities('A &amp;#38; B'), 'A &#38; B');
});

test('a WooCommerce host is asked the Store API, a Shopify host is not', async () => {
  const log: string[] = [];
  const svc = createMarketService({
    hosts: ['otbdiscs.com', 'sabattusdiscgolf.com'],
    keys: {},
    fetchImpl: fakeFetch(
      {
        'wp-json': () => [wooProduct()],
        'suggest.json': () => ({
          resources: { results: { products: [{ title: 'Z Buzzz', price: '18.99', url: '/products/z-buzzz', available: true }] } },
        }),
        'meta.json': () => ({ currency: 'USD', name: 'Sabattus' }),
      },
      log
    ),
  });
  const r = await svc.search('buzzz');
  const asked = log.join(' ');
  assert.ok(/otbdiscs\.com\/wp-json/.test(asked), 'the woo shop was not asked the Store API');
  assert.ok(!/otbdiscs\.com\/search\/suggest/.test(asked), 'the woo shop was asked the Shopify endpoint');
  assert.ok(/sabattusdiscgolf\.com\/search\/suggest/.test(asked), 'the shopify shop was not asked suggest.json');
  assert.ok(!/otbdiscs\.com\/meta\.json/.test(asked), 'a woo shop was charged a meta.json read it never needs');
  assert.equal(r.products.length, 2);
  const woo = r.products.find((p) => p.retailer === 'otbdiscs.com')!;
  assert.equal(woo.price, 23.99, 'the woo price was not converted from minor units');
  assert.equal(woo.title, 'Paul McBeth ESP Buzzz SS – 6-Claw');
  assert.equal(woo.available, true);
});

test('a WooCommerce product carries its own currency', async () => {
  const svc = createMarketService({
    hosts: ['otbdiscs.com'],
    keys: {},
    fetchImpl: fakeFetch({
      'wp-json': () => [wooProduct({ prices: { price: '1850', currency_code: 'CAD', currency_minor_unit: 2 } })],
    }),
  });
  const r = await svc.search('buzzz');
  assert.equal(r.products[0]!.currency, 'CAD', 'the product currency was overridden by a shop-level guess');
});

test('a WooCommerce link that leaves the shop is rejected', async () => {
  const svc = createMarketService({
    hosts: ['otbdiscs.com'],
    keys: {},
    fetchImpl: fakeFetch({
      'wp-json': () => [
        wooProduct({ permalink: 'https://not-otbdiscs.example/product/x' }),
        wooProduct({ permalink: 'https://otbdiscs.com/product/real/?_wpnonce=abc' }),
      ],
    }),
  });
  const r = await svc.search('buzzz');
  assert.equal(r.products.length, 1, 'an off-host product url was kept');
  assert.ok(r.products[0]!.url.startsWith('https://otbdiscs.com/'));
  assert.ok(!r.products[0]!.url.includes('_wpnonce'), 'a tracking parameter survived');
});

/* ── a price of zero is not a price ─────────────────────────────────── */

test('a listing with no positive price is dropped, not shown as free', async () => {
  const svc = createMarketService({
    hosts: ['otbdiscs.com'],
    keys: {},
    fetchImpl: fakeFetch({
      'wp-json': () => [
        wooProduct({ name: 'Basket Icon Pin', permalink: 'https://otbdiscs.com/product/pin/', prices: { price: '0', currency_code: 'USD', currency_minor_unit: 2 } }),
        wooProduct(),
      ],
    }),
  });
  const r = await svc.search('basket');
  assert.equal(r.products.length, 1, 'a zero-priced listing was kept');
  assert.equal(r.cheapest, 23.99, 'a zero price set the headline');
});

/* ── "from $X" stays inside one currency ────────────────────────────── */

test('the cheapest price is the minimum WITHIN the currency it names', async () => {
  const svc = createMarketService({
    hosts: [],
    keys: { braveKey: 'k' },
    fetchImpl: fakeFetch({
      'api.search.brave.com': () => ({
        web: {
          results: [
            { url: 'https://us1.example/products/a' },
            { url: 'https://us2.example/products/b' },
            { url: 'https://uk1.example/products/c' },
          ],
        },
      }),
      'us1.example': () => productPage('20.00', 'USD'),
      'us2.example': () => productPage('30.00', 'USD'),
      // Numerically the smallest number in the set, and in another currency:
      // it must never be reported as "from $5".
      'uk1.example': () => productPage('5.00', 'GBP'),
    }),
  });
  const r = await svc.search('buzzz');
  assert.equal(r.products.length, 3, 'the fixture did not produce three results');
  assert.equal(r.currency, 'USD', 'the majority currency was not chosen');
  assert.equal(r.cheapest, 20, 'the headline crossed a currency boundary');
  assert.equal(r.mixedCurrency, true, 'a mixed set was not reported as mixed');

  // Whatever is reported must be the minimum of the products in THAT currency.
  const inLead = r.products.filter((p) => p.currency === r.currency).map((p) => p.price);
  assert.equal(r.cheapest, Math.min(...inLead));
});

test('a single-currency result set is not reported as mixed', async () => {
  const svc = createMarketService({
    hosts: [],
    keys: { braveKey: 'k' },
    fetchImpl: fakeFetch({
      'api.search.brave.com': () => ({ web: { results: [{ url: 'https://us1.example/products/a' }] } }),
      'us1.example': () => productPage('20.00', 'USD'),
    }),
  });
  const r = await svc.search('buzzz');
  assert.equal(r.mixedCurrency, false);
  assert.equal(r.currency, 'USD');
  assert.equal(r.cheapest, 20);
});

/* ── the shop list itself ───────────────────────────────────────────── */

test('every storefront declares a platform we can actually ask', () => {
  for (const s of SF) {
    assert.ok(
      s.platform === 'shopify' || s.platform === 'woocommerce',
      `${s.host} declares an unknown platform: ${s.platform}`
    );
    assert.equal(PLATFORM_BY_HOST.get(s.host), s.platform, `${s.host} is missing from PLATFORM_BY_HOST`);
  }
  // The point of adding WooCommerce was reaching shops Shopify could not, so
  // if that set ever empties the adapter is dead code pretending to be reach.
  assert.ok(SF.some((s) => s.platform === 'woocommerce'), 'no WooCommerce shop is configured');
});

test('the check script retailers.ts names actually exists', () => {
  // retailers.ts promised `npm run market:check` by name from the day the
  // Market shipped, and for two days it did not exist.
  assert.ok(existsSync('scripts/market-check.js'), 'scripts/market-check.js is gone');
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.ok(pkg.scripts['market:check'], 'the market:check script is not in package.json');
  const retailers = readFileSync('src/modules/market/retailers.ts', 'utf8');
  for (const named of retailers.match(/npm run [a-z:-]+/g) ?? []) {
    const name = named.replace('npm run ', '');
    assert.ok(pkg.scripts[name], `retailers.ts names "${named}" and it does not exist`);
  }
});

test('a mixed-currency headline names the currency it belongs to', () => {
  // "from $4.00" must not read as the floor of a set that also holds GBP.
  const head = PAGE.slice(PAGE.indexOf('function resultHead'), PAGE.indexOf('function deptGrid'));
  assert.ok(/d\.mixedCurrency/.test(head), 'the header ignores whether the set is mixed');
  assert.ok(/' in ' \+ d\.currency/.test(head), 'a mixed headline no longer names its currency');
});

/* ── the department glyphs are the right objects ─────────────────────── */

/** The icon names web/market.html actually has a drawing for. */
function pageIconNames(): Set<string> {
  const from = PAGE.indexOf('var DEPT_ICON = {');
  const to = PAGE.indexOf('function deptIcon(');
  assert.ok(from > 0 && to > from, 'the DEPT_ICON map moved; fix this slice');
  const block = PAGE.slice(from, to);
  return new Set([...block.matchAll(/^\s{8}([a-z]+):$/gm)].map((m) => m[1]!));
}

test('every department has a drawing, and no drawing is dead', () => {
  // A department whose icon has no drawing renders an empty tile, and a
  // drawing no department uses is art nobody sees. Asserted both ways so
  // neither side can drift.
  const drawn = pageIconNames();
  const used = new Set(DEPARTMENTS.map((d) => d.icon));
  for (const d of DEPARTMENTS) {
    assert.ok(drawn.has(d.icon), `department "${d.key}" wants icon "${d.icon}" and nothing draws it`);
  }
  for (const name of drawn) {
    assert.ok(used.has(name as never), `icon "${name}" is drawn and no department uses it`);
  }
  assert.equal(drawn.size, DEPARTMENTS.length);
});

test('a department icon is a name, not a character', () => {
  for (const d of DEPARTMENTS) {
    assert.match(d.icon, /^[a-z]+$/, `${d.key} icon is not a plain name: ${JSON.stringify(d.icon)}`);
    // Anything outside ASCII here means an emoji crept back in.
    assert.ok(
      !/[^\x20-\x7e]/.test(d.icon),
      `${d.key} icon carries a non-ASCII character: ${JSON.stringify(d.icon)}`
    );
  }
});

test('the three wrong glyphs cannot come back', () => {
  // Reported from the live app: a ball on Baskets and a laundry basket on
  // Accessories. The bow was on fairway drivers. None of the three is the
  // object its department sells.
  const wrong: Array<[string, string]> = [
    ['\u{1F3C0}', 'a basketball'],
    ['\u{1F9FA}', 'a wicker laundry basket'],
    ['\u{1F3F9}', 'a bow and arrow'],
  ];
  const catalogue = readFileSync('src/modules/market/market.catalog.ts', 'utf8');
  for (const [ch, what] of wrong) {
    assert.ok(!catalogue.includes(ch), `the catalogue carries ${what} again`);
    assert.ok(!PAGE.includes(ch), `the Market page carries ${what} again`);
  }
});

test('the page draws the icon by name rather than trusting the response', () => {
  // `glyph` was interpolated straight into the tile as HTML -- the one
  // unescaped field there. It is a lookup now, so the response cannot carry
  // markup into the page at all.
  assert.ok(/deptIcon\(x\.icon\)/.test(PAGE), 'the tile no longer looks its icon up by name');
  assert.ok(!/\+ x\.glyph \+/.test(PAGE), 'the response value is interpolated as markup again');
  assert.ok(
    /DEPT_ICON\[name\] \|\| DEPT_ICON\.discs/.test(PAGE),
    'an unknown icon name no longer falls back to a drawing'
  );
});

test('the basket glyph is the logo basket, not a round thing', () => {
  // The brand basket is a thick rounded top bar, bold vertical chains, a wide
  // trapezoid tray and a post. Pinned loosely -- the parts, not the
  // coordinates -- so it can be redrawn but not quietly replaced by a circle.
  const from = PAGE.indexOf('        basket:');
  const to = PAGE.indexOf('        shirt:');
  assert.ok(from > 0 && to > from, 'the basket drawing moved');
  const art = PAGE.slice(from, to);
  assert.ok(/<rect[^>]*rx=/.test(art), 'the basket lost its rounded top bar');
  const chains = (art.match(/M[\d.]+ 8\.6V14/g) ?? []).length;
  assert.ok(chains >= 4, `the basket should have at least four chain bars, found ${chains}`);
  assert.ok(/h13\.2l-2\.4 3\.5H7\.8z|h[\d.]+l-[\d.]+ [\d.]+H[\d.]+z/.test(art), 'the basket lost its trapezoid tray');
  assert.ok(!/<circle/.test(art), 'the basket is drawn with a circle');
});
