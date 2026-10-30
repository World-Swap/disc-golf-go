// src/modules/market/market.service.ts — the Market is a SEARCH.
//
// You type anything disc golf and it comes back with what it costs and who
// sells it. There is no list of shops in the app and no shop to browse: a
// result names the retailer that sells that item, the way any price search
// does, and tapping it opens that retailer's own page.
//
// Where results come from is a provider slot — see providers.ts, which also
// records the measurement behind that design: every keyless route to a web
// search engine is blocked, disabled, or serves a datacenter IP junk, so a
// real open-web search needs one API key. With a key set, the Market
// searches the web. With none, it falls back to asking storefronts directly,
// which works but can only find what those shops happen to stock.
//
// Rules this file exists to enforce, each with a guard:
//   • Nothing is stored. A cached price is one we would show wrongly later.
//   • Prices in different currencies are never compared, so "from $X" is
//     only claimed when every result shares a currency.
//   • A provider that fails is reported, never silently dropped.
//   • We are not the shop: every result leaves to the retailer.
//   • A COMMISSION CANNOT CHANGE THE RANKING. Affiliate tagging happens in
//     affiliate.ts, applied to the array AFTER the sort below has finished,
//     so the comparator cannot see it. See that file for the rest.

import { STOREFRONT_HOSTS } from './retailers';
import { attachAffiliate, parsePrograms, type AffiliateProgram } from './affiliate';
import { parseOurStore, isOurs, OUR_STORE_LABEL } from './our-store';
import {
  serpApiShopping,
  braveWeb,
  googleCse,
  storefronts,
  type Fetcher,
  type ProductHit,
  type SearchProvider,
} from './providers';

export const CACHE_TTL_MS = 5 * 60_000;
export const MAX_QUERY_LEN = 80;
export const DEFAULT_LIMIT = 60;

/**
 * Disc golf is the whole point of the app, but "buzzz" alone on the open web
 * finds a bee and "destroyer" finds a warship. Every engine query therefore
 * carries the sport unless the player already said it.
 */
export function shapeQuery(raw: string): string {
  const q = raw.trim();
  return /disc\s*golf|\bdisc\b|\bputter\b|\bdriver\b|\bmidrange\b/i.test(q) ? q : `${q} disc golf`;
}

/** A result as served: the hit, plus whether its link earns a commission. */
export type MarketProduct = ProductHit & { commissioned: boolean };

export type MarketSearch = {
  query: string;
  products: MarketProduct[];
  /** Which providers ran, so the page can say where this came from. */
  sources: Array<{ key: string; label: string; ok: boolean; count: number; error?: string }>;
  cheapest: number | null;
  currency: string | null;
  /** True when the results are not all in `currency`, so copy must not imply it. */
  mixedCurrency: boolean;
  /** True when no search key is set, so the page can say the reach is narrow. */
  fallbackOnly: boolean;
  /**
   * Our own storefront, when configured, so the page can label the listings
   * that are ours. Null means we sell nothing here and no listing is ours.
   */
  ourStore: { host: string; label: string } | null;
  fetchedAt: string;
  cached: boolean;
};

export type MarketKeys = {
  serpApiKey?: string | undefined;
  braveKey?: string | undefined;
  googleKey?: string | undefined;
  googleCx?: string | undefined;
};

export type MarketDeps = {
  fetchImpl?: Fetcher;
  now?: () => number;
  keys?: MarketKeys;
  hosts?: readonly string[];
  /** Raw MARKET_AFFILIATE setting; absent means no programme, which is a no-op. */
  affiliate?: string | undefined;
  /**
   * Raw STORE_SHOPIFY_HOST setting -- our own Shopify storefront. Absent means
   * we sell nothing in the Market, which is a complete no-op. Injected rather
   * than read from process.env at import time, which is the bug REWARDS_ENABLED
   * already had: an import-time read passes in isolation and fails in the full
   * suite, because imports are hoisted above any test that sets the variable.
   */
  ourStore?: string | undefined;
};

/** Two results are the same listing when the same shop sells the same thing. */
function dedupeKey(h: ProductHit): string {
  let path = h.url;
  try {
    const u = new URL(h.url);
    path = u.host.replace(/^www\./, '') + u.pathname.replace(/\/$/, '');
  } catch {
    /* fall back to the raw url */
  }
  return path.toLowerCase();
}

export function createMarketService(deps: MarketDeps = {}) {
  const f: Fetcher = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const keys = deps.keys ?? {};
  // Our own storefront is one more shop in the fan-out and nothing else: the
  // keyless Shopify adapter already knows how to ask it (PLATFORM_BY_HOST
  // defaults to shopify, and its /meta.json supplies the real currency), so
  // selling our own merchandise needed no new adapter. It is appended rather
  // than committed to STOREFRONTS because the domain is configured -- and
  // de-duplicated, so naming it in both places cannot double-ask it.
  const ourHost = parseOurStore(deps.ourStore);
  const baseHosts = deps.hosts ?? STOREFRONT_HOSTS;
  const hosts =
    ourHost && !baseHosts.some((h) => h.toLowerCase().replace(/^www\./, '') === ourHost)
      ? [...baseHosts, ourHost]
      : baseHosts;
  const cache = new Map<string, { at: number; value: MarketSearch }>();
  // Parsed once at construction: a malformed entry should be warned about at
  // boot, not on every search.
  const programs: AffiliateProgram[] = parsePrograms(deps.affiliate);

  // Order matters: the first configured engine is preferred, because one
  // Google Shopping call already carries prices and retailers, where a web
  // search costs a page fetch per result.
  const engines: SearchProvider[] = [
    serpApiShopping(f, keys.serpApiKey),
    googleCse(f, keys.googleKey, keys.googleCx),
    braveWeb(f, keys.braveKey),
  ];
  const fallback = storefronts(f, hosts);

  /** The engines that are actually usable right now. */
  function live(): SearchProvider[] {
    return engines.filter((e) => e.configured);
  }

  return {
    /** What the page needs to describe itself honestly before any search. */
    status() {
      const configured = live();
      return {
        engines: engines.map((e) => ({ key: e.key, label: e.label, configured: e.configured })),
        // Named so the UI can say "searching the web" or admit it cannot.
        webSearch: configured.length > 0,
        shopCount: hosts.length,
        // So the page can disclose the commission when, and only when, there
        // is one to disclose.
        affiliate: programs.length > 0,
        // Our own storefront, when there is one. The page shows the Store
        // entry and the "sold by us" label from this and nothing else, so with
        // no store configured neither can appear.
        ourStore: ourHost ? { host: ourHost, label: OUR_STORE_LABEL } : null,
      };
    },

    async search(rawQuery: string, limit = DEFAULT_LIMIT): Promise<MarketSearch> {
      const q = String(rawQuery ?? '').trim().slice(0, MAX_QUERY_LEN);
      const empty: MarketSearch = {
        query: '',
        products: [],
        sources: [],
        ourStore: ourHost ? { host: ourHost, label: OUR_STORE_LABEL } : null,
        cheapest: null,
        currency: null,
        mixedCurrency: false,
        fallbackOnly: live().length === 0,
        fetchedAt: new Date(now()).toISOString(),
        cached: false,
      };
      if (!q) return empty;

      const key = q.toLowerCase();
      const hit = cache.get(key);
      if (hit && now() - hit.at < CACHE_TTL_MS) return { ...hit.value, cached: true };

      const chosen = live();
      // The storefront fallback also runs ALONGSIDE a configured engine: it
      // reaches shops an engine may rank below the fold, and it is the only
      // source that reports real stock. It is additive, never a replacement.
      const running: SearchProvider[] = [...chosen, fallback].filter((p) => p.configured);

      const shaped = shapeQuery(q);
      const settled = await Promise.allSettled(
        running.map((p) => p.search(p.key === 'storefronts' ? q : shaped, limit))
      );

      const sources: MarketSearch['sources'] = [];
      const all: ProductHit[] = [];
      running.forEach((p, i) => {
        const r = settled[i]!;
        if (r.status === 'fulfilled') {
          sources.push({ key: p.key, label: p.label, ok: true, count: r.value.length });
          all.push(...r.value);
        } else {
          const m = r.reason instanceof Error ? r.reason.message : 'failed';
          sources.push({
            key: p.key,
            label: p.label,
            ok: false,
            count: 0,
            error: m.includes('abort') ? 'timed out' : m,
          });
        }
      });

      // A price of zero is not a cheap price, it is a price the shop never
      // published -- WooCommerce returns "0" for a call-for-price or an
      // unpriced variable product, and a real one ("DGA Basket Icon Pin")
      // became the headline "from $0" on a basket search the moment the
      // headline started showing on mixed-currency results. The Market's
      // promise is to say what something costs, so a listing whose cost we do
      // not know does not belong in it -- the same rule extract.ts already
      // applies to a page with no price markup.
      //
      // Filtered HERE rather than in each adapter because this is the one
      // place every provider's results funnel through, so a provider added
      // later cannot reintroduce it.
      const pricedRaw = all.filter((h) => Number.isFinite(h.price) && h.price > 0);

      // Mark our own listings, by host, in the one place every provider's
      // results funnel through -- so a provider added later cannot ship an
      // unlabelled listing of ours, and a provider cannot claim to be us.
      //
      // This is set BEFORE the sort and deliberately not read BY the sort: the
      // comparator below is currency -> in-stock -> price and a guard asserts
      // it never references `ours`. Our own shop competing on price inside our
      // own comparison, and losing when it is dearer, is the whole point.
      const priced = ourHost
        ? pricedRaw.map((h) => (isOurs(h.url, ourHost) ? { ...h, ours: true } : h))
        : pricedRaw;

      // One listing, once — an engine and a storefront can both return it.
      const byKey = new Map<string, ProductHit>();
      for (const h of priced) {
        const k = dedupeKey(h);
        const prev = byKey.get(k);
        // Prefer the entry that knows the stock state; otherwise the cheaper.
        if (!prev || (prev.available === null && h.available !== null) || h.price < prev.price) {
          byKey.set(k, h);
        }
      }
      const products = [...byKey.values()];

      // OUR OWN STOCK FIRST, then everyone else by price.
      //
      // Owner's call, 2026-10-30, reversing the launch behaviour. The reasoning
      // is sound and worth keeping so it is not re-litigated: we are in no
      // affiliate programme, have no agreement with any retailer here and take
      // no payment from any of them, so there is no obligation to give a rival
      // equal billing inside our own app. A shop showing its own stock first is
      // ordinary commerce.
      //
      // What this costs is the right to call the Market a neutral price
      // comparison, and that price is paid in the COPY rather than hidden:
      // the page says our store comes first, every listing of ours is badged
      // Ours, and real prices are shown throughout -- so a cheaper rival is
      // visible on the very next row rather than suppressed. Ordering our own
      // stock first is a declared editorial choice; misreporting a price would
      // be a lie, and nothing here touches a price.
      //
      // THE RULE THAT SURVIVES UNCHANGED, and the distinction that matters:
      // a THIRD PARTY still cannot buy position. Among everyone who is not us
      // the order is exactly what it always was -- currency, then in-stock,
      // then price -- and affiliate.ts still tags only after this sort has
      // run, so a commission cannot move a single row. Ours first is a choice
      // we declare; a retailer paying to jump the queue would be one we hide.
      // affiliate.ts's guards are untouched and still prove it.
      products.sort((a, b) => {
        // Declared, not discovered. See the copy in web/market.html.
        if (Boolean(a.ours) !== Boolean(b.ours)) return a.ours ? -1 : 1;
        if (a.currency !== b.currency) return a.currency.localeCompare(b.currency);
        const aOut = a.available === false;
        const bOut = b.available === false;
        if (aOut !== bOut) return aOut ? 1 : -1;
        return a.price - b.price;
      });

      // "From $X" within ONE currency, never across two.
      //
      // This used to refuse outright whenever the result set held more than
      // one currency, which sounds safe and is actually just unhelpful: one
      // GBP shop in the list suppressed the headline on most real searches
      // (measured: 3 of 5 common queries), and it gets worse with every shop
      // added, so coverage would have quietly cost the price a player came for.
      //
      // The rule it was standing in for is that a price and a currency must
      // never be mismatched -- so pick the currency the result set is mostly
      // in, and report the minimum WITHIN it. The pair is then always
      // internally consistent, and `mixedCurrency` tells the page the set is
      // not all in that currency so it cannot imply otherwise. No conversion
      // happens anywhere: we hold no exchange rate and inventing one would be
      // the actual sin here.
      const inStock = products.filter((p) => p.available !== false);
      const byCurrency = new Map<string, number[]>();
      for (const p of inStock) {
        const list = byCurrency.get(p.currency);
        if (list) list.push(p.price);
        else byCurrency.set(p.currency, [p.price]);
      }
      // Most results wins; ties break on the code so the answer is stable for
      // the same input rather than depending on Map insertion order.
      const ranked = [...byCurrency.entries()].sort(
        (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])
      );
      const lead = ranked[0] ?? null;

      const value: MarketSearch = {
        query: q,
        // LAST step, deliberately: `products` is already ranked and the
        // cheapest price already read off it, so tagging cannot influence
        // either. Only `url` changes.
        products: attachAffiliate(products, programs),
        sources,
        cheapest: lead ? Math.min(...lead[1]) : null,
        currency: lead ? lead[0] : null,
        mixedCurrency: new Set(products.map((p) => p.currency)).size > 1,
        fallbackOnly: chosen.length === 0,
        ourStore: ourHost ? { host: ourHost, label: OUR_STORE_LABEL } : null,
        fetchedAt: new Date(now()).toISOString(),
        cached: false,
      };
      cache.set(key, { at: now(), value });
      return value;
    },
  };
}

export type MarketService = ReturnType<typeof createMarketService>;
