# The Disc Golf Go store

**Status: built, and selling nothing — deliberately.** The integration is a
**no-op until `STORE_SHOPIFY_HOST` is set**, because the Shopify storefront is
not live yet. Switching it on is a Render environment change, not a deploy.

This is the second revenue line. The first is retailer affiliate commission
(`MARKET_AFFILIATE.md`), which earns on somebody else's sale; this one is our
own margin on our own stock.

## What was decided, and why

Owner's call, 2026-10-30, three decisions:

1. **Shopify-backed**, not a custom build. We do not want to own sales-tax
   nexus across 50 states, shipping rates, fraud, chargebacks, returns or PCI
   scope in order to sell hats. Shopify carries all of it.
2. **Our products appear inside Market search results**, ranked by the same
   comparator as every other retailer, with no preference of any kind.
3. **A row inside Market**, not a sixth tab. Market is already where buying
   happens, and the nav was deliberately cut to five in the pivot.

The elegant part of (1) is that it made (2) nearly free: the Market's keyless
fallback already speaks Shopify's `/search/suggest.json`, and
`PLATFORM_BY_HOST` defaults to `shopify` for an unknown host, so our own store
needed **no new adapter**. It is one more host in the fan-out.

It also fills our own worst coverage hole. `MARKET_COVERAGE.md` records that
**DGA, Discraft and Innova are unreachable** without a search key. We now stock
those brands, so a keyless search reaches them through us.

## The rule this is all built around

> A price comparison that quietly ranks its owner's shop first is an ad wearing
> a comparison's clothes. The moment a player suspects the order is ours to
> set, every result in it is worth nothing — including the honest ones.

So the integrity rules here are **stricter** than the affiliate ones, because
the temptation is stronger: a commission is somebody else's margin, and this is
ours. `src/modules/market/our-store.ts` exists as its own file for that reason.

Each rule has a guard in `our-store.test.ts`, each proved to bite:

| Rule | How it is held |
|---|---|
| **The comparator never sees `ours`** | Source guard on the sort body, plus a behavioural guard driving the real service with our shop as the **dearest** and failing if it is not last |
| **Winning on price still works** | The mirror guard — our genuinely cheapest listing must rank first, so the rule above cannot be satisfied by always sinking us |
| **We are never affiliate-tagged** | `attachAffiliate` skips `ours`. On our own sale there is nobody to pay a commission, and a tracking parameter on our own checkout url would at best mean nothing and at worst hand a stranger the attribution |
| **Our listing is labelled** | `ours` is set server-side by dot-anchored host match, never by a provider and never guessed client-side; the page renders an **Ours** badge |
| **The badge cannot be hidden** | It is a *sibling* of the shop name, which truncates. Nested inside, a long retailer name would ellipsis it away — and a disclosure that vanishes on some rows is worse than none, because it reads as "this one is not ours" |
| **Unconfigured is a complete no-op** | No store reported, no listing marked, our host never asked. Verified live: identical 71 products from 14 retailers either way |
| **A malformed host is dropped and warned** | Same rule as `MARKET_AFFILIATE` and `REWARDS_TEST_PLAYER_IDS` — a typo must narrow, never widen. Guessing would fan a product search out to whatever the typo resolved to |

### Proved against real retailers, not fixtures

With a real multi-brand Shopify shop standing in as ours, a live `buzzz`
search returned **71 products from 14 retailers, 10 of them ours**, and:

```
   9.99        dynamicdiscs.com      <- a rival, cheaper, ranked FIRST
  10.99  OURS  discstore.com
  10.99        otbdiscs.com
```

Our own shop placed **second, on price**, in our own Market. That is the
correct outcome and it is what the guards pin.

## Switching it on

One setting in the Render dashboard:

```
STORE_SHOPIFY_HOST="shop.discgolfgo.com"
```

Accepts a bare host, `www.`, or a full `https://` url — all three are what you
paste out of a Shopify dashboard. Anything else is ignored with a warning.

### PRE-FLIGHT — copy that becomes false the moment you set it

**This is the item that will otherwise ship stale.** Three places still state
the old flat claim, and two of them are guarded, so they fail loudly — but the
promo site is the one a stranger reads first:

1. **`web/promo.html`** — *"We are not a shop: we take no payment, hold no
   stock and set no prices."* Becomes false. `market.test.ts` asserts the promo
   page keeps saying it (`/not (a|the) shop/i`), so that guard must be
   **reshaped, not deleted** — the Market is still not a shop, it is a
   comparison that now contains our shop, labelled and never floated. Say that
   instead.
2. **`web/market.html` lede** — already handled: static text is the
   true-when-unconfigured default and the no-JS fallback, rewritten by
   `setLede()` when a store exists. Nothing to do.
3. **CLAUDE.md positioning rule 2** — already amended. Read it before writing
   any new copy.

Also worth doing in the same change: **coupon terms**. The `$5 off
merchandise` coupon currently promises in-person redemption only, and
`admin-overview.test.ts` forbids the words "online" and "at checkout" — with a
comment saying *"When the store opens, that claim gets deleted."* Shopify takes
discount codes, so the existing `DGG-XXXX` codes can become real Shopify
discounts. Set **usage limit 1** and bind to the customer's email, the same two
fields that close the sharing hole on Disc Golf Scene (`REWARDS_STATUS.md`).

### Checks after switching on

```
curl -s https://discgolfgo.app/api/market | grep -o '"ourStore":[^,]*'
```

Then search for something you stock and confirm: our listings carry `ours`,
they are **not** `commissioned`, and the order is still price-ascending.

## What this does not do yet

- **No in-app product browsing.** The Store row opens the Shopify storefront in
  a new tab. A native browse surface is a later step; the value of the row is
  that it exists the day the store does.
- **No cart or checkout of ours.** Deliberate, and it is the whole reason for
  choosing Shopify: their hosted checkout means card data never touches our
  server and we hold no PCI scope.
- **No inventory sync.** The Market reads live price and stock from the same
  public endpoint it uses for every other Shopify shop, so there is nothing to
  sync — a cached price is a price eventually shown wrongly.

## Open questions for the owner

- **Dealer terms.** DGA, Discraft and Innova sell through authorized-dealer
  agreements, some with minimum-advertised-price rules. Worth reading yours
  before brand prices are published through a public comparison API.
- **The domain.** `shop.discgolfgo.com` as a Shopify custom domain keeps the
  brand on our own name; `discgolfgo.myshopify.com` works and reads worse.
- **Apple and Google.** Physical goods are explicitly *not* required to use
  in-app purchase, so a storefront is allowed. Note `/support` is deliberately
  404 on `.app` — that was about a donation link, which is a different rule.
