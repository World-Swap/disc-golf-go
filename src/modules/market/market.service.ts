// src/modules/market/market.service.ts — the live Market.
//
// What this is: one search across every shop in retailers.ts, answered from
// each shop's OWN storefront at the moment you ask. Price and stock are read
// live; nothing about a product is stored, because a price we cached is a
// price we would eventually show wrongly, and a wrong price on a page that
// looks like a marketplace is a promise we cannot keep.
//
// What this is NOT, and the page says so plainly: we are not a shop. We take
// no payment, hold no stock and set no prices. Every result links out to the
// retailer, who owns the sale. That is also why there is no basket here.
//
// Three rules the shape of this file exists to enforce:
//
//   1. ONE SLOW SHOP MUST NEVER COST THE SEARCH. Every request is raced
//      against its own AbortController, the fan-out is allSettled, and a shop
//      that times out is reported as unreachable beside the results rather
//      than failing the page or silently vanishing. A marketplace that shows
//      9 of 11 shops and says which two are down is honest; one that quietly
//      shows 9 looks complete and is not.
//
//   2. PRICES IN DIFFERENT CURRENCIES ARE NEVER COMPARED. Every shop on the
//      list answers in USD today, which is exactly when this is easy to get
//      wrong and never notice. `cheapest` is therefore only computed when the
//      whole result set shares one currency, and the sort orders by currency
//      first so two currencies interleave by code rather than by a number
//      that means different things in each.
//
//   3. WE READ THE SHOP'S OWN NAME AND CURRENCY. Both come from each shop's
//      /meta.json, not from the hand-typed fallback in retailers.ts -- the
//      same rule the video feed follows for channel names, learned when a
//      hand-maintained label drifted from the thing it labelled.

import { RETAILERS, RETAILER_BY_KEY, type Retailer } from './retailers';

/** How long one shop gets before we give up on it and say so. */
export const SHOP_TIMEOUT_MS = 6_000;
/**
 * How many shops we have in flight at once.
 *
 * Measured, not guessed. Firing all eleven together answered in ~450ms but
 * came back with three shops reporting HTTP 503 -- and they were not down:
 * every one of them answers fine on its own a second later. These are eleven
 * different hostnames but one Shopify edge, which throttles by caller, so a
 * burst of eleven is us rate-limiting ourselves and then displaying the
 * result as the shop's outage. The same mistake the article-preview fetcher
 * made against udisc.com. At five, the full fan-out answers in ~900ms with
 * every shop green, which is the right trade: half a second against three
 * shops missing from a page whose whole promise is comparing shops.
 */
export const FAN_OUT_LIMIT = 5;
/** One retry for a throttle or a blip; see shouldRetry. */
export const RETRY_DELAY_MS = 400;
/** How long a search result is reused. Live, but not a request per keystroke. */
export const CACHE_TTL_MS = 5 * 60_000;
/** Shopify caps its own suggest endpoint well below this; it is a sanity bound. */
export const MAX_PER_SHOP = 10;
/** A query longer than this is not a product search. */
export const MAX_QUERY_LEN = 80;

const USER_AGENT = 'DiscGolfGo/1.0 (+https://discgolfgo.com)';

export type MarketProduct = {
  id: string;
  title: string;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  compareAt: number | null;
  currency: string;
  available: boolean;
  image: string | null;
  url: string;
  vendor: string | null;
  productType: string | null;
  retailerKey: string;
  retailerName: string;
};

export type ShopReport = {
  key: string;
  name: string;
  kind: Retailer['kind'];
  country: string;
  currency: string;
  ok: boolean;
  count: number;
  ms: number;
  /** Set only when ok is false, so the page can say what went wrong. */
  error?: string;
};

export type MarketSearch = {
  query: string;
  products: MarketProduct[];
  shops: ShopReport[];
  /** Null when the results span more than one currency -- see rule 2. */
  cheapest: number | null;
  currency: string | null;
  inStock: number;
  fetchedAt: string;
  cached: boolean;
};

/** A shop's live identity, re-read from its own storefront. */
type ShopMeta = { name: string; currency: string };

type Fetcher = typeof fetch;

export type MarketServiceDeps = {
  /** Injected so tests drive the fan-out without touching the network. */
  fetchImpl?: Fetcher;
  now?: () => number;
};

/**
 * Shopify prices arrive as strings ("16.99", "0.00"). Parse to a number, and
 * treat a non-numeric or negative value as absent rather than as zero -- a
 * product listed at $0 is a parse failure, not a free disc.
 */
export function parsePrice(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null;
  if (typeof raw !== 'string') return null;
  const n = Number(raw.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Shopify's suggest endpoint returns a ROOT-RELATIVE url with its own tracking
 * query attached. Make it absolute against the shop, and drop the tracking
 * params: they describe our search session, and forwarding them to the shop in
 * a link the player taps tells them nothing useful and looks like we are
 * tagging the click.
 */
export function productUrl(host: string, raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const u = new URL(raw, `https://${host}`);
    // Only ever point at the shop we asked; a url that redirects elsewhere is
    // not a product on that shop.
    if (u.host !== host) return null;
    for (const p of [...u.searchParams.keys()]) if (p.startsWith('_')) u.searchParams.delete(p);
    return u.toString();
  } catch {
    return null;
  }
}

/** Normalise one Shopify product into our shape; null if it is unusable. */
export function normalise(raw: any, shop: Retailer, currency: string, name: string): MarketProduct | null {
  if (!raw || typeof raw !== 'object') return null;
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const url = productUrl(shop.host, raw.url);
  if (!title || !url) return null;
  const price = parsePrice(raw.price ?? raw.price_min);
  const compare = parsePrice(raw.compare_at_price_min ?? raw.compare_at_price);
  const image =
    (raw.featured_image && typeof raw.featured_image.url === 'string' && raw.featured_image.url) ||
    (typeof raw.image === 'string' ? raw.image : null) ||
    null;
  return {
    id: `${shop.key}:${raw.id ?? raw.handle ?? title}`,
    title,
    price,
    priceMin: parsePrice(raw.price_min) ?? price,
    priceMax: parsePrice(raw.price_max) ?? price,
    // A compare-at at or below the price is not a discount, it is Shopify's
    // empty default; showing it would invent a sale that is not happening.
    compareAt: compare !== null && price !== null && compare > price ? compare : null,
    currency,
    available: raw.available === true,
    image,
    url,
    vendor: typeof raw.vendor === 'string' && raw.vendor ? raw.vendor : null,
    productType: typeof raw.type === 'string' && raw.type ? raw.type : null,
    retailerKey: shop.key,
    retailerName: name,
  };
}

export function createMarketService(deps: MarketServiceDeps = {}) {
  const doFetch: Fetcher = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;

  const meta = new Map<string, ShopMeta>();
  const cache = new Map<string, { at: number; value: MarketSearch }>();

  /**
   * 429 and 503 are what a throttle looks like, and 502/504 are a blip at the
   * edge. All of them come right on a retry; a 404 or a 403 will not, so
   * retrying those would only make a shop that is genuinely refusing us take
   * twice as long to say so.
   */
  function shouldRetry(status: number): boolean {
    return status === 429 || status === 502 || status === 503 || status === 504;
  }

  async function once(url: string, timeoutMs: number): Promise<any> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await doFetch(url, {
        signal: ctl.signal,
        redirect: 'follow',
        headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function getJson(url: string, timeoutMs: number): Promise<any> {
    try {
      return await once(url, timeoutMs);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === undefined || !shouldRetry(status)) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      return once(url, timeoutMs);
    }
  }

  /**
   * The shop's own name and currency. Cached for the process lifetime: it is
   * identity, not inventory, and a shop does not rename itself mid-session.
   * On failure we fall back to retailers.ts rather than dropping the shop --
   * not knowing a shop's display name is no reason to hide its products.
   */
  async function shopMeta(shop: Retailer): Promise<ShopMeta> {
    const hit = meta.get(shop.key);
    if (hit) return hit;
    let value: ShopMeta = { name: shop.name, currency: shop.currency };
    try {
      const m = await getJson(`https://${shop.host}/meta.json`, SHOP_TIMEOUT_MS);
      value = {
        name: typeof m?.name === 'string' && m.name ? m.name : shop.name,
        currency: typeof m?.currency === 'string' && m.currency ? m.currency : shop.currency,
      };
    } catch {
      /* fallback above */
    }
    meta.set(shop.key, value);
    return value;
  }

  async function searchShop(shop: Retailer, q: string): Promise<{ report: ShopReport; products: MarketProduct[] }> {
    const started = now();
    const { name, currency } = await shopMeta(shop);
    const base: Omit<ShopReport, 'ok' | 'count' | 'ms'> = {
      key: shop.key,
      name,
      kind: shop.kind,
      country: shop.country,
      currency,
    };
    try {
      const url =
        `https://${shop.host}/search/suggest.json` +
        `?q=${encodeURIComponent(q)}` +
        `&resources[type]=product&resources[limit]=${MAX_PER_SHOP}`;
      const body = await getJson(url, SHOP_TIMEOUT_MS);
      const raw = body?.resources?.results?.products;
      if (!Array.isArray(raw)) throw new Error('unexpected shape');
      const products = raw
        .map((p: unknown) => normalise(p, shop, currency, name))
        .filter((p): p is MarketProduct => p !== null);
      return { report: { ...base, ok: true, count: products.length, ms: now() - started }, products };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed';
      return {
        report: {
          ...base,
          ok: false,
          count: 0,
          ms: now() - started,
          // An abort is a timeout from the player's point of view; saying
          // "aborted" would describe our code rather than their experience.
          error: message === 'The operation was aborted.' || message.includes('abort') ? 'timed out' : message,
        },
        products: [],
      };
    }
  }

  /** Run tasks with a ceiling on how many are in flight at once. */
  async function pooled<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
    const out: T[] = new Array(tasks.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= tasks.length) return;
        out[i] = await tasks[i]!();
      }
    });
    await Promise.all(workers);
    return out;
  }

  return {
    /** The shops we search, for the filter row and the "who is this" question. */
    async shops(): Promise<Array<Omit<ShopReport, 'ok' | 'count' | 'ms'>>> {
      return Promise.all(
        RETAILERS.map(async (r) => {
          const { name, currency } = await shopMeta(r);
          return { key: r.key, name, kind: r.kind, country: r.country, currency };
        })
      );
    },

    async search(rawQuery: string, opts: { retailer?: string } = {}): Promise<MarketSearch> {
      const q = String(rawQuery ?? '').trim().slice(0, MAX_QUERY_LEN);
      if (!q) {
        return {
          query: '',
          products: [],
          shops: [],
          cheapest: null,
          currency: null,
          inStock: 0,
          fetchedAt: new Date(now()).toISOString(),
          cached: false,
        };
      }

      const only = opts.retailer ? RETAILER_BY_KEY.get(opts.retailer) : undefined;
      // An unknown retailer key searches everything rather than nothing: a
      // stale filter link should still return a usable page.
      const shops = only ? [only] : [...RETAILERS];

      const key = `${only?.key ?? '*'}::${q.toLowerCase()}`;
      const hit = cache.get(key);
      if (hit && now() - hit.at < CACHE_TTL_MS) return { ...hit.value, cached: true };

      const settled = await pooled(
        shops.map((s) => () => searchShop(s, q)),
        FAN_OUT_LIMIT
      );

      const products = settled.flatMap((s) => s.products);
      const reports = settled.map((s) => s.report);

      // Rule 2: order within a currency, never across one. With a single
      // currency -- which is every shop on the list today -- this is just a
      // price sort; the branch exists so adding a non-USD shop cannot
      // silently start comparing kronor against dollars.
      products.sort((a, b) => {
        if (a.currency !== b.currency) return a.currency.localeCompare(b.currency);
        if (a.available !== b.available) return a.available ? -1 : 1;
        if (a.price === null) return 1;
        if (b.price === null) return -1;
        return a.price - b.price;
      });

      const currencies = new Set(products.map((p) => p.currency));
      const single = currencies.size === 1 ? [...currencies][0]! : null;
      const priced = products.filter((p) => p.available && p.price !== null).map((p) => p.price!);

      const value: MarketSearch = {
        query: q,
        products,
        shops: reports,
        cheapest: single && priced.length ? Math.min(...priced) : null,
        currency: single,
        inStock: products.filter((p) => p.available).length,
        fetchedAt: new Date(now()).toISOString(),
        cached: false,
      };
      cache.set(key, { at: now(), value });
      return value;
    },
  };
}

export type MarketService = ReturnType<typeof createMarketService>;
