// src/modules/market/retailers.ts — the shops the Market searches.
//
// Every one of these runs Shopify, which exposes a PUBLIC product search at
// /search/suggest.json carrying the live price, the live in-stock flag, the
// image and the product url. That is the whole reason the Market can promise
// real prices and real stock rather than a stale table we maintain by hand:
// the numbers come from the shop's own storefront at the moment you search.
//
// Adding a shop is one line here, and the check is one command:
//   npm run market:check
// which hits each host and reports whether it answers in the Shopify shape.
// A host that does not is dropped rather than guessed at -- a retailer whose
// prices we cannot read is worse than one we do not list, because a wrong
// price on a page that looks like a marketplace is a promise we cannot keep.
//
// `name` and `currency` here are only a FALLBACK. Both are re-read from each
// shop's own /meta.json at refresh time (see market.service), for the same
// reason the video feed takes a channel's name from its own feed: a label we
// type by hand drifts from the thing it labels, and a currency we assume is a
// price we report wrongly.

export type Retailer = {
  /** Stable key used in the API and the UI filter. */
  readonly key: string;
  /** Fallback display name; the shop's own /meta.json wins. */
  readonly name: string;
  readonly host: string;
  /** Fallback ISO currency; the shop's own /meta.json wins. */
  readonly currency: string;
  /** What this shop mostly is, shown as a chip so the list is not anonymous. */
  readonly kind: 'retailer' | 'manufacturer';
  readonly country: string;
};

export const RETAILERS: readonly Retailer[] = [
  { key: 'dynamic-discs',   name: 'Dynamic Discs',        host: 'dynamicdiscs.com',               currency: 'USD', kind: 'manufacturer', country: 'US' },
  { key: 'discmania',       name: 'Discmania Store',      host: 'www.discmania.net',              currency: 'USD', kind: 'manufacturer', country: 'US' },
  { key: 'sabattus',        name: 'Sabattus Disc Golf',   host: 'sabattusdiscgolf.com',           currency: 'USD', kind: 'retailer',     country: 'US' },
  { key: 'gotta-go',        name: 'Gotta Go Gotta Throw', host: 'www.gottagogottathrow.com',      currency: 'USD', kind: 'retailer',     country: 'US' },
  { key: 'lone-star',       name: 'Lone Star Disc',       host: 'lonestardiscs.com',              currency: 'USD', kind: 'manufacturer', country: 'US' },
  { key: 'prodigy',         name: 'Prodigy Disc',         host: 'prodigydisc.com',                currency: 'USD', kind: 'manufacturer', country: 'US' },
  { key: 'thought-space',   name: 'Thought Space Athletics', host: 'thoughtspaceathletics.com',   currency: 'USD', kind: 'manufacturer', country: 'US' },
  { key: 'doomsday',        name: 'Doomsday Discs',       host: 'doomsdaydiscs.com',              currency: 'USD', kind: 'manufacturer', country: 'US' },
  { key: 'kastaplast',      name: 'Kastaplast',           host: 'kastaplast.se',                  currency: 'USD', kind: 'manufacturer', country: 'SE' },
  { key: 'latitude-64',     name: 'Latitude 64',          host: 'store.latitude64.se',            currency: 'USD', kind: 'manufacturer', country: 'SE' },
  { key: 'westside',        name: 'Westside Discs',       host: 'westsidediscs.com',              currency: 'USD', kind: 'manufacturer', country: 'SE' },
];

export const RETAILER_BY_KEY: ReadonlyMap<string, Retailer> = new Map(
  RETAILERS.map((r) => [r.key, r])
);
