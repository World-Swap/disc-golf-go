// src/modules/store/store.service.ts — browsing our own merchandise inside
// the app, without the app ever handling a payment.
//
// The Market answers "what does this cost and who sells it". This answers the
// other question a player has once they trust us: "what do YOU have?" Until
// now the Store row opened our Shopify storefront in a new tab, which works
// and reads like being shown the door.
//
// HOW IT WORKS WITHOUT AN API TOKEN, which is the whole reason this is small:
// a Shopify storefront publishes its catalogue at `/products.json` and its
// collections at `/collections.json`, both unauthenticated, both carrying
// variants, prices, stock and images. Measured against a real shop before any
// of this was written. So browsing needs no token, no webhook and no sync.
//
// THE RULES, each guarded:
//
//   * NOTHING IS STORED. Same rule as the Market and for the same reason: a
//     cached price is a price eventually shown wrongly, and a cached stock
//     flag sells something we do not have. There is no repo in this module.
//   * WE NEVER TAKE THE PAYMENT. Browsing is ours; buying happens on our
//     Shopify product page, which owns the variant picker, the stock, the
//     shipping and every byte of card data. That is the entire reason the
//     storefront is Shopify-backed, and reimplementing a cart here would
//     throw away the one thing we bought.
//     (Shopify's `/cart/<variant>:<qty>` permalink was tried first and is NOT
//     used: against a real shop it redirected to the site root for both a
//     sold-out and an in-stock variant, so it would have been a Buy button
//     that silently loses the item. The product page always resolves.)
//   * EVERY LINK STAYS ON OUR HOST. A product url is rebuilt from the handle
//     against the configured host rather than taken from the response, so a
//     field we do not control cannot send a player somewhere else.
//   * SOLD OUT IS NEVER BUYABLE. A product with no available variant is shown
//     and labelled, not hidden -- hiding it makes the shop look emptier than
//     it is -- but it cannot be presented as purchasable.
//   * UNCONFIGURED IS A NO-OP. With STORE_SHOPIFY_HOST unset there is no
//     catalogue, no collections and no store page content, and nothing is
//     ever fetched. That is the state this ships in.

import { parseOurStore, OUR_STORE_LABEL } from '../market/our-store';

/** How long one upstream read may take before it is abandoned. */
const TIMEOUT_MS = 6000;
/** Products per page. Shopify's own cap is 250; this is a phone. */
export const PAGE_SIZE = 24;

export type StoreVariant = {
  id: number;
  title: string;
  price: number;
  available: boolean;
};

export type StoreProduct = {
  id: number;
  title: string;
  handle: string;
  url: string;
  image: string | null;
  vendor: string | null;
  type: string | null;
  /** Lowest price across variants, which is what a grid shows. */
  price: number | null;
  currency: string;
  /** True when at least one variant can actually be bought. */
  available: boolean;
  variants: StoreVariant[];
};

export type StoreCollection = { handle: string; title: string; count: number };

type Fetcher = typeof fetch;

export type StoreDeps = {
  fetchImpl?: Fetcher;
  /** Raw STORE_SHOPIFY_HOST; absent means we sell nothing, which is a no-op. */
  host?: string | undefined;
};

async function getJson(f: Fetcher, url: string): Promise<unknown> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await f(url, { signal: ac.signal });
    if (!res.ok) return null;
    return JSON.parse(await res.text());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** A price string Shopify sends as "22.00". Anything unparseable is null. */
function money(raw: unknown): number | null {
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  // A zero price is not a cheap price -- the same rule the Market applies to
  // a call-for-price listing. It means we do not know, so we do not claim.
  return Number.isFinite(n) && n > 0 ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function createStoreService(deps: StoreDeps = {}) {
  const f: Fetcher = deps.fetchImpl ?? fetch;
  const host = parseOurStore(deps.host);

  // Read once per process: a shop's currency is identity, not inventory.
  let currency: string | null = null;
  async function currencyOf(): Promise<string> {
    if (currency) return currency;
    const meta = (await getJson(f, `https://${host}/meta.json`)) as { currency?: unknown } | null;
    currency = str(meta?.currency) ?? 'USD';
    return currency;
  }

  /**
   * Shape one Shopify product.
   *
   * The url is REBUILT from the handle against our own host rather than read
   * from the response: the catalogue is ours, but rebuilding is what makes
   * "every link stays on our host" a property of the code rather than a hope.
   */
  function shape(raw: unknown, cur: string): StoreProduct | null {
    const p = raw as Record<string, unknown>;
    const handle = str(p?.handle);
    const title = str(p?.title);
    if (!handle || !title) return null;

    const variants: StoreVariant[] = (Array.isArray(p.variants) ? p.variants : [])
      .map((v) => {
        const o = v as Record<string, unknown>;
        const price = money(o.price);
        if (typeof o.id !== 'number' || price === null) return null;
        return {
          id: o.id,
          title: str(o.title) ?? '',
          price,
          available: o.available === true,
        };
      })
      .filter((v): v is StoreVariant => v !== null);

    // The grid price is the cheapest a buyer could actually pay, so it is
    // read from the IN-STOCK variants when there are any. Falling back to the
    // full set keeps a sold-out product honest about what it cost rather than
    // showing nothing.
    const sellable = variants.filter((v) => v.available);
    const pool = sellable.length ? sellable : variants;
    const image = Array.isArray(p.images) && p.images.length
      ? str((p.images[0] as Record<string, unknown>)?.src)
      : null;

    return {
      id: typeof p.id === 'number' ? p.id : 0,
      title,
      handle,
      url: `https://${host}/products/${encodeURIComponent(handle)}`,
      image,
      vendor: str(p.vendor),
      type: str(p.product_type),
      price: pool.length ? Math.min(...pool.map((v) => v.price)) : null,
      currency: cur,
      available: sellable.length > 0,
      variants,
    };
  }

  return {
    /** What the page needs before asking for anything. */
    status() {
      return {
        open: host !== null,
        host,
        label: host ? OUR_STORE_LABEL : null,
        pageSize: PAGE_SIZE,
      };
    },

    /** Our collections, for the filter row. Empty when we sell nothing. */
    async collections(): Promise<StoreCollection[]> {
      if (!host) return [];
      const d = (await getJson(f, `https://${host}/collections.json?limit=50`)) as
        | { collections?: unknown }
        | null;
      const list = Array.isArray(d?.collections) ? d!.collections : [];
      return list
        .map((c) => {
          const o = c as Record<string, unknown>;
          const handle = str(o.handle);
          const title = str(o.title);
          if (!handle || !title) return null;
          const count = typeof o.products_count === 'number' ? o.products_count : 0;
          return { handle, title, count };
        })
        .filter((c): c is StoreCollection => c !== null && c.count > 0);
    },

    /**
     * One page of our catalogue, optionally inside a collection.
     *
     * `more` rather than a total, because Shopify's public endpoint does not
     * report one and inventing a page count from a full read would cost a
     * request per page to answer a question nobody asked.
     */
    async products(opts: { collection?: string; page?: number } = {}): Promise<{
      products: StoreProduct[];
      page: number;
      more: boolean;
      currency: string;
    }> {
      const page = Math.max(1, Math.min(50, Math.floor(opts.page ?? 1)));
      if (!host) return { products: [], page, more: false, currency: 'USD' };

      // A collection handle is interpolated into a path, so it is restricted
      // to what a Shopify handle can actually be rather than escaped and
      // hoped for. Anything else browses the whole catalogue.
      const col = opts.collection && /^[a-z0-9][a-z0-9-]{0,80}$/i.test(opts.collection)
        ? opts.collection.toLowerCase()
        : null;
      const base = col
        ? `https://${host}/collections/${col}/products.json`
        : `https://${host}/products.json`;

      const cur = await currencyOf();
      const d = (await getJson(f, `${base}?limit=${PAGE_SIZE}&page=${page}`)) as
        | { products?: unknown }
        | null;
      const raw = Array.isArray(d?.products) ? d!.products : [];
      const products = raw
        .map((p) => shape(p, cur))
        .filter((p): p is StoreProduct => p !== null);

      return { products, page, more: raw.length === PAGE_SIZE, currency: cur };
    },
  };
}
