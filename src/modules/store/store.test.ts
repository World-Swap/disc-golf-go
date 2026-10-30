// src/modules/store/store.test.ts — browsing our own stock in the app.
//
// The rules here are about what the app must NOT do: hold a price, take a
// payment, send a player off our host, or offer something sold out as though
// it were buyable.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createStoreService, PAGE_SIZE } from './store.service';

const HOST = 'shop.discgolfgo.com';

/** A fetch stand-in routed by url substring; no network is touched. */
function fakeFetch(routes: Record<string, () => unknown>, log?: string[]) {
  return (async (url: string | URL) => {
    const u = String(url);
    log?.push(u);
    const key = Object.keys(routes).find((k) => u.includes(k));
    const out = key ? routes[key]!() : null;
    if (out === null) return { ok: false, status: 404, text: async () => '' } as unknown as Response;
    return { ok: true, text: async () => JSON.stringify(out) } as unknown as Response;
  }) as unknown as typeof fetch;
}

function product(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'Disc Golf Go Tour Hat',
    handle: 'dgg-tour-hat',
    vendor: 'Disc Golf Go',
    product_type: 'Apparel',
    images: [{ src: 'https://cdn.shopify.com/hat.png' }],
    variants: [{ id: 11, title: 'One size', price: '24.00', available: true }],
    ...over,
  };
}

// NB: host is NOT a defaulted parameter. Passing `undefined` to a default
// parameter uses the default, so an "unconfigured" case written that way
// silently tests the configured one -- which is exactly what happened here.
function svc(products: unknown[], log?: string[], host: string = HOST) {
  return createStoreService({
    host,
    fetchImpl: fakeFetch(
      {
        '/meta.json': () => ({ currency: 'USD' }),
        '/products.json': () => ({ products }),
        '/collections.json': () => ({
          collections: [{ handle: 'discs', title: 'Discs', products_count: 12 }],
        }),
      },
      log
    ),
  });
}

/* ── unconfigured is a complete no-op ────────────────────────────────── */

test('with no storefront configured, nothing is browsable and nothing is fetched', async () => {
  // The state this ships in. An empty grid that silently fetched would be
  // worse than one that says the store is not open.
  const log: string[] = [];
  const s = svc([product()], log, ''); // empty, not undefined: see svc()

  assert.equal(s.status().open, false);
  assert.equal(s.status().host, null);
  assert.deepEqual(await s.collections(), []);
  const page = await s.products();
  assert.deepEqual(page.products, []);
  assert.equal(log.length, 0, 'the store was asked for products with none configured');
});

/* ── every link stays on our host ────────────────────────────────────── */

test('a product url is rebuilt against our own host, never taken from the response', async () => {
  // The catalogue is ours, but rebuilding is what makes "every link stays on
  // our host" a property of the code rather than a hope: a field we do not
  // control cannot send a player somewhere else.
  const s = svc([
    product({ handle: 'dgg-tour-hat', url: 'https://evil.example/pwned' }),
  ]);
  const { products } = await s.products();
  assert.equal(products[0]!.url, `https://${HOST}/products/dgg-tour-hat`);
  assert.equal(new URL(products[0]!.url).host, HOST);
});

test('a handle is escaped into the url rather than interpolated raw', async () => {
  const s = svc([product({ handle: 'hat/../../etc' })]);
  const { products } = await s.products();
  assert.ok(!products[0]!.url.includes('../'), 'a handle walked out of the products path');
  assert.equal(new URL(products[0]!.url).host, HOST);
});

test('a collection handle that is not a handle browses everything instead', async () => {
  // It is interpolated into a path, so it is restricted to what a Shopify
  // handle can be rather than escaped and hoped for.
  const log: string[] = [];
  const s = svc([product()], log);
  await s.products({ collection: '../../admin' });
  assert.ok(
    log.some((u) => u.includes(`https://${HOST}/products.json`)),
    'a bad collection handle did not fall back to the whole catalogue'
  );
  assert.ok(!log.some((u) => u.includes('admin')), 'a bad collection handle reached the url');
});

/* ── sold out, and prices we do not know ─────────────────────────────── */

test('a product with no available variant is shown but never marked buyable', async () => {
  // Hiding it makes the shop look emptier than it is; claiming it is in stock
  // sells something we do not have.
  const s = svc([
    product({ variants: [{ id: 11, title: 'One size', price: '24.00', available: false }] }),
  ]);
  const { products } = await s.products();
  assert.equal(products.length, 1, 'a sold-out product was hidden');
  assert.equal(products[0]!.available, false);
  // It still reports what it cost, rather than nothing.
  assert.equal(products[0]!.price, 24);
});

test('the grid price is the cheapest a buyer could actually pay', async () => {
  // With stock, the cheapest IN-STOCK variant -- not a cheaper one that
  // cannot be bought, which would advertise a price that does not exist.
  const s = svc([
    product({
      variants: [
        { id: 1, title: 'S', price: '10.00', available: false },
        { id: 2, title: 'M', price: '25.00', available: true },
        { id: 3, title: 'L', price: '30.00', available: true },
      ],
    }),
  ]);
  const { products } = await s.products();
  assert.equal(products[0]!.price, 25, 'an unbuyable variant set the price');
  assert.equal(products[0]!.available, true);
});

test('a zero or unparseable price is not a price', async () => {
  // Same rule the Market applies to a call-for-price listing: a cost we do
  // not know is not a cheap one.
  const s = svc([
    product({ variants: [{ id: 1, title: 'x', price: '0', available: true }] }),
    product({ id: 2, handle: 'b', variants: [{ id: 2, title: 'x', price: 'n/a', available: true }] }),
  ]);
  const { products } = await s.products();
  for (const p of products) assert.equal(p.price, null, 'a zero price became a price');
});

/* ── the shop's own currency, read rather than assumed ───────────────── */

test("the storefront's own currency is used, and read once", async () => {
  const log: string[] = [];
  const s = createStoreService({
    host: HOST,
    fetchImpl: fakeFetch(
      {
        '/meta.json': () => ({ currency: 'GBP' }),
        '/products.json': () => ({ products: [product()] }),
      },
      log
    ),
  });
  const a = await s.products();
  const b = await s.products({ page: 2 });
  assert.equal(a.currency, 'GBP', 'a GBP shop was reported in dollars');
  assert.equal(b.currency, 'GBP');
  assert.equal(
    log.filter((u) => u.includes('meta.json')).length,
    1,
    'the currency was re-read; it is identity, not inventory'
  );
});

/* ── paging ──────────────────────────────────────────────────────────── */

test('a full page offers more and a short page does not', async () => {
  const full = Array.from({ length: PAGE_SIZE }, (_, i) =>
    product({ id: i + 1, handle: `p-${i + 1}` })
  );
  assert.equal((await svc(full).products()).more, true);
  assert.equal((await svc(full.slice(0, 3)).products()).more, false);
});

test('a page number out of range is clamped rather than passed through', async () => {
  const log: string[] = [];
  const s = svc([product()], log);
  await s.products({ page: -5 });
  assert.ok(log.some((u) => u.includes('page=1')), 'a negative page reached the url');
});

/* ── nothing is stored, and nothing is charged here ──────────────────── */

test('the store module holds no repo and caches no product', () => {
  // The Market's rule, for the Market's reason: a cached price is a price
  // eventually shown wrongly, and a cached stock flag sells what we do not
  // have.
  assert.ok(!existsSync('src/modules/store/store.repo.ts'), 'the store grew a repo');
  const src = readFileSync('src/modules/store/store.service.ts', 'utf8');
  assert.ok(!/INSERT INTO|SELECT .* FROM/i.test(src), 'the store module reaches a database');
});

test('the store page never takes a payment', () => {
  // Buying happens on our Shopify product page, which owns the variant
  // picker, the live stock, the shipping and every byte of card data. That is
  // the entire reason the storefront is Shopify-backed; a cart here would
  // throw away the one thing it buys.
  const page = readFileSync('web/store.html', 'utf8');
  for (const re of [/<form[^>]*checkout/i, /card number/i, /\bcvv\b/i, /stripe/i, /paypal/i]) {
    assert.ok(!re.test(page), `the store page is collecting payment (${re})`);
  }
  // And every product link leaves for the seller's own page, safely.
  assert.ok(/target="_blank"/.test(page) && /noopener/.test(page), 'product links lost noopener');
});

test('the page says the store is not open rather than showing an empty grid', () => {
  const page = readFileSync('web/store.html', 'utf8');
  assert.ok(/if \(!state\.open\)/.test(page), 'the page does not branch on whether we sell yet');
  assert.ok(/not open yet/i.test(page), 'the unconfigured state says nothing');
});

test('the store row spans are block, not inline', () => {
  // .pcard__body is a flex ITEM, not a container -- the trap that has shipped
  // in .lprev__*, .uprow__*, .nrow__*, .srow__* and the admin .stat span.
  const page = readFileSync('web/store.html', 'utf8');
  assert.match(
    page,
    /\.pcard__title,\s*\.pcard__price,\s*\.pcard__meta\s*\{[^}]*display:\s*block/,
    'the product card spans will run into each other'
  );
});

test('the /store route is registered, which is the step that once 404d /lounge', () => {
  const src = readFileSync('src/http/static.ts', 'utf8');
  assert.match(src, /'\/store':\s*'store\.html'/, '/store is not in the route table');
});
