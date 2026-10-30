// src/modules/market/our-store.ts — the Disc Golf Go store, inside our own
// price comparison, with no thumb on the scale.
//
// Until this, the Market compared other people's shops and we sold nothing.
// We now stock merchandise of our own (apparel and accessories, plus DGA,
// Discraft and Innova discs) on a Shopify storefront, and the owner's call is
// that it appears in Market results ALONGSIDE every other retailer, ranked by
// the same comparator, with no preference of any kind.
//
// That is the only version of this worth building, and the reason is the whole
// design of this module:
//
//   A price comparison that quietly ranks its owner's shop first is an ad
//   wearing a comparison's clothes. The moment a player suspects the order is
//   ours to set, every result in it is worth nothing -- including the honest
//   ones. So the integrity rules here are stricter than the ones affiliate.ts
//   enforces, because this is a stronger temptation: a commission is somebody
//   else's margin, and this is ours.
//
// THE RULES, each with a guard proved to bite:
//
//   * THE COMPARATOR NEVER SEES `ours`. The sort in market.service.ts is
//     currency -> in-stock -> price and that is all it will ever be. A source
//     guard asserts the comparator references neither `ours` nor this module,
//     and a behavioural guard drives the REAL service over fixtures where our
//     own store is the DEAREST and fails if our listing is not last. Being
//     beaten by a cheaper rival in our own Market is the correct outcome and
//     is pinned as such.
//   * WE ARE NEVER AFFILIATE-TAGGED. A commission is something a third party
//     pays us for a referral; appending a tracking parameter to our own
//     checkout url would at best be meaningless and at worst hand a stranger
//     attribution on our own sale. attachAffiliate therefore skips our host.
//   * OUR LISTING IS LABELLED. A player comparing prices is entitled to know
//     that one of the sellers is the app showing them the comparison. Every
//     hit from our host carries `ours: true` and the page marks it. This is
//     the rule that replaces the old flat "we are not a shop" claim: the
//     Market is still not a shop, it is a comparison -- one that now contains
//     our shop, said out loud rather than discovered.
//   * UNCONFIGURED IS A NO-OP. With STORE_SHOPIFY_HOST unset, nothing here
//     changes a single byte of a search. That is the state this ships in,
//     because the Shopify store is not live yet, so switching it on is an
//     environment change rather than a deploy -- and today's behaviour is
//     provably unchanged.
//   * A MALFORMED HOST IS DROPPED AND WARNED, NEVER GUESSED. Same rule as
//     MARKET_AFFILIATE and REWARDS_TEST_PLAYER_IDS: a typo must narrow what
//     happens, never widen it. Guessing here would mean fanning a product
//     search out to whatever the typo resolved to.
//
// Why the host is configured rather than committed: the storefront's domain is
// not settled yet, and a half-written host in STOREFRONTS would have the
// fallback search quietly asking a shop that does not exist on every query.

/** How the store is described wherever a result from it is shown. */
export const OUR_STORE_LABEL = 'Disc Golf Go Store';

/**
 * Normalise and validate the STORE_SHOPIFY_HOST setting.
 *
 * Accepts a bare host, a `www.` host, or a full url, because all three are
 * what somebody actually pastes out of a Shopify dashboard. Returns the bare
 * lowercase host, or null when unset or unusable -- null being a complete
 * no-op, not a fallback to some default shop.
 */
export function parseOurStore(
  raw: string | undefined,
  warn: (msg: string) => void = (m) => console.warn(m)
): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;

  let host = trimmed;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(host)) {
    try {
      const u = new URL(host);
      // Only https. A plaintext storefront would send a player's search, and
      // then their card details, over the wire in clear.
      if (u.protocol !== 'https:') {
        warn(`[market] STORE_SHOPIFY_HOST must be https, ignoring: ${u.protocol}//…`);
        return null;
      }
      host = u.host;
    } catch {
      warn('[market] STORE_SHOPIFY_HOST is not a valid url, ignoring it');
      return null;
    }
  }

  host = host.toLowerCase().replace(/^www\./, '').replace(/\/.*$/, '').replace(/:\d+$/, '');

  // A host, not a sentence. Must have a dot and nothing a host cannot hold --
  // checked rather than assumed, because this value is interpolated into the
  // url the product search is sent to.
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
    warn('[market] STORE_SHOPIFY_HOST is not a valid host, ignoring it');
    return null;
  }

  return host;
}

/**
 * Is this url one of ours?
 *
 * Dot-anchored on purpose, exactly as affiliate.ts matches a programme: our
 * store at `shop.discgolfgo.com` must not claim a result from
 * `notdiscgolfgo.com`, and a lookalike domain must not be able to wear our
 * label. A host that fails to parse is not ours, which is the safe answer --
 * mislabelling somebody else's listing as ours is the error that matters here.
 */
export function isOurs(url: string, ourHost: string | null): boolean {
  if (!ourHost) return false;
  try {
    const host = new URL(url).host.toLowerCase().replace(/^www\./, '');
    return host === ourHost || host.endsWith(`.${ourHost}`);
  } catch {
    return false;
  }
}
