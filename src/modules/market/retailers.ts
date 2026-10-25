// src/modules/market/retailers.ts — the no-key fallback's storefronts.
//
// THIS IS NOT A SHOP LIST THE APP SHOWS. Nothing in the UI names these or
// lets you browse them; the Market is a search box, and a result simply says
// which retailer sells that item. This list exists only so that the Market
// returns something before a web-search key is configured — see providers.ts
// for why a key is needed at all.
//
// Each host runs Shopify, whose public /search/suggest.json carries the live
// price and in-stock flag. Adding one is a line here; the check is
//   npm run market:check
// which reports whether a host answers in that shape, and in what currency.
//
// `currency` is a FALLBACK ONLY and is re-read from each shop's own
// /meta.json at runtime. It is in the file at all because getting it wrong is
// not cosmetic: discgolfuk.com quotes GBP, and an assumed USD would print
// £18 as $18 beside real dollar prices and claim the wrong cheapest.

export type Storefront = {
  readonly host: string;
  /** Fallback ISO code; the shop's own /meta.json wins. */
  readonly currency: string;
};

export const STOREFRONTS: readonly Storefront[] = [
  { host: 'dynamicdiscs.com', currency: 'USD' },
  { host: 'www.discmania.net', currency: 'USD' },
  { host: 'sabattusdiscgolf.com', currency: 'USD' },
  { host: 'www.gottagogottathrow.com', currency: 'USD' },
  { host: 'lonestardiscs.com', currency: 'USD' },
  { host: 'prodigydisc.com', currency: 'USD' },
  { host: 'thoughtspaceathletics.com', currency: 'USD' },
  { host: 'doomsdaydiscs.com', currency: 'USD' },
  { host: 'kastaplast.se', currency: 'USD' },
  { host: 'store.latitude64.se', currency: 'USD' },
  { host: 'westsidediscs.com', currency: 'USD' },
  { host: 'mintdiscs.com', currency: 'USD' },
  { host: 'gatewaydiscsports.com', currency: 'USD' },
  { host: 'handeyesupply.com', currency: 'USD' },
  { host: 'trashpandadiscgolf.com', currency: 'USD' },
  // Quotes GBP. Kept deliberately as the one non-USD shop, because it is what
  // keeps the "never compare currencies" path exercised by real data.
  { host: 'discgolfuk.com', currency: 'GBP' },
];

export const STOREFRONT_HOSTS: readonly string[] = STOREFRONTS.map((s) => s.host);

export const CURRENCY_BY_HOST: ReadonlyMap<string, string> = new Map(
  STOREFRONTS.map((s) => [s.host, s.currency])
);
