#!/usr/bin/env node
// scripts/market-check.js — does a storefront still answer in the shape the
// Market's no-key fallback needs?
//
// `retailers.ts` has promised this script by name since the Market shipped and
// it did not exist, which is the same defect this repo keeps recording: a
// comment pointing at a thing that is not there.
//
// What it checks, per host:
//   * /meta.json           — the shop's own name and currency. The Market reads
//                            currency from here rather than the hand-typed
//                            fallback, because an assumed USD prints GBP prices
//                            as dollars and claims the wrong cheapest.
//   * /search/suggest.json — the public product search the fallback uses: does
//                            it answer, in that shape, with prices?
//
// Usage:
//   npm run market:check                        every configured storefront
//   node scripts/market-check.js --hosts a.com,b.com   evaluate candidates
//   node scripts/market-check.js --query buzzz,bag     probe other queries
//   node scripts/market-check.js --brands             per-brand coverage report
//
// Exits non-zero when a CONFIGURED host fails, so it is worth running. A
// candidate passed with --hosts is only reported on: deciding to add one is a
// judgement about what it stocks, not something a probe can make.

// The list lives in TypeScript because the server uses it; a second copy here
// is how the first one would come to be wrong.
require('ts-node/register/transpile-only');
const { STOREFRONTS, PLATFORM_BY_HOST, CURRENCY_BY_HOST: CURRENCY_FALLBACK } = require('../src/modules/market/retailers');

const UA = 'DiscGolfGo/1.0 (+https://discgolfgo.com)';
// Five at a time with one retry, which is what the Market itself uses: all
// sixteen at once made three shops report 503 that were NOT down -- it was our
// own burst against one Shopify edge, displayed as their outage.
const CONCURRENCY = 5;
const RETRY_STATUS = new Set([429, 502, 503, 504]);
const TIMEOUT_MS = 10_000;

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function get(url, attempt = 0) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'application/json', 'accept-language': 'en-US,en;q=0.9' },
    });
    if (!res.ok) {
      // A 404 or 403 will not come right on a second try; a 503 often will,
      // because it is frequently us rather than them.
      if (RETRY_STATUS.has(res.status) && attempt === 0) {
        await new Promise((r) => setTimeout(r, 700));
        return get(url, 1);
      }
      return { ok: false, status: res.status };
    }
    const text = await res.text();
    try {
      return { ok: true, body: JSON.parse(text) };
    } catch {
      return { ok: false, status: res.status, error: 'not JSON' };
    }
  } catch (e) {
    const msg = e && e.name === 'AbortError' ? 'timed out' : (e && e.message) || 'failed';
    if (attempt === 0 && msg !== 'timed out') {
      await new Promise((r) => setTimeout(r, 700));
      return get(url, 1);
    }
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

async function probe(host, queries, platformHint) {
  // A configured host states its platform; a candidate is tried both ways,
  // because which one it is is exactly what we are probing for.
  const platform = platformHint || PLATFORM_BY_HOST.get(host) || null;
  const out = { host, platform, meta: null, currency: null, name: null, queries: {}, ok: false, notes: [] };

  const meta = platform === 'woocommerce' ? { ok: false, status: 'n/a' } : await get(`https://${host}/meta.json`);
  if (meta.ok && meta.body && typeof meta.body === 'object') {
    out.meta = true;
    if (typeof meta.body.currency === 'string' && /^[A-Z]{3}$/.test(meta.body.currency)) out.currency = meta.body.currency;
    if (typeof meta.body.name === 'string') out.name = meta.body.name;
  } else {
    out.meta = false;
    out.metaWhy = `meta.json ${meta.status || meta.error}`;
  }

  // Each platform's public search, in the shape the Market actually reads.
  // No shell here, so the `[` in resources[type] needs no escaping -- that
  // bracket silently globbed under curl and made every host look dead.
  const endpoints = {
    shopify: (h, q) =>
      `https://${h}/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product&resources[limit]=10`,
    woocommerce: (h, q) => `https://${h}/wp-json/wc/store/v1/products?search=${encodeURIComponent(q)}&per_page=10`,
  };
  const tryPlatforms = platform ? [platform] : ['shopify', 'woocommerce'];

  for (const q of queries) {
    let got = null;
    for (const plat of tryPlatforms) {
      const r = await get(endpoints[plat](host, q));
      if (!r.ok) {
        got = got || { ok: false, note: String(r.status || r.error) };
        continue;
      }
      if (plat === 'shopify') {
        const products = r.body && r.body.resources && r.body.resources.results && r.body.resources.results.products;
        if (!Array.isArray(products)) { got = got || { ok: false, note: 'no products array' }; continue; }
        const priced = products.filter((x) => x && (x.price != null || x.price_min != null));
        got = { ok: true, platform: plat, priced: priced.length,
                sample: priced[0] ? String(priced[0].title || '').slice(0, 44) : null };
      } else {
        const rows = Array.isArray(r.body) ? r.body : null;
        if (!rows) { got = got || { ok: false, note: 'not a product array' }; continue; }
        const priced = rows.filter((x) => x && x.prices && x.prices.price != null);
        got = { ok: true, platform: plat, priced: priced.length,
                sample: priced[0] ? String(priced[0].name || '').slice(0, 44) : null };
      }
      if (!out.platform) out.platform = plat;
      break;
    }
    out.queries[q] = got || { ok: false, note: 'no endpoint answered' };
  }

  const answered = Object.values(out.queries).filter((q) => q.ok);
  // USABLE means the SEARCH works. meta.json is a bonus, not a requirement:
  // market.service.ts catches a failed meta read and falls back to the
  // currency listed in retailers.ts. Requiring it here was measuring something
  // stricter than the service does, and would have rejected a working shop.
  out.ok = answered.length > 0;
  // A Shopify shop with no meta.json cannot have its currency read live, so
  // the hand-typed fallback is the only thing standing between a GBP price
  // and a dollar sign. WooCommerce carries the code per product, so it is
  // never exposed to that.
  if (out.ok && out.meta !== true && out.platform !== 'woocommerce') {
    out.notes.push('no meta.json -- currency MUST be correct in retailers.ts, it cannot be read live');
  }
  out.found = answered.reduce((n, q) => n + q.priced, 0);
  return out;
}

async function pooled(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

(async () => {
  const hostArg = arg('hosts');
  const configured = !hostArg;
  const hosts = hostArg
    ? hostArg.split(',').map((h) => h.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean)
    : STOREFRONTS.map((s) => s.host);

  // Two default queries that say different things: a Discraft mould no
  // manufacturer store stocks, and a generic any-shop term. A shop that
  // answers the second and not the first is single-brand, which is the fact
  // that actually decides how much a search finds.
  const queries = (arg('query') || 'buzzz,disc').split(',').map((q) => q.trim()).filter(Boolean);

  console.log(`Probing ${hosts.length} host(s) with [${queries.join(', ')}] at ${CONCURRENCY} concurrent\n`);
  const results = await pooled(hosts, CONCURRENCY, (h) => probe(h, queries));
  for (const r of results) if (r.ok && !r.currency && r.platform !== 'woocommerce') r.currency = CURRENCY_FALLBACK.get(r.host) || null;

  const pad = Math.max(...hosts.map((h) => h.length));
  let failed = 0;
  for (const r of results) {
    const head = r.ok ? 'ok  ' : 'FAIL';
    if (!r.ok) failed++;
    const cur = r.currency || '???';
    const counts = queries.map((q) => {
      const s = r.queries[q];
      return `${q}=${s && s.ok ? s.priced : 'x'}`;
    }).join(' ');
    const plat = (r.platform || '?').slice(0, 4);
    console.log(`${head} ${r.host.padEnd(pad)}  ${plat.padEnd(4)}  ${cur}  ${counts}${r.name ? '  ' + r.name : ''}`);
    if (!r.ok && r.metaWhy) console.log(`       ${r.metaWhy}`);
    for (const n of r.notes) console.log(`       ${n}`);
  }

  const good = results.filter((r) => r.ok);
  console.log(`\n${good.length}/${results.length} answered.`);

  const nonUsd = good.filter((r) => r.currency && r.currency !== 'USD');
  if (nonUsd.length) {
    console.log(`Non-USD: ${nonUsd.map((r) => `${r.host} (${r.currency})`).join(', ')}`);
    console.log('  Those are never price-compared against USD -- market.service.ts sorts by currency first.');
  }

  // The fallback's real limit is the SHOP MIX, not the shop count: a
  // single-brand manufacturer store cannot stock another maker's mould, so it
  // contributes nothing to most searches.
  const brandQ = queries[0];
  if (brandQ) {
    const blind = good.filter((r) => r.queries[brandQ] && r.queries[brandQ].ok && r.queries[brandQ].priced === 0);
    if (blind.length) {
      console.log(
        `\n${blind.length}/${good.length} answered but found NOTHING for "${brandQ}" ` +
          '(single-brand stores):\n  ' + blind.map((r) => r.host).join(', ')
      );
    }
  }

  if (configured) {
    for (const s of STOREFRONTS) {
      const r = results.find((x) => x.host === s.host);
      if (r && r.currency && r.currency !== s.currency) {
        console.log(`\nNOTE ${s.host}: retailers.ts says ${s.currency}, the shop says ${r.currency}.`);
        console.log('  Harmless at runtime (the shop wins) but the fallback is wrong; fix the file.');
      }
    }
  }

  if (configured && failed) {
    console.error(`\n${failed} configured storefront(s) failed.`);
    process.exit(1);
  }
})();
