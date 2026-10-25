// src/modules/market/market.test.ts — guards on the Market fan-out.
//
// The Market shows real money on a page that looks like a shop, so the things
// pinned here are the ones that would be wrong quietly: a price compared
// against a different currency, a sale that is not happening, a shop that
// disappears instead of reporting itself down, and a link that does not go
// where it says.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createMarketService,
  parsePrice,
  productUrl,
  normalise,
  FAN_OUT_LIMIT,
} from './market.service';
import { RETAILERS } from './retailers';
import { DEPARTMENTS, featuredDepartment } from './market.catalog';

const SRC = readFileSync('src/modules/market/market.service.ts', 'utf8');

/** A Shopify suggest payload, in the shape the real endpoint returns. */
function shopifyBody(products: Array<Record<string, unknown>>) {
  return { resources: { results: { products } } };
}

function product(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'Lucid Truth',
    url: '/products/lucid-truth?_pos=1&_psq=truth&_ss=e',
    price: '16.99',
    price_min: '16.99',
    price_max: '16.99',
    compare_at_price_min: '0.00',
    available: true,
    featured_image: { url: 'https://cdn.shopify.com/x.jpg' },
    vendor: 'Dynamic Discs',
    type: 'Discs',
    ...over,
  };
}

/** A fetch stand-in: route by host substring, so no network is touched. */
function fakeFetch(routes: Record<string, () => unknown>, log?: string[]) {
  return (async (url: string | URL) => {
    const u = String(url);
    log?.push(u);
    const key = Object.keys(routes).find((k) => u.includes(k));
    if (!key) return { ok: true, json: async () => shopifyBody([]) } as unknown as Response;
    const out = routes[key]!();
    if (out instanceof Error) throw out;
    if (typeof out === 'number') {
      return { ok: false, status: out, json: async () => ({}) } as unknown as Response;
    }
    return { ok: true, json: async () => out } as unknown as Response;
  }) as unknown as typeof fetch;
}

test('a price of zero is a parse failure, not a free disc', () => {
  assert.equal(parsePrice('0.00'), null);
  assert.equal(parsePrice(''), null);
  assert.equal(parsePrice('not a price'), null);
  assert.equal(parsePrice('16.99'), 16.99);
  assert.equal(parsePrice(16.99), 16.99);
});

test('the product link is absolute, on the shop, and carries no search tracking', () => {
  const url = productUrl('dynamicdiscs.com', '/products/lucid-truth?_pos=1&_psq=truth&_ss=e&variant=7');
  assert.equal(url, 'https://dynamicdiscs.com/products/lucid-truth?variant=7');
  // A url that leaves the shop is not that shop's product, whatever it claims.
  assert.equal(productUrl('dynamicdiscs.com', 'https://evil.example/products/x'), null);
  assert.equal(productUrl('dynamicdiscs.com', ''), null);
});

test('a compare-at price at or below the price is not a sale', () => {
  const shop = RETAILERS[0]!;
  const noSale = normalise(product({ compare_at_price_min: '16.99' }), shop, 'USD', 'Shop');
  assert.equal(noSale!.compareAt, null, 'an equal compare-at was shown as a discount');
  const zeroed = normalise(product({ compare_at_price_min: '0.00' }), shop, 'USD', 'Shop');
  assert.equal(zeroed!.compareAt, null, "Shopify's empty default was shown as a discount");
  const real = normalise(product({ compare_at_price_min: '24.99' }), shop, 'USD', 'Shop');
  assert.equal(real!.compareAt, 24.99);
});

test('a product with no usable link is dropped rather than rendered dead', () => {
  const shop = RETAILERS[0]!;
  assert.equal(normalise(product({ url: '' }), shop, 'USD', 'S'), null);
  assert.equal(normalise(product({ title: '  ' }), shop, 'USD', 'S'), null);
});

test('one shop failing never costs the search, and is reported as down', async () => {
  const svc = createMarketService({
    fetchImpl: fakeFetch({
      'meta.json': () => ({ name: 'Shop', currency: 'USD' }),
      'dynamicdiscs.com/search': () => 404,
      'search/suggest.json': () => shopifyBody([product()]),
    }),
  });
  const r = await svc.search('truth');
  const down = r.shops.filter((s) => !s.ok);
  assert.equal(down.length, 1, 'the failing shop was not isolated');
  assert.equal(down[0]!.key, 'dynamic-discs');
  assert.match(down[0]!.error ?? '', /404/);
  assert.ok(r.products.length > 0, 'one dead shop emptied the whole page');
  assert.equal(r.shops.length, RETAILERS.length, 'a dead shop vanished instead of reporting itself');
});

test('prices in different currencies are never compared', async () => {
  const svc = createMarketService({
    fetchImpl: fakeFetch({
      // One shop quotes in SEK; everything else in USD.
      'kastaplast.se/meta.json': () => ({ name: 'Kastaplast', currency: 'SEK' }),
      'meta.json': () => ({ name: 'Shop', currency: 'USD' }),
      'kastaplast.se/search': () => shopifyBody([product({ id: 9, price: '99.00' })]),
      'search/suggest.json': () => shopifyBody([product({ price: '16.99' })]),
    }),
  });
  const r = await svc.search('truth');
  assert.ok(
    r.products.some((p) => p.currency === 'SEK') && r.products.some((p) => p.currency === 'USD'),
    'the fixture did not actually produce two currencies'
  );
  assert.equal(r.cheapest, null, 'a cheapest price was claimed across two currencies');
  assert.equal(r.currency, null);
  // And the ordering groups by currency rather than interleaving the numbers.
  const codes = r.products.map((p) => p.currency);
  assert.deepEqual([...codes].sort(), codes, 'two currencies were sorted together by raw price');
});

test('with one currency the cheapest in-stock price is reported', async () => {
  const svc = createMarketService({
    fetchImpl: fakeFetch({
      'meta.json': () => ({ name: 'Shop', currency: 'USD' }),
      'dynamicdiscs.com/search': () => shopifyBody([product({ price: '9.99' })]),
      'search/suggest.json': () => shopifyBody([product({ price: '16.99' })]),
    }),
  });
  const r = await svc.search('truth');
  assert.equal(r.currency, 'USD');
  assert.equal(r.cheapest, 9.99);
});

test('a sold-out product is never the cheapest price we advertise', async () => {
  const svc = createMarketService({
    fetchImpl: fakeFetch({
      'meta.json': () => ({ name: 'Shop', currency: 'USD' }),
      'dynamicdiscs.com/search': () => shopifyBody([product({ price: '1.00', available: false })]),
      'search/suggest.json': () => shopifyBody([product({ price: '16.99' })]),
    }),
  });
  const r = await svc.search('truth');
  assert.equal(r.cheapest, 16.99, 'a sold-out listing set the headline price');
});

test('a throttle is retried; a refusal is not', async () => {
  for (const [status, expectedCalls] of [[503, 2], [429, 2], [404, 1], [403, 1]] as const) {
    let calls = 0;
    const svc = createMarketService({
      fetchImpl: fakeFetch({
        'meta.json': () => ({ name: 'S', currency: 'USD' }),
        'dynamicdiscs.com/search': () => {
          calls++;
          return status;
        },
      }),
    });
    await svc.search('truth', { retailer: 'dynamic-discs' });
    assert.equal(calls, expectedCalls, `HTTP ${status} was retried ${calls} time(s)`);
  }
});

test('a blank query touches no shop at all', async () => {
  const log: string[] = [];
  const svc = createMarketService({ fetchImpl: fakeFetch({}, log) });
  const r = await svc.search('   ');
  assert.equal(r.products.length, 0);
  assert.equal(log.length, 0, 'a blank query still went out to the shops');
});

test('the fan-out stays below the burst that throttles us', () => {
  // Eleven at once came back with three shops falsely reporting 503. The
  // number matters, so it is pinned with the reason beside it.
  assert.ok(FAN_OUT_LIMIT <= 6, 'the fan-out is back at a burst size that self-throttles');
  assert.match(SRC, /Promise\.all\(workers\)/, 'the pool no longer bounds concurrency');
});

test('the search is raced against a timeout it cannot exceed', () => {
  assert.match(SRC, /new AbortController\(\)/, 'a slow shop can hang the whole page');
  assert.match(SRC, /signal: ctl\.signal/, 'the abort signal is not passed to fetch');
});

test('every department is a real query, and the featured one is a department', () => {
  assert.ok(DEPARTMENTS.length >= 6);
  for (const d of DEPARTMENTS) {
    assert.ok(d.query.trim().length > 2, `${d.key} has no real query`);
    assert.ok(d.why.trim().length > 10, `${d.key} has no reason to exist`);
  }
  const keys = new Set(DEPARTMENTS.map((d) => d.key));
  assert.equal(keys.size, DEPARTMENTS.length, 'two departments share a key');
  // Rotation must land inside the list on every day, including the wrap.
  for (const day of [0, 1, 9, 10, 365, 20000]) {
    const f = featuredDepartment(new Date(day * 86_400_000));
    assert.ok(keys.has(f.key), `day ${day} featured something that is not a department`);
  }
});

test('every retailer is distinct and addressed by host only', () => {
  const keys = new Set(RETAILERS.map((r) => r.key));
  const hosts = new Set(RETAILERS.map((r) => r.host));
  assert.equal(keys.size, RETAILERS.length, 'two retailers share a key');
  assert.equal(hosts.size, RETAILERS.length, 'two retailers share a host');
  for (const r of RETAILERS) {
    assert.ok(!r.host.includes('/'), `${r.key} host carries a path`);
    assert.ok(!r.host.startsWith('http'), `${r.key} host carries a scheme`);
  }
});

test("the shop's own name and currency win over the hand-typed fallback", async () => {
  const svc = createMarketService({
    fetchImpl: fakeFetch({
      'meta.json': () => ({ name: 'Sabattus Disc Golf, Inc.', currency: 'USD' }),
    }),
  });
  const shops = await svc.shops();
  assert.ok(
    shops.every((s) => s.name === 'Sabattus Disc Golf, Inc.'),
    'the fallback name was used although the shop published its own'
  );
  assert.match(SRC, /meta\.json/, 'the shop identity is no longer read from the shop');
});

test('a search is cached, so a page does not re-hit eleven shops per keystroke', async () => {
  const log: string[] = [];
  const svc = createMarketService({
    fetchImpl: fakeFetch({ 'meta.json': () => ({ name: 'S', currency: 'USD' }) }, log),
  });
  await svc.search('truth');
  const after = log.length;
  const second = await svc.search('TRUTH  ');
  assert.equal(second.cached, true, 'the repeat search was not served from cache');
  assert.equal(log.length, after, 'the repeat search went back out to the shops');
});
