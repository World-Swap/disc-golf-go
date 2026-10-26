// src/modules/market/affiliate.ts — how the Market earns, without changing
// what it shows.
//
// Every Market result already opens on the retailer's own page. That click is
// worth nothing today; through a retailer's affiliate programme it is worth a
// commission on the order. Nothing a player sees about the search changes:
// same query, same results, same order, same prices, same destination host.
//
// THE RULE THIS FILE EXISTS TO ENFORCE, and the reason it is a separate file:
// a commission must never change the ranking, the price or the stock state of
// a result. The sort lives in market.service.ts and runs to completion BEFORE
// anything here is called, on an array this module then maps over -- so the
// comparator cannot see a commission even by accident. Guards pin all of it,
// because the day a payout reorders results the Market has stopped being a
// price comparison and become an ad, and the standing promise that we are not
// a shop stops being true.
//
// Four further rules, each guarded:
//
//   * UNCONFIGURED IS A NO-OP. With no programme set, every url is returned
//     byte-identical. That is the state this ships in -- no programme has been
//     applied for yet -- so switching one on later is an environment change
//     rather than a deploy, and today's behaviour is provably unchanged.
//   * THE HOST NEVER CHANGES. A rewrite only adds the programme's own query
//     parameter to the retailer's own url. Network deep links (which send the
//     click through a tracking domain) are deliberately NOT supported here:
//     the card prints the retailer it is sending you to, and that claim has to
//     stay checkable. A test asserts the host is preserved.
//   * AN EXISTING TAG IS LEFT ALONE. If the url already carries the
//     programme's parameter, the url is returned untouched rather than
//     overwritten -- overwriting it would take someone else's attribution,
//     which is theft of a commission rather than earning one.
//   * A MALFORMED ENTRY IS DROPPED, NEVER GUESSED. Same rule as the rewards
//     test hatch: a typo must narrow what happens, never widen it. A bad entry
//     is warned about in the log, because a silently ignored programme is a
//     commission nobody notices is missing.

/** One retailer's affiliate programme, as configured. */
export type AffiliateProgram = {
  /** Bare host, lowercase, no leading "www.". */
  readonly host: string;
  /** The query parameter that programme attributes a click by. */
  readonly param: string;
  /** Our account identifier within that programme. */
  readonly id: string;
};

/**
 * Parse the MARKET_AFFILIATE setting.
 *
 * Format is one entry per programme, comma separated:
 *   host|param|id,  host|param|id
 * e.g. "infinitediscs.com|ref|12345, discountdiscgolf.com|aff|abcdef"
 *
 * One setting rather than one per retailer because the set will change as
 * programmes are approved, and sixteen separate Render variables is sixteen
 * chances to set one and forget another.
 */
export function parsePrograms(
  raw: string | undefined,
  warn: (msg: string) => void = (m) => console.warn(m)
): AffiliateProgram[] {
  if (!raw || !raw.trim()) return [];
  const out: AffiliateProgram[] = [];
  const seen = new Set<string>();

  for (const entry of raw.split(',')) {
    const text = entry.trim();
    if (!text) continue;
    const parts = text.split('|').map((p) => p.trim());
    if (parts.length !== 3) {
      warn(`[market] affiliate entry ignored, expected host|param|id: ${text}`);
      continue;
    }
    const [rawHost, param, id] = parts as [string, string, string];
    const host = rawHost.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] ?? '';

    // A host has a dot and no spaces; a param is a url-safe token; an id is
    // whatever the programme issued, but it must survive a url intact. None
    // of the three may be empty. Anything else is a typo, and a typo that
    // produced a plausible-looking link would be worse than no link at all.
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) {
      warn(`[market] affiliate entry ignored, not a host: ${rawHost}`);
      continue;
    }
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(param)) {
      warn(`[market] affiliate entry ignored, not a parameter name: ${param}`);
      continue;
    }
    if (!/^[A-Za-z0-9._~-]{1,120}$/.test(id)) {
      warn(`[market] affiliate entry ignored, id is not url-safe: ${host}`);
      continue;
    }
    if (seen.has(host)) {
      warn(`[market] affiliate entry ignored, ${host} is already configured`);
      continue;
    }
    seen.add(host);
    out.push({ host, param, id });
  }
  return out;
}

/**
 * The programme covering a url's host, if any.
 *
 * Matched on the parsed hostname with "www." stripped, or on a dot-anchored
 * suffix of it -- so a programme declared for `latitude64.se` also covers
 * `store.latitude64.se`, which is the host that storefront actually serves.
 * The dot anchor is what keeps it safe: `notlatitude64.se` does not end with
 * `.latitude64.se`, so a lookalike domain cannot collect our tag.
 */
export function programFor(url: string, programs: readonly AffiliateProgram[]): AffiliateProgram | null {
  if (!programs.length) return null;
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    host = u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
  for (const p of programs) {
    if (host === p.host || host.endsWith(`.${p.host}`)) return p;
  }
  return null;
}

/**
 * The url to send a click to. Returns the url UNCHANGED when there is no
 * programme for it, when it already carries that programme's tag, or when
 * anything at all goes wrong -- a search result that still opens the right
 * page untracked is a lost commission, where a mangled url is a lost sale.
 */
export function affiliateUrl(url: string, programs: readonly AffiliateProgram[]): string {
  const program = programFor(url, programs);
  if (!program) return url;
  try {
    const u = new URL(url);
    // Someone else's tag is not ours to replace.
    if (u.searchParams.has(program.param)) return url;
    u.searchParams.set(program.param, program.id);
    const rewritten = u.toString();
    // Belt and braces: the host is the one thing a reader is entitled to
    // trust, because the card names it. If a rewrite ever moved it, drop the
    // rewrite rather than the promise.
    if (new URL(rewritten).host !== new URL(url).host) return url;
    return rewritten;
  } catch {
    return url;
  }
}

/** A result, as far as this module is concerned: it only ever reads `url`. */
type Linkable = { url: string };

/**
 * Tag an already-ranked list of results.
 *
 * Takes the array the sort produced and returns it in the SAME ORDER, with
 * only `url` changed and a `commissioned` flag added so the response is
 * honest about which links earn. Nothing here reads price, currency or
 * availability, and nothing here reorders: this runs after ranking is
 * finished, which is what makes "a commission cannot change the ranking" a
 * property of the structure rather than a promise in a comment.
 */
export function attachAffiliate<T extends Linkable>(
  hits: readonly T[],
  programs: readonly AffiliateProgram[]
): Array<T & { commissioned: boolean }> {
  return hits.map((hit) => {
    const url = affiliateUrl(hit.url, programs);
    return { ...hit, url, commissioned: url !== hit.url };
  });
}
