// src/modules/market/providers.ts — where the Market's results come from.
//
// THE FINDING THAT SHAPES THIS FILE. The Market is meant to search the open
// web for anything disc golf and come back with prices from whichever
// retailers sell it. That needs a search engine. Every keyless route to one
// was tried from a server and none of them works:
//
//   • DuckDuckGo's HTML endpoint   — blocks datacenter IPs outright.
//   • SearXNG public instances     — JSON output disabled on all 12 tried.
//   • Bing HTML                    — answers, but serves a datacenter IP
//     generic junk: "buy discraft buzzz" came back with Best Buy, Zillow and
//     a dictionary entry, and three different queries returned the IDENTICAL
//     ten links. Worse than nothing, because it looks like it is working.
//   • Bing Shopping                — rendered in the browser; the HTML a
//     server receives carries no prices at all.
//   • Google / Ecosia / Mojeek     — refuse without a key.
//
// So a real search needs an API key, and the honest design is to make the
// provider a slot rather than to pretend otherwise. Set one key and the
// Market searches the web properly; set none and it falls back to asking a
// set of storefronts directly, which works but is narrow.
//
// Apple is not in the list because Apple does not sell search: there is no
// Apple web-search API to call. Spotlight suggestions are not a product
// search and would be dishonest to present as one.

import { extractPrice, looksLikeProduct, toNumber } from './extract';
import { CURRENCY_BY_HOST, PLATFORM_BY_HOST } from './retailers';

export type ProductHit = {
  title: string;
  price: number;
  currency: string;
  /** The shop selling it, as the shop or the engine names it. */
  retailer: string;
  url: string;
  image: string | null;
  available: boolean | null;
  /** Which provider produced this, shown nowhere but useful in the API. */
  via: string;
};

export type ProviderResult = {
  key: string;
  label: string;
  ok: boolean;
  hits: ProductHit[];
  error?: string;
};

export interface SearchProvider {
  readonly key: string;
  readonly label: string;
  /** False when its key is absent; the service then skips it silently. */
  readonly configured: boolean;
  search(query: string, limit: number): Promise<ProductHit[]>;
}

export type Fetcher = typeof fetch;

const UA = 'DiscGolfGo/1.0 (+https://discgolfgo.com)';
export const PAGE_TIMEOUT_MS = 8_000;
export const SEARCH_TIMEOUT_MS = 10_000;

async function getText(f: Fetcher, url: string, timeoutMs: number, headers: Record<string, string> = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await f(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9', ...headers },
    });
    if (!res.ok) {
      const e = new Error(`HTTP ${res.status}`) as Error & { status?: number };
      e.status = res.status;
      throw e;
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(f: Fetcher, url: string, timeoutMs: number, headers: Record<string, string> = {}) {
  return JSON.parse(await getText(f, url, timeoutMs, { accept: 'application/json', ...headers }));
}

/** A readable retailer label from a full url OR a bare hostname. */
function hostLabel(urlOrHost: string): string {
  // Takes both, because the storefront provider holds bare hosts while the
  // engine providers hold full urls -- passing a bare host to `new URL` throws,
  // which is how every storefront result came to be labelled "shop".
  let host = urlOrHost;
  try {
    host = new URL(urlOrHost).host;
  } catch {
    host = urlOrHost.replace(/^https?:\/\//, '').split('/')[0] ?? urlOrHost;
  }
  return host.replace(/^www\./, '').replace(/^store\./, '') || 'shop';
}

/**
 * Decode the HTML entities a storefront puts in a product name.
 *
 * WooCommerce serves names entity-encoded -- a real one is "Paul McBeth ESP
 * Buzzz SS &#8211; 6-Claw", where &#8211; is an en dash -- so without this the
 * card prints the raw entity at the player.
 */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_m, d: string) => safeCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => safeCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    // Ampersand LAST: doing it first would turn "&amp;#38;" into "&#38;" and
    // then decode that too, which is how a double-decode produces characters
    // the shop never sent.
    .replace(/&amp;/g, '&');
}

function safeCodePoint(n: number): string {
  if (!Number.isFinite(n) || n < 32 || n > 0x10ffff) return '';
  try {
    return String.fromCodePoint(n);
  } catch {
    return '';
  }
}

/**
 * A product url made absolute, stripped of tracking parameters, and REJECTED
 * if it leaves the shop -- a result card names the retailer it sends you to,
 * so a link going elsewhere makes that name a lie.
 */
function sameHostUrl(raw: unknown, host: string): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  let abs: URL;
  try {
    abs = new URL(raw, `https://${host}`);
  } catch {
    return null;
  }
  if (abs.host !== host) return null;
  for (const k of [...abs.searchParams.keys()]) if (k.startsWith('_')) abs.searchParams.delete(k);
  return abs.toString();
}

/** Run tasks with a ceiling on how many are in flight. */
async function pooled<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= tasks.length) return;
        out[i] = await tasks[i]!();
      }
    })
  );
  return out;
}

/**
 * Take search-result urls, fetch the ones that look like products, and read
 * the price off each. This is what turns a WEB search into a PRICE search,
 * and it is shared by every engine-backed provider below.
 */
export async function priceCandidates(
  f: Fetcher,
  urls: string[],
  via: string,
  limit: number
): Promise<ProductHit[]> {
  const seen = new Set<string>();
  const candidates = urls.filter((u) => {
    if (!looksLikeProduct(u) || seen.has(u)) return false;
    seen.add(u);
    return true;
  });

  const results = await pooled(
    candidates.slice(0, limit * 3).map((url) => async (): Promise<ProductHit | null> => {
      try {
        const html = await getText(f, url, PAGE_TIMEOUT_MS);
        const p = extractPrice(html);
        if (!p) return null;
        return {
          title: p.title ?? url,
          price: p.price,
          currency: p.currency,
          retailer: hostLabel(url),
          url,
          image: p.image,
          available: p.available,
          via,
        };
      } catch {
        // A retailer that blocks us or times out is simply not in the list.
        return null;
      }
    }),
    6
  );
  return results.filter((r): r is ProductHit => r !== null).slice(0, limit);
}

/* ────────────────────────────────────────────────────────────────────────
   1. SerpApi — Google Shopping.

   The best fit by a distance: it is literally "prices from online retailers
   via Google", and it returns the price and the selling retailer in the
   search response, so no page fetching is needed at all. One request per
   search rather than one plus twenty.
   ──────────────────────────────────────────────────────────────────────── */
export function serpApiShopping(f: Fetcher, apiKey: string | undefined): SearchProvider {
  return {
    key: 'google-shopping',
    label: 'Google Shopping',
    configured: Boolean(apiKey),
    async search(query, limit) {
      const url =
        'https://serpapi.com/search.json?engine=google_shopping' +
        `&q=${encodeURIComponent(query)}&num=${Math.min(100, limit * 2)}&hl=en&gl=us` +
        `&api_key=${encodeURIComponent(apiKey!)}`;
      const body = await getJson(f, url, SEARCH_TIMEOUT_MS);
      const rows: any[] = Array.isArray(body?.shopping_results) ? body.shopping_results : [];
      return rows
        .map((r): ProductHit | null => {
          // extracted_price is the number SerpApi parsed; `price` is the
          // display string. Prefer the number and fall back to parsing.
          const price = toNumber(r.extracted_price ?? r.price);
          const link = typeof r.product_link === 'string' ? r.product_link : r.link;
          if (price === null || typeof link !== 'string' || !link) return null;
          return {
            title: String(r.title ?? '').trim() || link,
            price,
            currency: typeof r.currency === 'string' ? r.currency : 'USD',
            // The retailer Google names, which is the useful label here.
            retailer: String(r.source ?? hostLabel(link)).trim() || hostLabel(link),
            url: link,
            image: typeof r.thumbnail === 'string' ? r.thumbnail : null,
            available: null, // Google Shopping does not state stock reliably
            via: 'google-shopping',
          };
        })
        .filter((h): h is ProductHit => h !== null)
        .slice(0, limit);
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────
   2. Brave Search — web results, then read each page's own price markup.
   ──────────────────────────────────────────────────────────────────────── */
export function braveWeb(f: Fetcher, apiKey: string | undefined): SearchProvider {
  return {
    key: 'brave',
    label: 'Brave Search',
    configured: Boolean(apiKey),
    async search(query, limit) {
      const url =
        'https://api.search.brave.com/res/v1/web/search' +
        `?q=${encodeURIComponent(query)}&count=20&country=us&search_lang=en`;
      const body = await getJson(f, url, SEARCH_TIMEOUT_MS, {
        'x-subscription-token': apiKey!,
        accept: 'application/json',
      });
      const urls: string[] = (body?.web?.results ?? [])
        .map((r: any) => r?.url)
        .filter((u: unknown): u is string => typeof u === 'string');
      return priceCandidates(f, urls, 'brave', limit);
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────
   3. Google Programmable Search (Custom Search JSON API).
   ──────────────────────────────────────────────────────────────────────── */
export function googleCse(
  f: Fetcher,
  apiKey: string | undefined,
  cx: string | undefined
): SearchProvider {
  return {
    key: 'google',
    label: 'Google',
    configured: Boolean(apiKey && cx),
    async search(query, limit) {
      const url =
        'https://www.googleapis.com/customsearch/v1' +
        `?key=${encodeURIComponent(apiKey!)}&cx=${encodeURIComponent(cx!)}` +
        `&q=${encodeURIComponent(query)}&num=10`;
      const body = await getJson(f, url, SEARCH_TIMEOUT_MS);
      const urls: string[] = (body?.items ?? [])
        .map((r: any) => r?.link)
        .filter((u: unknown): u is string => typeof u === 'string');
      return priceCandidates(f, urls, 'google', limit);
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────
   4. The no-key fallback.

   Asks a set of storefronts directly through the public product-search
   endpoint their platform exposes. This is NOT presented in the app as a
   list of shops to browse — the player searches, and each result simply
   names the retailer that sells it, exactly as an engine-backed result does.
   It exists so the Market is not empty before a search key is configured,
   and it is narrower than the web: it can only ever find what these
   particular shops stock, on the two platforms that publish a search.

   There are two platform adapters because the shops that matter most are
   split across them: the Shopify suggest endpoint could not reach OTB Discs
   or Marshall Street at all, and those are multi-brand retailers, which are
   the only shops that return anything for a mould they do not make.
   ──────────────────────────────────────────────────────────────────────── */

/** Minor units -> major. Read, never assumed: JPY has 0, not 2. */
export function fromMinorUnits(raw: unknown, minorUnit: unknown): number | null {
  const s = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  if (!s) return null;

  // The Store API documents an integer in minor units ("2399" is $23.99), so
  // dividing is the normal path. A shop that deviates and sends "23.99"
  // anyway must NOT be divided -- that would print $0.24 for a $24 disc.
  // Detected rather than trusted, because both mistakes are 100x.
  if (/[.,]/.test(s)) return toNumber(s);

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const unit = typeof minorUnit === 'number' && Number.isInteger(minorUnit) && minorUnit >= 0 && minorUnit <= 4
    ? minorUnit
    : 2;
  return n / 10 ** unit;
}

/** Shopify: /search/suggest.json carries price, stock, image and url. */
async function shopifyProducts(
  f: Fetcher,
  host: string,
  query: string,
  perShop: number,
  currency: string
): Promise<ProductHit[]> {
  const url =
    `https://${host}/search/suggest.json?q=${encodeURIComponent(query)}` +
    `&resources[type]=product&resources[limit]=${perShop}`;
  const body = await getJson(f, url, SEARCH_TIMEOUT_MS);
  const rows: any[] = body?.resources?.results?.products ?? [];
  return rows
    .map((p): ProductHit | null => {
      const price = toNumber(p.price ?? p.price_min);
      const abs = sameHostUrl(p.url, host);
      if (price === null || !abs) return null;
      return {
        title: decodeEntities(String(p.title ?? '').trim()) || abs,
        price,
        currency,
        retailer: hostLabel(host),
        url: abs,
        image:
          (p.featured_image && typeof p.featured_image.url === 'string' && p.featured_image.url) ||
          (typeof p.image === 'string' ? p.image : null) ||
          null,
        available: p.available === true,
        via: 'storefronts',
      };
    })
    .filter((h): h is ProductHit => h !== null);
}

/**
 * WooCommerce: the public Store API.
 *
 * Two things here are not like Shopify and both are 100x-wrong if missed.
 * Prices come as an integer string in MINOR UNITS ("2399"), with the divisor
 * in `prices.currency_minor_unit` beside them. And the currency is carried
 * per product in `prices.currency_code`, which is better than a shop-level
 * guess, so a Woo shop never needs a meta.json read or the hand-typed
 * fallback at all.
 */
async function wooProducts(
  f: Fetcher,
  host: string,
  query: string,
  perShop: number,
  fallbackCurrency: string
): Promise<ProductHit[]> {
  const url =
    `https://${host}/wp-json/wc/store/v1/products?search=${encodeURIComponent(query)}` +
    `&per_page=${perShop}`;
  const body = await getJson(f, url, SEARCH_TIMEOUT_MS);
  const rows: any[] = Array.isArray(body) ? body : [];
  return rows
    .map((p): ProductHit | null => {
      const prices = p?.prices ?? {};
      // For a variable product `price` is already the lowest variant, which
      // is the "from" price -- the same meaning Shopify's price_min carries.
      const price = fromMinorUnits(prices.price ?? prices.price_range?.min_amount, prices.currency_minor_unit);
      const abs = sameHostUrl(p?.permalink, host);
      if (price === null || !abs) return null;
      const code = typeof prices.currency_code === 'string' && /^[A-Z]{3}$/.test(prices.currency_code)
        ? prices.currency_code
        : fallbackCurrency;
      const image = Array.isArray(p.images) && p.images[0] && typeof p.images[0].src === 'string'
        ? p.images[0].src
        : null;
      return {
        title: decodeEntities(String(p.name ?? '').trim()) || abs,
        price,
        currency: code,
        retailer: hostLabel(host),
        url: abs,
        image,
        available: p.is_in_stock === true,
        via: 'storefronts',
      };
    })
    .filter((h): h is ProductHit => h !== null);
}

export function storefronts(f: Fetcher, hosts: readonly string[]): SearchProvider {
  // A Shopify shop's own currency, read once per process from its storefront.
  // Cached because it is identity rather than inventory -- a shop does not
  // change currency mid-session -- and falling back to the listed value rather
  // than dropping the shop, since not knowing the label is no reason to hide
  // real products.
  const currencies = new Map<string, string>();
  async function currencyOf(host: string): Promise<string> {
    const hit = currencies.get(host);
    if (hit) return hit;
    let cur = CURRENCY_BY_HOST.get(host) ?? 'USD';
    try {
      const meta = await getJson(f, `https://${host}/meta.json`, SEARCH_TIMEOUT_MS);
      if (typeof meta?.currency === 'string' && /^[A-Z]{3}$/.test(meta.currency)) cur = meta.currency;
    } catch {
      /* fallback above */
    }
    currencies.set(host, cur);
    return cur;
  }

  return {
    key: 'storefronts',
    label: 'Disc golf storefronts',
    configured: hosts.length > 0,
    async search(query, limit) {
      const perShop = Math.max(3, Math.ceil(limit / 4));
      const results = await pooled(
        hosts.map((host) => async (): Promise<ProductHit[]> => {
          try {
            // Declared, not detected: a probe per shop per search would cost a
            // request to answer a question that never changes.
            const platform = PLATFORM_BY_HOST.get(host) ?? 'shopify';
            if (platform === 'woocommerce') {
              return await wooProducts(f, host, query, perShop, CURRENCY_BY_HOST.get(host) ?? 'USD');
            }
            return await shopifyProducts(f, host, query, perShop, await currencyOf(host));
          } catch {
            return [];
          }
        }),
        5
      );
      return results.flat();
    },
  };
}
