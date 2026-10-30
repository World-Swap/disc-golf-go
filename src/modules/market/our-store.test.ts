// src/modules/market/our-store.test.ts — the Disc Golf Go store competes in
// our own Market on price, with no preference of any kind.
//
// These guards exist because this is a stronger temptation than the affiliate
// layer: a commission is somebody else's margin, and this is ours. The one
// that matters is "dearest ranks last" -- it drives the REAL service over
// fixtures where our own shop is the most expensive and fails if our listing
// is anywhere but the bottom.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMarketService } from './market.service';
import { parseOurStore, isOurs, OUR_STORE_LABEL } from './our-store';
import { attachAffiliate } from './affiliate';

const OURS = 'shop.discgolfgo.com';

/** A fetch stand-in routed by url substring; no network is touched. */
function fakeFetch(routes: Record<string, () => unknown>, log?: string[]) {
  return (async (url: string | URL) => {
    const u = String(url);
    log?.push(u);
    const key = Object.keys(routes).find((k) => u.includes(k));
    const out = key ? routes[key]!() : '';
    if (typeof out === 'number') return { ok: false, status: out, text: async () => '' } as unknown as Response;
    const body = typeof out === 'string' ? out : JSON.stringify(out);
    return { ok: true, text: async () => body, json: async () => JSON.parse(body) } as unknown as Response;
  }) as unknown as typeof fetch;
}

/** One Shopify shop answering a product search at `price`. */
function shop(host: string, price: string, name: string) {
  return {
    [`${host}/meta.json`]: () => ({ currency: 'USD', name }),
    [`${host}/search/suggest.json`]: () => ({
      resources: {
        results: {
          products: [
            { id: 1, title: 'Discraft ESP Buzzz', url: '/products/buzzz', price, available: true },
          ],
        },
      },
    }),
  };
}

/** The real service, with a rival shop and ours, at the prices given. */
function market(opts: { ourPrice: string; rivalPrice: string; affiliate?: string }) {
  return createMarketService({
    hosts: ['rival.example'],
    ourStore: OURS,
    affiliate: opts.affiliate,
    keys: {},
    fetchImpl: fakeFetch({
      ...shop('rival.example', opts.rivalPrice, 'Rival Discs'),
      ...shop(OURS, opts.ourPrice, OUR_STORE_LABEL),
    }),
  });
}

/* ── ours first, and everyone else strictly on price ─────────────────── */

test('our own stock comes first, even when a rival is cheaper', async () => {
  // Owner's call, 2026-10-30, reversing the launch behaviour. We are in no
  // affiliate programme and take no payment from any retailer here, so we owe
  // none of them equal billing inside our own app.
  //
  // This REPLACES a guard asserting the opposite ("our own store ranks LAST
  // when it is the dearest"). The condition that guard stood for was never
  // "we must lose" -- it was "the order is what we say it is, and the page
  // says what the order is". That condition still holds; what it asserts has
  // been inverted to match the declared rule, and the copy guard below is
  // what keeps the page honest about it.
  const r = await market({ ourPrice: '24.99', rivalPrice: '9.99' }).search('buzzz');

  assert.equal(r.products.length, 2, 'both shops should have answered');
  assert.equal(r.products[0]!.ours, true, 'our own stock is not first');
  assert.equal(r.products[0]!.price, 24.99);
  // And the cheaper rival is still RIGHT THERE, at its real price. Ordering
  // our stock first is a declared choice; hiding or misreporting a price
  // would be a lie, and nothing in this change touches a price.
  assert.equal(r.products[1]!.price, 9.99, 'the cheaper rival was dropped or repriced');
  assert.equal(r.cheapest, 9.99, 'the headline price stopped being the real cheapest');
});

test('among everyone who is not us, the order is still strictly by price', async () => {
  // The half of the old guarantee that survives, and the one that matters to
  // a reader: we may put ourselves first, but a THIRD PARTY cannot buy
  // position. Nothing a retailer does moves them up.
  const svc = createMarketService({
    hosts: ['cheap.example', 'dear.example', 'mid.example'],
    ourStore: OURS,
    keys: {},
    fetchImpl: fakeFetch({
      ...shop('cheap.example', '5.00', 'Cheap'),
      ...shop('dear.example', '30.00', 'Dear'),
      ...shop('mid.example', '15.00', 'Mid'),
      ...shop(OURS, '20.00', OUR_STORE_LABEL),
    }),
  });
  const r = await svc.search('buzzz');
  assert.equal(r.products[0]!.ours, true, 'our own stock is not first');
  const rest = r.products.slice(1).map((p) => p.price);
  assert.deepEqual(rest, [5, 15, 30], 'third-party results are no longer price-ordered');
});

test('the ranking is ours to declare, but never a commission\'s to bend', async () => {
  // The distinction the whole design now rests on. Our own store first is a
  // choice we DECLARE on the page. A retailer paying to move up would be one
  // we HIDE, and that stays forbidden -- affiliate.ts tags only after this
  // sort has run, which its own guards pin.
  //
  // Here that is proved end to end: a programme paying on the DEAREST
  // third-party shop must not move it above the cheapest one.
  const svc = createMarketService({
    hosts: ['cheap.example', 'dear.example'],
    ourStore: OURS,
    affiliate: 'dear.example|aff|PAID',
    keys: {},
    fetchImpl: fakeFetch({
      ...shop('cheap.example', '5.00', 'Cheap'),
      ...shop('dear.example', '30.00', 'Dear'),
      ...shop(OURS, '20.00', OUR_STORE_LABEL),
    }),
  });
  const r = await svc.search('buzzz');
  assert.equal(r.products[0]!.ours, true, 'our own stock is not first');
  assert.equal(r.products[1]!.price, 5, 'a paying retailer was floated above a cheaper one');
  assert.equal(r.products[2]!.price, 30);
  assert.equal(r.products[2]!.commissioned, true, 'the paying retailer stopped being tagged');
});

test('the comparator ranks on ownership, price and stock -- and nothing else', () => {
  // Structural. `ours` is now legitimately in the comparator, so this can no
  // longer assert its absence. What it must still assert is that nothing
  // ELSE got in: no commission, no sponsorship, no per-retailer weighting.
  const src = readFileSync('src/modules/market/market.service.ts', 'utf8');
  const start = src.indexOf('products.sort(');
  assert.ok(start > 0, 'the sort moved; this guard needs re-pointing');
  const cmp = src.slice(start, src.indexOf('});', start));
  for (const forbidden of ['commission', 'affiliate', 'sponsor', 'paid', 'boost', 'promoted']) {
    assert.ok(
      !new RegExp(forbidden, 'i').test(cmp),
      `the comparator references "${forbidden}" -- position can be bought`
    );
  }
  // And it must still be reading a real price, not a rank we assigned.
  assert.ok(/a\.price - b\.price/.test(cmp), 'the comparator stopped ordering by price');
});

/* ── honesty: a player must know one of the sellers is us ────────────── */

test('a listing of ours is labelled, and a rival\'s is not', async () => {
  const r = await market({ ourPrice: '12.00', rivalPrice: '13.00' }).search('buzzz');
  const mine = r.products.find((p) => p.url.includes(OURS));
  const theirs = r.products.find((p) => p.url.includes('rival.example'));
  assert.equal(mine?.ours, true, 'our own listing is not marked as ours');
  assert.ok(!theirs?.ours, "a rival's listing was marked as ours");
  assert.deepEqual(r.ourStore, { host: OURS, label: OUR_STORE_LABEL });
});

test('a lookalike domain cannot wear our label', () => {
  // Dot-anchored, exactly as affiliate.ts matches a programme.
  assert.equal(isOurs(`https://${OURS}/products/x`, OURS), true);
  assert.equal(isOurs(`https://www.${OURS}/products/x`, OURS), true);
  assert.equal(isOurs(`https://eu.${OURS}/products/x`, OURS), true, 'a real subdomain is ours');
  assert.equal(isOurs('https://notshop.discgolfgo.com.evil.example/x', OURS), false);
  assert.equal(isOurs(`https://evil-${OURS}/x`, OURS), false);
  assert.equal(isOurs('not a url', OURS), false, 'an unparseable url must not be claimed as ours');
  assert.equal(isOurs(`https://${OURS}/x`, null), false, 'nothing is ours with no store configured');
});

/* ── we never pay ourselves a commission ─────────────────────────────── */

test('our own store is never affiliate-tagged', async () => {
  // A commission is what a third party pays for a referral. On our own sale
  // there is nobody to pay it, and appending a tracking parameter to our own
  // checkout url would at best mean nothing and at worst hand a stranger the
  // attribution. Configured here to pay on BOTH hosts, including ours.
  const r = await market({
    ourPrice: '12.00',
    rivalPrice: '13.00',
    affiliate: `${OURS}|ref|US123, rival.example|aff|R456`,
  }).search('buzzz');

  const mine = r.products.find((p) => p.ours);
  const theirs = r.products.find((p) => !p.ours);
  assert.ok(mine, 'our listing vanished');
  assert.equal(mine!.commissioned, false, 'we tagged our own store');
  assert.ok(!mine!.url.includes('ref=US123'), 'our own url carries an affiliate tag');
  // The rival still earns, so this is not the tagger being broken outright.
  assert.equal(theirs!.commissioned, true, 'a third-party result stopped being tagged');
  assert.ok(theirs!.url.includes('aff=R456'));
});

test('attachAffiliate skips ours without reordering anything', () => {
  const hits = [
    { url: 'https://rival.example/products/a', ours: false },
    { url: `https://${OURS}/products/b`, ours: true },
  ];
  const out = attachAffiliate(hits, [{ host: OURS, param: 'ref', id: 'X' }]);
  assert.equal(out.length, 2);
  assert.equal(out[1]!.url, `https://${OURS}/products/b`, 'our url was rewritten');
  assert.equal(out[1]!.commissioned, false);
});

/* ── unconfigured is a complete no-op ────────────────────────────────── */

test('with no store configured, nothing is ours and nothing is asked of it', async () => {
  // This is the state this ships in: the Shopify store is not live yet.
  const log: string[] = [];
  const svc = createMarketService({
    hosts: ['rival.example'],
    keys: {},
    fetchImpl: fakeFetch(shop('rival.example', '9.99', 'Rival Discs'), log),
  });
  const r = await svc.search('buzzz');

  assert.equal(r.ourStore, null, 'a store was reported with none configured');
  assert.ok(
    r.products.every((p) => !p.ours),
    'a listing was marked as ours with no store configured'
  );
  assert.ok(
    !log.some((u) => u.includes('discgolfgo')),
    'our own store was asked for products although none is configured'
  );
  assert.equal(svc.status().ourStore, null);
});

/* ── a malformed host narrows, never widens ──────────────────────────── */

test('a malformed STORE_SHOPIFY_HOST is dropped and warned about, never guessed', () => {
  // Same rule as MARKET_AFFILIATE and REWARDS_TEST_PLAYER_IDS. Guessing here
  // would fan a product search out to whatever the typo resolved to.
  for (const bad of ['', '   ', 'not a host', 'nodot', 'http://shop.example', 'ftp://x.example', '//', '.com', 'shop..example']) {
    const warned: string[] = [];
    assert.equal(parseOurStore(bad, (m) => warned.push(m)), null, `accepted ${JSON.stringify(bad)}`);
    if (bad.trim()) assert.equal(warned.length, 1, `silently ignored ${JSON.stringify(bad)}`);
  }
  // Unset is not an error and must not warn.
  const quiet: string[] = [];
  assert.equal(parseOurStore(undefined, (m) => quiet.push(m)), null);
  assert.equal(quiet.length, 0, 'an unset store warned as though it were a typo');
});

test('a host is accepted bare, with www., or as a full https url', () => {
  // All three are what somebody pastes out of a Shopify dashboard.
  for (const good of [OURS, `www.${OURS}`, `https://${OURS}`, `https://${OURS}/`, `https://${OURS}/collections/all`, `  ${OURS}  `, OURS.toUpperCase()]) {
    assert.equal(parseOurStore(good, () => {}), OURS, `rejected ${JSON.stringify(good)}`);
  }
  assert.equal(parseOurStore('discgolfgo.myshopify.com', () => {}), 'discgolfgo.myshopify.com');
});

test('naming our store twice does not ask it twice', async () => {
  // It is appended to the storefront list, so a later commit adding it to
  // STOREFRONTS as well must not double the fan-out.
  const log: string[] = [];
  const svc = createMarketService({
    hosts: [OURS],
    ourStore: OURS,
    keys: {},
    fetchImpl: fakeFetch(shop(OURS, '9.99', OUR_STORE_LABEL), log),
  });
  const r = await svc.search('buzzz');
  assert.equal(r.products.length, 1, 'our store was asked twice and listed twice');
  assert.equal(
    log.filter((u) => u.includes('suggest.json')).length,
    1,
    'our store was searched twice'
  );
});

/* ── the page says it, and cannot stop saying it ─────────────────────── */

const PAGE = readFileSync('web/market.html', 'utf8');

test('the page labels a listing of ours from the server, not from a guess', () => {
  const cardFn = PAGE.slice(PAGE.indexOf('function card('), PAGE.indexOf('function downNote'));
  assert.ok(/p\.ours/.test(cardFn), 'the card never reads whether a listing is ours');
  assert.ok(/card__ours/.test(cardFn), 'the card renders no "Ours" badge');
  // It must not re-derive ownership client-side by sniffing the url: the
  // server sets `ours` by dot-anchored host match, and a second, looser copy
  // of that rule in the page is how the first one comes to be wrong.
  assert.ok(
    !/discgolfgo/i.test(cardFn),
    'the card hardcodes our domain instead of reading the server flag'
  );
});

test('the "Ours" badge cannot be ellipsised away by a long shop name', () => {
  // .card__shopname truncates. A badge nested inside it would vanish on long
  // retailer names, and a disclosure that disappears on some rows is worse
  // than none -- it reads as "this one is not ours".
  const cardFn = PAGE.slice(PAGE.indexOf('function card('), PAGE.indexOf('function downNote'));
  const shopBlock = cardFn.slice(cardFn.indexOf('card__shop'));
  assert.ok(
    shopBlock.indexOf('card__shopname') < shopBlock.indexOf('card__ours'),
    'the badge is not a sibling of the truncating shop name'
  );
  assert.match(PAGE, /\.card__ours\s*\{[^}]*flex:\s*none/, 'the badge is allowed to shrink');
  assert.match(PAGE, /\.card__shopname\s*\{[^}]*text-overflow:\s*ellipsis/, 'the name no longer truncates');
});

test('"nothing here is ours" is only said when nothing here is ours', () => {
  // The claim the whole comparison was built on, and the most damaging thing
  // to leave stale: a promise of neutrality a reader can disprove by
  // scrolling. Both versions must exist and the store must pick between them.
  // Long copy is built by concatenating string literals, so a phrase can be
  // split across `' + '` and a naive regex over the source will not find it --
  // which is exactly how this guard failed first time, reporting missing copy
  // that was plainly on the page. Join the literals before matching.
  const joined = (t: string) => t.replace(/'\s*\+\s*'/g, '');
  const fn = joined(PAGE.slice(PAGE.indexOf('function storeNote()'), PAGE.indexOf('function storeRow()')));
  assert.ok(/if \(!state\.ourStore\)/.test(fn), 'the copy does not branch on whether we sell here');
  const [noStore, withStore] = fn.split('return').slice(1, 3);
  assert.ok(/Nothing here is ours/i.test(noStore!), 'the neutral claim was dropped entirely');
  assert.ok(!/Nothing here is ours/i.test(withStore!), 'we still claim nothing here is ours while selling');
  // And the version that admits it must DECLARE the ordering rather than
  // leave a reader to infer neutrality. This replaces an assertion that the
  // copy promised "we never rank ourselves higher" -- which it must no longer
  // say, because as of 2026-10-30 we do. The condition that guard stood for
  // was "the page states how results are ordered", and that still holds.
  assert.ok(
    /comes first/i.test(withStore!),
    'the store copy does not say our own stock comes first'
  );
  assert.ok(
    /by price/i.test(withStore!),
    'the store copy does not say the rest are ordered by price'
  );
  assert.ok(
    !/never rank/i.test(withStore!),
    'the copy still claims we are not ranked higher, which is no longer true'
  );
});

test('no copy a player reads claims we are not a shop while we are one', () => {
  // Found by RENDERING the page and reading it, not by a test: the first
  // version of this guard checked storeNote() only, and the lede -- static
  // markup, above the fold, directly above a listing badged "Ours" -- still
  // read "We are not a shop". The same shape as the home.html miss in
  // CLAUDE.md: the stale copy was the one line nothing looked at.
  //
  // So this checks EVERY place the claim can be written: the static lede must
  // be overridden whenever a store is configured.
  const claims = [...PAGE.matchAll(/not a shop/gi)];
  assert.ok(claims.length > 0, 'the neutral claim vanished entirely; it is true when we sell nothing');
  const fn = PAGE.slice(PAGE.indexOf('function setLede()'), PAGE.indexOf('// The way in to our own'))
    .replace(/'\s*\+\s*'/g, '');
  assert.ok(/if \(!state\.ourStore\) return/.test(fn), 'the lede is not conditional on having a store');
  assert.ok(/getElementById\('lede'\)/.test(fn), 'the lede is never rewritten');
  assert.ok(!/not a shop/i.test(fn), 'the rewritten lede still says we are not a shop');
  assert.ok(/comes first/i.test(fn), 'the rewritten lede does not declare that our stock is first');
  assert.ok(!/never rank/i.test(fn), 'the lede still claims a neutrality we no longer have');
  // And it must actually be called, or it is dead code that guards nothing.
  assert.ok(/setLede\(\);/.test(PAGE), 'setLede is never called');
});

test('the store row appears only when a store is configured', () => {
  const fn = PAGE.slice(PAGE.indexOf('function storeRow()'), PAGE.indexOf('// Department glyphs'));
  assert.ok(/if \(!state\.ourStore\) return ''/.test(fn), 'the store row can render with no store');
  assert.ok(/state\.ourStore\.host/.test(fn), 'the row does not link to the configured host');
  assert.ok(!/discgolfgo/i.test(fn), 'the row hardcodes a domain instead of reading config');
});

test('the store row spans are block, not inline', () => {
  // .srow__body is a flex ITEM, not a container. Flex blockifies its children
  // but not its grandchildren, and this exact trap has shipped four times now
  // (.lprev__*, .uprow__*, .nrow__*, admin .stat span).
  assert.match(
    PAGE,
    /\.srow__title,\s*\.srow__sub\s*\{[^}]*display:\s*block/,
    'the store row spans will run into each other'
  );
});

/* ── we sell genuine stock, and claim no relationship we do not have ─── */

test('no page claims we are an authorized or official dealer', () => {
  // We hold the merchandise: the stock is bought and owned outright rather
  // than sold under a dealer agreement, so pricing is ours and there is no
  // MAP obligation (owner, 2026-10-30, correcting an earlier note in this
  // repo that assumed the opposite).
  //
  // What that does NOT buy is a relationship with the brands. Naming what a
  // disc is -- "Innova Destroyer" -- is accurate and necessary to sell it.
  // Saying we are an authorized, official or licensed dealer OF Innova is a
  // claim about Innova, and it is not ours to make.
  const pages = ['web/market.html', 'web/promo.html'];
  const forbidden = [
    /\bauthoriz(?:ed|ed)\s+(?:dealer|retailer|reseller|distributor)/i,
    /\bauthorised\s+(?:dealer|retailer|reseller|distributor)/i,
    /\bofficial\s+(?:dealer|retailer|reseller|distributor|partner)/i,
    /\blicensed\s+(?:dealer|retailer|reseller|distributor)/i,
    /\bbrand\s+partner\b/i,
  ];
  for (const file of pages) {
    const html = readFileSync(file, 'utf8');
    // Read what a player actually sees: strip comments so prose explaining
    // this rule cannot trip it -- the trap CLAUDE.md records four times.
    const visible = html.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const re of forbidden) {
      assert.ok(!re.test(visible), `${file} claims a dealer relationship we do not have (${re})`);
    }
  }
});
