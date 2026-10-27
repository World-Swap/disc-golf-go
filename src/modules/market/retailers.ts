// src/modules/market/retailers.ts — the no-key fallback's storefronts.
//
// THIS IS NOT A SHOP LIST THE APP SHOWS. Nothing in the UI names these or
// lets you browse them; the Market is a search box, and a result simply says
// which retailer sells that item. This list exists only so that the Market
// returns something before a web-search key is configured — see providers.ts
// for why a key is needed at all.
//
// Each host exposes its ecommerce platform's own PUBLIC product-search
// endpoint, and `platform` says which one to ask:
//
//   shopify      /search/suggest.json   — live price, in-stock flag, image
//   woocommerce  /wp-json/wc/store/v1/products?search=  — the Store API
//
// The platform is DECLARED rather than detected, deliberately: detection
// would cost an extra request per shop per search to answer a question that
// does not change, and a wrong guess would silently drop a shop.
//
// Adding one is a line here; the check is
//   npm run market:check                               (configured shops)
//   node scripts/market-check.js --hosts a.com,b.com   (a candidate)
// which reports whether a host answers in either shape, in what currency, and
// — the part that actually decides how much a search finds — whether it
// returns anything for a mould it does not make.
//
// `currency` is a FALLBACK ONLY. A Shopify shop's own /meta.json wins, and a
// WooCommerce product carries its currency and minor-unit inline so the
// fallback is never consulted there. It is in the file at all because getting
// it wrong is not cosmetic: discgolfuk.com quotes GBP, and an assumed USD
// would print £18 as $18 beside real dollar prices and claim the wrong
// cheapest.
//
// WHAT THIS LIST CANNOT REACH, measured 2026-10-27 and worth knowing before
// anyone tries to "just add more shops": the ceiling here is the PLATFORM, not
// the effort. Infinite Discs (the largest US retailer, and one of the two with
// an affiliate programme), Disc Nation and Discraft run custom storefronts
// with no public search endpoint; Innova, Disc Store's smaller rivals and
// several others answer 200 with HTML rather than JSON; Disc Golf United
// returns 403 and a handful of shops 503 a datacenter IP outright, which is
// the same wall the search engines put up. So a real open-web search needs the
// API key providers.ts documents — this list is the floor, not the plan.

export type StorefrontPlatform = 'shopify' | 'woocommerce';

export type Storefront = {
  readonly host: string;
  /** Which public search endpoint to ask. */
  readonly platform: StorefrontPlatform;
  /** Fallback ISO code; the shop's own data wins where it carries any. */
  readonly currency: string;
};

export const STOREFRONTS: readonly Storefront[] = [
  // Multi-brand retailers. These are what make a search for somebody else's
  // mould return anything, so they matter far more per shop than the
  // manufacturers below.
  { host: 'sabattusdiscgolf.com', platform: 'shopify', currency: 'USD' },
  { host: 'www.gottagogottathrow.com', platform: 'shopify', currency: 'USD' },
  { host: 'discstore.com', platform: 'shopify', currency: 'USD' },
  { host: 'otbdiscs.com', platform: 'woocommerce', currency: 'USD' },
  { host: 'marshallstreetdiscgolf.com', platform: 'woocommerce', currency: 'USD' },
  { host: 'dynamicdiscs.com', platform: 'shopify', currency: 'USD' },

  // Manufacturer stores. Each one is the only place to buy its own plastic, so
  // they are worth having — but a manufacturer cannot stock a rival's mould,
  // which is why they contribute little to a brand-specific search.
  { host: 'www.discmania.net', platform: 'shopify', currency: 'USD' },
  { host: 'lonestardiscs.com', platform: 'shopify', currency: 'USD' },
  { host: 'prodigydisc.com', platform: 'shopify', currency: 'USD' },
  { host: 'thoughtspaceathletics.com', platform: 'shopify', currency: 'USD' },
  { host: 'doomsdaydiscs.com', platform: 'shopify', currency: 'USD' },
  { host: 'kastaplast.se', platform: 'shopify', currency: 'USD' },
  { host: 'store.latitude64.se', platform: 'shopify', currency: 'USD' },
  { host: 'westsidediscs.com', platform: 'shopify', currency: 'USD' },
  { host: 'mintdiscs.com', platform: 'shopify', currency: 'USD' },
  { host: 'gatewaydiscsports.com', platform: 'shopify', currency: 'USD' },
  { host: 'handeyesupply.com', platform: 'shopify', currency: 'USD' },
  { host: 'trashpandadiscgolf.com', platform: 'shopify', currency: 'USD' },
  { host: 'chumbadiscs.com', platform: 'shopify', currency: 'USD' },

  // Quotes GBP. Kept deliberately as the one non-USD shop, because it is what
  // keeps the "never compare currencies" path exercised by real data.
  { host: 'discgolfuk.com', platform: 'shopify', currency: 'GBP' },
];

export const STOREFRONT_HOSTS: readonly string[] = STOREFRONTS.map((s) => s.host);

export const CURRENCY_BY_HOST: ReadonlyMap<string, string> = new Map(
  STOREFRONTS.map((s) => [s.host, s.currency])
);

export const PLATFORM_BY_HOST: ReadonlyMap<string, StorefrontPlatform> = new Map(
  STOREFRONTS.map((s) => [s.host, s.platform])
);
