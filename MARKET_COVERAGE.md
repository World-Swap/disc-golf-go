# Market coverage — what the keyless path reaches, and what it cannot

Measured 2026-10-27. Coverage is the binding constraint on the Market being
worth anything (and on the affiliate line in `MARKET_AFFILIATE.md` earning
anything), so this records what was probed, what answered, and why the rest
does not — to save the next person re-probing thirty hosts.

## Where it stands

With **no search key set**, the Market asks a set of storefronts directly.
Measured through the real service against the real shops:

| query | products | retailers |
|---|---|---|
| buzzz | 75 | 14 |
| destroyer | 80 | 14 |
| putter | 190 | 19 |
| disc golf bag | 184 | 19 |
| basket | 137 | 18 |

Across those five: **666 products from 19 distinct retailers**, up from 543
from 16 before WooCommerce support was added.

## The finding: the ceiling is the PLATFORM, not the effort

"Just add more shops" does not work, and this is the reason. A keyless search
needs the shop's ecommerce platform to publish a product search. Two do:

- **Shopify** — `/search/suggest.json`, with live price, stock flag and image.
- **WooCommerce** — the Store API, `/wp-json/wc/store/v1/products?search=`.

Everything else was probed and does not offer one. What the big names actually
serve, so nobody tries again:

| retailer | what it serves | usable? |
|---|---|---|
| **Infinite Discs** — largest US retailer, **and one of the two with an affiliate programme** | custom platform, 307s the suggest path | no |
| **Discraft** — makes the Buzzz | no public search endpoint | no |
| **Innova** — largest catalogue in the sport | 200 with HTML, not JSON | no |
| Disc Nation, Marshall Street*, Disc Golf Depot, Disc Golf Shop CA, West Coast DG | 404 on both | no (*Marshall Street **is** Woo — added) |
| Disc Golf United | **403** to a datacenter IP | no |
| Disc Golf Center, Dynasty, Gripped Up, DG Addicts | **503** to a datacenter IP | no |
| MVP, Axiom, Streamline, Skybreed, Throw Pink, Disc Sport SE, Full Drive | 200 with HTML | no |

Two of those rows are the same wall the search engines put up (see
`providers.ts`): a server IP gets a 403 or a 503 where a browser would not.

**So the three biggest sources of disc golf retail — Infinite, Discraft and
Innova — are unreachable without a search key.** That is the argument for the
key, stated in numbers rather than as a preference.

## Shop MIX matters more than shop count

A manufacturer store cannot stock a rival's mould, so it contributes almost
nothing to a brand-specific search. Measured on "buzzz" (a Discraft mould),
`npm run market:check` reports the split: the multi-brand retailers return the
full 10 of 10 each, while manufacturers return 0–7 — and four return nothing at
all. `retailers.ts` is therefore grouped by that distinction, because adding
one multi-brand retailer is worth more than adding five manufacturers.

The two shops added here, **OTB Discs** and **Marshall Street**, are both
multi-brand and both WooCommerce — which is to say the Shopify-only fallback
could not see either of them.

## Adding a shop

```bash
npm run market:check                                # every configured shop
node scripts/market-check.js --hosts a.com,b.com    # a candidate, both platforms tried
node scripts/market-check.js --query buzzz,bag      # other probe queries
```

It reports the platform, the currency, how many priced results each query
returns, and — the number that decides whether a shop is worth adding — whether
it returns anything for a mould it does not make. It exits non-zero when a
**configured** shop fails, so it is worth running; a candidate is only reported
on, because deciding to add one is a judgement about what it stocks.

Then add a line to `STOREFRONTS` in `retailers.ts` with its `platform`. The
platform is **declared, not detected**: detection would cost a request per shop
per search to answer a question that never changes, and a wrong guess silently
drops a shop.

## The two WooCommerce traps, both 100x

Guarded, each proved to bite, and worth knowing before touching that adapter:

1. **Prices are integer minor units.** `"2399"` is $23.99, with the divisor in
   `prices.currency_minor_unit` beside it. Read as-is it is **$2,399**. The
   unit is read rather than assumed because it is not always 2 (JPY has 0). A
   shop that deviates and sends `"23.99"` anyway is detected and *not* divided
   — that mistake is $0.24 for a $24 disc.
2. **Names are HTML-entity encoded.** A real one is `Paul McBeth ESP Buzzz SS
   &#8211; 6-Claw`. Without decoding, the card prints the raw entity. The
   ampersand is decoded **last**, or `&amp;#38;` double-decodes into a
   character the shop never sent.

A Woo product also carries its own `currency_code`, which is better than a
shop-level guess, so a Woo shop needs no `/meta.json` read and never touches
the hand-typed currency fallback.

## Two things found by exposing more results

Both pre-existing, both surfaced by coverage work rather than caused by it.

- **The headline price vanished on most real searches.** "From $X" was computed
  only when the whole result set shared one currency, so a single GBP shop
  suppressed it — on 3 of the 5 queries above. It now reports the minimum
  **within** the currency the set is mostly in, and says which (`from $4.00 in
  USD`) when the set is mixed. Nothing is converted; we hold no exchange rate
  and inventing one would be the real sin. The guard that pinned the old
  behaviour was reshaped rather than deleted: it now asserts the headline is
  the minimum *of its own currency*, which is strictly stronger because it
  holds for a single-currency set too.
- **A zero price is not a cheap price.** WooCommerce returns `"0"` for a
  call-for-price or an unpriced variable product, and a real listing (OTB's
  "DGA Basket Icon Pin") became the headline **"from $0"** on a basket search
  the moment the headline started showing. A listing whose cost we do not know
  does not belong in a price comparison, so it is dropped — the same rule
  `extract.ts` already applies to a page with no price markup. Filtered in the
  service, where every provider funnels through, so a provider added later
  cannot reintroduce it.

## What would actually move coverage

In order:

1. **Set a search key** (`MARKET_SEARCH.md`). It is the only thing that reaches
   Infinite, Discraft and Innova, and it turns the Market from a set of
   storefronts into a web search. Everything else on this list is a rounding
   error next to it.
2. **Add multi-brand retailers on either platform** as they are found. The
   check script makes this a two-minute job per candidate.
3. Nothing else. Scraping a shop's own search HTML per retailer was considered
   and rejected: one fragile selector per shop, breaking silently and
   separately, to reach shops a single API key reaches properly.
