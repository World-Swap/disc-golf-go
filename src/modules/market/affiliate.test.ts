// src/modules/market/affiliate.test.ts — guards on how the Market earns.
//
// The thing that must never happen is subtle and would be invisible: a
// commission quietly reordering results, so the Market still looks like a
// price comparison while actually being an ad. Most of what follows exists
// to make that impossible to do by accident, from two directions -- the
// structure (tagging runs after ranking, on the ranked array) and the
// behaviour (the same fixtures rank identically with and without a
// programme configured).
//
// The rest guards the ways a rewrite can go wrong in a way that costs
// somebody something: a mangled url (a lost sale), a hijacked tag (someone
// else's commission), a guessed-at typo (money to the wrong account).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { affiliateUrl, attachAffiliate, parsePrograms, programFor } from './affiliate';
import { createMarketService } from './market.service';

const SERVICE = readFileSync('src/modules/market/market.service.ts', 'utf8');
const AFFILIATE = readFileSync('src/modules/market/affiliate.ts', 'utf8');
const PAGE = readFileSync('web/market.html', 'utf8');

/** Comments stripped, so prose describing a rule cannot satisfy or trip it. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const ONE = parsePrograms('infinitediscs.com|ref|A1');

/* ── parsing: a typo must narrow, never widen ───────────────────────── */

test('no setting means no programme, which is a no-op', () => {
  for (const raw of [undefined, '', '   ']) {
    assert.deepEqual(parsePrograms(raw), [], `${JSON.stringify(raw)} produced a programme`);
  }
});

test('a well-formed setting parses, normalised', () => {
  const p = parsePrograms(' HTTPS://WWW.InfiniteDiscs.com|ref|A1 , discountdiscgolf.com|aff|B2 ');
  assert.deepEqual(p, [
    { host: 'infinitediscs.com', param: 'ref', id: 'A1' },
    { host: 'discountdiscgolf.com', param: 'aff', id: 'B2' },
  ]);
});

test('a malformed entry is dropped and warned about, never guessed', () => {
  const cases: Array<[string, string]> = [
    ['infinitediscs.com|ref', 'two fields'],
    ['infinitediscs.com|ref|A1|extra', 'four fields'],
    ['not-a-host|ref|A1', 'no TLD'],
    ['infinitediscs.com||A1', 'empty param'],
    ['infinitediscs.com|ref|', 'empty id'],
    ['infinitediscs.com|re f|A1', 'space in param'],
    ['infinitediscs.com|ref|has space', 'space in id'],
    ['infinitediscs.com|ref|a&b=c', 'id would break the query string'],
  ];
  for (const [raw, why] of cases) {
    const warnings: string[] = [];
    assert.deepEqual(parsePrograms(raw, (m) => warnings.push(m)), [], `accepted ${why}: ${raw}`);
    assert.equal(warnings.length, 1, `dropped ${why} silently`);
  }
});

test('a duplicate host is dropped rather than letting the second win', () => {
  const warnings: string[] = [];
  const p = parsePrograms('infinitediscs.com|ref|FIRST, infinitediscs.com|ref|SECOND', (m) => warnings.push(m));
  assert.equal(p.length, 1);
  assert.equal(p[0]!.id, 'FIRST');
  assert.equal(warnings.length, 1);
});

test('a warning never prints the account id', () => {
  const warnings: string[] = [];
  parsePrograms('infinitediscs.com|ref|has space', (m) => warnings.push(m));
  assert.ok(warnings.length === 1 && !warnings[0]!.includes('has space'), 'the id was logged');
});

/* ── matching: the right host, and only the right host ──────────────── */

test('a programme covers its host and its subdomains', () => {
  const p = parsePrograms('latitude64.se|ref|A1');
  for (const u of [
    'https://latitude64.se/products/x',
    'https://www.latitude64.se/products/x',
    'https://store.latitude64.se/products/x',
  ]) {
    assert.ok(programFor(u, p), `${u} was not matched`);
  }
});

test('a lookalike domain cannot collect our tag', () => {
  const p = parsePrograms('latitude64.se|ref|A1');
  for (const u of [
    'https://notlatitude64.se/products/x',
    'https://latitude64.se.evil.test/products/x',
    'https://latitude64.com/products/x',
  ]) {
    assert.equal(programFor(u, p), null, `${u} matched a programme it should not`);
    assert.equal(affiliateUrl(u, p), u, `${u} was rewritten`);
  }
});

test('only http(s) is ever rewritten', () => {
  const p = parsePrograms('example.com|ref|A1');
  for (const u of ['javascript:alert(1)', 'data:text/html,x', 'mailto:a@example.com']) {
    assert.equal(affiliateUrl(u, p), u, `${u} was rewritten`);
  }
});

/* ── rewriting ──────────────────────────────────────────────────────── */

test('an unconfigured Market returns every url byte-identical', () => {
  for (const u of [
    'https://infinitediscs.com/products/buzzz',
    'https://infinitediscs.com/products/buzzz?variant=42',
    'https://example.com/x',
  ]) {
    assert.equal(affiliateUrl(u, []), u, `${u} changed with no programme set`);
  }
});

test('a configured programme adds its tag and keeps everything else', () => {
  const out = affiliateUrl('https://infinitediscs.com/products/buzzz?variant=42', ONE);
  const u = new URL(out);
  assert.equal(u.host, 'infinitediscs.com', 'the host moved');
  assert.equal(u.pathname, '/products/buzzz', 'the path changed');
  assert.equal(u.searchParams.get('variant'), '42', 'an existing parameter was lost');
  assert.equal(u.searchParams.get('ref'), 'A1', 'the tag was not added');
});

test("an existing tag is left alone rather than overwritten", () => {
  // Overwriting would take someone else's attribution, which is a different
  // thing from earning a commission.
  const url = 'https://infinitediscs.com/products/buzzz?ref=SOMEONE_ELSE';
  assert.equal(affiliateUrl(url, ONE), url, "another party's tag was replaced");
});

test('the host can never change, whatever the programme says', () => {
  // The card prints the retailer, so that claim has to stay checkable. This
  // is also why network deep links are not supported here.
  const c = code(AFFILIATE);
  assert.ok(
    /new URL\(rewritten\)\.host !== new URL\(url\)\.host/.test(c),
    'the host-preservation check is gone from affiliateUrl'
  );
});

/* ── tagging a result set ───────────────────────────────────────────── */

test('tagging changes only the url, and marks what it changed', () => {
  const hits = [
    { title: 'a', price: 15.99, currency: 'USD', retailer: 'Infinite Discs', available: true, via: 's', image: null, url: 'https://infinitediscs.com/products/a' },
    { title: 'b', price: 12.5, currency: 'USD', retailer: 'other', available: false, via: 's', image: null, url: 'https://other.example/products/b' },
  ];
  const out = attachAffiliate(hits, ONE);

  assert.equal(out[0]!.commissioned, true, 'a covered link was not marked');
  assert.equal(out[1]!.commissioned, false, 'an uncovered link was marked');
  assert.equal(out[1]!.url, hits[1]!.url, 'an uncovered url was rewritten');

  for (let i = 0; i < hits.length; i++) {
    const { url: _a, ...before } = hits[i]!;
    const { url: _b, commissioned: _c, ...after } = out[i]!;
    assert.deepEqual(after, before, `tagging altered a field other than url on hit ${i}`);
  }
});

test('tagging preserves order exactly', () => {
  const hits = Array.from({ length: 12 }, (_, i) => ({ url: `https://infinitediscs.com/p/${i}` }));
  const out = attachAffiliate(hits, ONE);
  assert.deepEqual(
    out.map((h) => new URL(h.url).pathname),
    hits.map((h) => new URL(h.url).pathname),
    'tagging reordered the results'
  );
});

/* ── THE ONE THAT MATTERS: a commission cannot change the ranking ───── */

test('the sort comparator cannot see a commission', () => {
  const c = code(SERVICE);
  const sort = c.slice(c.indexOf('products.sort('));
  const body = sort.slice(0, sort.indexOf('});') + 3);
  assert.ok(body.includes('a.currency !== b.currency'), 'the comparator was not found where expected');
  for (const word of ['commission', 'affiliate', 'Affiliate']) {
    assert.ok(!body.includes(word), `the sort comparator references ${word}`);
  }
});

test('tagging runs after the ranking, not before it', () => {
  // Structural, because this ordering is the whole defence: tagging operates
  // on the array the sort has already finished with.
  const c = code(SERVICE);
  const sortAt = c.indexOf('products.sort(');
  const tagAt = c.indexOf('attachAffiliate(');
  assert.ok(sortAt > 0 && tagAt > 0, 'sort or tagging is missing from the service');
  assert.ok(tagAt > sortAt, 'affiliate tagging happens before the results are ranked');
});

test('the same results rank identically with and without a programme', async () => {
  // The behavioural half. Identical fixtures, two services; the only
  // difference is that one is paid on every one of these retailers.
  const fixtures = {
    'api.search.brave.com': () => ({
      web: {
        results: [
          { url: 'https://dear.example/products/x' },
          { url: 'https://cheap.example/products/x' },
          { url: 'https://mid.example/products/x' },
        ],
      },
    }),
    'dear.example': () => page('30.00'),
    'cheap.example': () => page('10.00'),
    'mid.example': () => page('20.00'),
  };
  function page(price: string) {
    return `<html><head><script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'Buzzz',
      offers: { price, priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
    })}</script></head></html>`;
  }
  const fetchImpl = (async (url: string | URL) => {
    const u = String(url);
    const k = Object.keys(fixtures).find((x) => u.includes(x));
    const body = k ? (fixtures as Record<string, () => string | object>)[k]!() : '';
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return { ok: true, text: async () => text, json: async () => JSON.parse(text) } as unknown as Response;
  }) as unknown as typeof fetch;

  const plain = await createMarketService({ hosts: [], keys: { braveKey: 'k' }, fetchImpl }).search('buzzz');
  const paid = await createMarketService({
    hosts: [],
    keys: { braveKey: 'k' },
    fetchImpl,
    // Paid on the DEAREST shop, specifically: if commission could bend the
    // order, this is the fixture that would reveal it.
    affiliate: 'dear.example|ref|A1, cheap.example|ref|A1, mid.example|ref|A1',
  }).search('buzzz');

  assert.equal(plain.products.length, 3, 'the fixture did not produce three results');
  assert.deepEqual(
    paid.products.map((p) => [p.retailer, p.price]),
    plain.products.map((p) => [p.retailer, p.price]),
    'configuring an affiliate programme changed the ranking'
  );
  assert.equal(paid.cheapest, plain.cheapest, 'the cheapest price moved');
  assert.equal(paid.currency, plain.currency);
  assert.ok(paid.products.every((p) => p.commissioned), 'the paid fixture tagged nothing, so it proved nothing');
  assert.ok(plain.products.every((p) => !p.commissioned), 'the plain fixture was tagged');
});

/* ── the page tells the truth about it ──────────────────────────────── */

test('the Market page discloses the commission, and only when there is one', () => {
  assert.ok(/commissionNote/.test(PAGE), 'the disclosure helper is gone');
  assert.ok(
    /if \(!state\.affiliate\) return '';/.test(PAGE),
    'the disclosure no longer depends on a programme actually being configured'
  );
  assert.ok(/earn us a commission/i.test(PAGE), 'the disclosure no longer says a commission is earned');
  assert.ok(
    /never changes which results you see/i.test(PAGE),
    'the disclosure no longer answers whether being paid bends the results'
  );
  // It has to appear on the results view, where the links actually are.
  const results = PAGE.slice(PAGE.indexOf('function renderResults'), PAGE.indexOf('function deptGrid'));
  assert.ok(results.includes('commissionNote()'), 'the results view does not disclose');
});

test('the service tells the page whether a programme is live', () => {
  const off = createMarketService({ hosts: [], keys: {} }).status();
  assert.equal(off.affiliate, false, 'an unconfigured Market claims an affiliate programme');
  const on = createMarketService({ hosts: [], keys: {}, affiliate: 'a.example|ref|A1' }).status();
  assert.equal(on.affiliate, true, 'a configured Market does not report its programme');
});
