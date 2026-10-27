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
  const hosts = deps.hosts ?? STOREFRONT_HOSTS;
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
      };
    },

    async search(rawQuery: string, limit = DEFAULT_LIMIT): Promise<MarketSearch> {
      const q = String(rawQuery ?? '').trim().slice(0, MAX_QUERY_LEN);
      const empty: MarketSearch = {
        query: '',
        products: [],
        sources: [],
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
      const priced = all.filter((h) => Number.isFinite(h.price) && h.price > 0);

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

      // Currency first, then in-stock, then price: the branch exists so that
      // adding a non-USD source cannot start comparing kronor with dollars.
      products.sort((a, b) => {
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
        fetchedAt: new Date(now()).toISOString(),
        cached: false,
      };
      cache.set(key, { at: now(), value });
      return value;
    },
  };
}

export type MarketService = ReturnType<typeof createMarketService>;
