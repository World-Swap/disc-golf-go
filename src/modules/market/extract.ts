// src/modules/market/extract.ts — read a price off any retailer's product page.
//
// This is the half of the Market that works on the OPEN web rather than on a
// list of shops we maintain. A web search gives us candidate product urls at
// any retailer; this turns one of those pages into a price.
//
// It works because of a quirk of the shopping web that is worth stating: to
// appear in Google's shopping results at all, a retailer has to publish
// schema.org `Product` data with an `offers.price`, so essentially every real
// product page carries one — in JSON-LD, in microdata, or as an OpenGraph
// `product:price:amount`. Verified against real pages before this was
// written: a Shopify product page carries both JSON-LD Product and
// `og:price:amount`, and the numbers agree with the page.
//
// NOTHING HERE GUESSES. If a page publishes no price we return null and the
// result is dropped, because a product in a price-comparison list with a
// made-up or scraped-from-the-wrong-element price is worse than one missing
// result. In particular we never regex a `$12.99` out of the body text: that
// matches the "free shipping over $50" banner as readily as the price.

export type ExtractedPrice = {
  price: number;
  currency: string;
  title: string | null;
  image: string | null;
  /** True only when the page says so; absent markup is NOT "in stock". */
  available: boolean | null;
  /** Which markup it came from, so a wrong price can be traced. */
  how: 'json-ld' | 'microdata' | 'opengraph';
};

/** A price string from markup: "16.99", "$16.99", "1.299,00". */
export function toNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null;
  if (typeof raw !== 'string') return null;
  let s = raw.trim().replace(/[^\d.,]/g, '');
  if (!s) return null;
  // "1.299,00" (European) vs "1,299.00" (US): whichever separator is LAST is
  // the decimal one. Getting this backwards turns $1,299 into $1.30.
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function availabilityOf(raw: unknown): boolean | null {
  if (typeof raw !== 'string') return null;
  if (/InStock|in_stock|InStoreOnly|LimitedAvailability|PreOrder/i.test(raw)) return true;
  if (/OutOfStock|SoldOut|Discontinued|out_of_stock/i.test(raw)) return false;
  return null;
}

/** Walk a parsed JSON-LD value for the first node that is a Product with a price. */
function fromJsonLdNode(root: unknown): ExtractedPrice | null {
  const stack: unknown[] = [root];
  const seen = new Set<unknown>();
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node)) {
      stack.push(...node);
      continue;
    }
    const n = node as Record<string, unknown>;
    const type = Array.isArray(n['@type']) ? n['@type'].join(' ') : String(n['@type'] ?? '');
    if (/Product/i.test(type)) {
      let offers: any = n.offers;
      if (Array.isArray(offers)) offers = offers[0];
      // An AggregateOffer names the range rather than a price.
      const price = toNumber(offers?.price ?? offers?.lowPrice);
      if (price !== null) {
        const image = n.image;
        return {
          price,
          currency: typeof offers?.priceCurrency === 'string' ? offers.priceCurrency : 'USD',
          title: typeof n.name === 'string' ? n.name : null,
          image:
            typeof image === 'string'
              ? image
              : Array.isArray(image) && typeof image[0] === 'string'
                ? image[0]
                : typeof (image as any)?.url === 'string'
                  ? (image as any).url
                  : null,
          available: availabilityOf(offers?.availability),
          how: 'json-ld',
        };
      }
    }
    for (const v of Object.values(n)) if (v && typeof v === 'object') stack.push(v);
  }
  return null;
}

function metaContent(html: string, prop: string): string | null {
  // Both attribute orders occur in the wild; checking only one misses about
  // half of real pages.
  const a = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`,
    'i'
  ).exec(html);
  if (a) return a[1]!;
  const b = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`,
    'i'
  ).exec(html);
  return b ? b[1]! : null;
}

export function extractPrice(html: string): ExtractedPrice | null {
  // 1. JSON-LD. Richest and most reliable: it names the product, the price,
  //    the currency and the stock state together.
  for (const m of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1]!);
    } catch {
      continue; // a malformed block is not a reason to abandon the page
    }
    const hit = fromJsonLdNode(parsed);
    if (hit) return hit;
  }

  // 2. OpenGraph / product meta. Nearly as good and very common.
  const og = metaContent(html, 'og:price:amount') ?? metaContent(html, 'product:price:amount');
  const ogPrice = toNumber(og);
  if (ogPrice !== null) {
    return {
      price: ogPrice,
      currency:
        metaContent(html, 'og:price:currency') ??
        metaContent(html, 'product:price:currency') ??
        'USD',
      title: metaContent(html, 'og:title'),
      image: metaContent(html, 'og:image'),
      available: availabilityOf(
        metaContent(html, 'og:availability') ?? metaContent(html, 'product:availability')
      ),
      how: 'opengraph',
    };
  }

  // 3. Microdata. The oldest of the three and still used by older carts.
  const micro = /itemprop=["']price["'][^>]*content=["']([^"']+)["']/i.exec(html);
  const microPrice = toNumber(micro?.[1]);
  if (microPrice !== null) {
    const cur = /itemprop=["']priceCurrency["'][^>]*content=["']([A-Z]{3})["']/i.exec(html);
    return {
      price: microPrice,
      currency: cur ? cur[1]! : 'USD',
      title: metaContent(html, 'og:title'),
      image: metaContent(html, 'og:image'),
      available: null,
      how: 'microdata',
    };
  }

  return null;
}

/**
 * Does this url look like a single product rather than a category page?
 *
 * Deliberately a hint and not a gate: it decides what we bother FETCHING, and
 * a category page simply publishes no Product markup and drops out at the
 * extract step anyway. Being loose here costs a wasted request; being tight
 * loses real products at retailers with unusual url shapes.
 */
export function looksLikeProduct(url: string): boolean {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
    // Encyclopaedias, forums and video sites are never a place to buy a disc.
    if (/wikipedia\.org|reddit\.com|youtube\.com|facebook\.com|pinterest\./i.test(u.host)) return false;
    return /\/(products?|p|item|items|dp|gp\/product|shop|store|buy|collections)\//i.test(u.pathname)
      || /[?&](product|item|sku|pid)=/i.test(u.search);
  } catch {
    return false;
  }
}
