# Monetising the Market

**Status: built, and earning nothing — deliberately.** The code is in place and
is a **no-op until a programme is configured**, because no affiliate programme
has been applied for yet. Switching one on is a Render environment change, not
a deploy.

This is the first of the three revenue lines (see **What we are not doing yet**
at the foot). It was built first for one reason: it needs **no change to what a
player sees** in the search, and retrofitting affiliate links across every
result later is strictly worse than having the layer there from the start.

## Why this and not a paywall

The training library is the lead and it stays free. The coaching videos it
points at are free on YouTube and were never ours to gate — `/support` already
says so in those words. So the Market is monetised at the point where money is
already changing hands: a player searches, finds a disc, and buys it from a
retailer. We take a commission from the retailer, not from the player.

For the competitive reasoning behind that choice: **UDisc Pro is $29.99/yr and
contains no instruction at all** — rangefinder, round ratings, hole averages,
scorecard history, course traffic, leaderboards, watch scoring. They sell
*measurement*. The library is the thing they do not have, which is why gating
it would be giving away the only real advantage.

## What the code does

`src/modules/market/affiliate.ts`, applied in `market.service.ts` as the
**last** step of a search.

- Rewrites a result's url to carry the retailer's own affiliate parameter.
- Marks each result `commissioned: true|false` so the response is honest.
- Reports `affiliate: true|false` on `GET /api/market`, which is what makes the
  disclosure on `web/market.html` appear — and it appears **only** when a
  programme is actually configured, because with none there is nothing to
  disclose.

### The rules it enforces, each with a guard proved to bite

1. **A commission can never change the ranking.** The sort (currency →
   in-stock → price) runs to completion *before* tagging, which operates on the
   ranked array. Two guards: the comparator may not reference a commission at
   all, and tagging must appear after the sort in the source. A third drives
   the real service twice over identical fixtures — one paid on the *dearest*
   shop — and fails if the order differs.
2. **Unconfigured is a byte-identical no-op.** Verified live: the same `buzzz`
   search against a configured and an unconfigured server returned **50
   products from 12 retailers, cheapest $9.99, in the identical order**, with 8
   tagged and 0 tagged respectively and no stray tags in the unconfigured run.
3. **The host never changes.** A rewrite only adds a query parameter to the
   retailer's own url. **Network deep links are deliberately unsupported** —
   the card prints the retailer it sends you to, and that claim has to stay
   checkable.
4. **An existing tag is left alone.** If the url already carries that
   programme's parameter it is returned untouched. Overwriting it would take
   someone else's attribution, which is not the same thing as earning a
   commission.
5. **A malformed entry is dropped and logged, never guessed.** Same rule as
   `REWARDS_TEST_PLAYER_IDS`: a typo must narrow what happens, never widen it.
   A silently ignored programme is a commission nobody notices is missing, so
   it warns — without printing the account id.

## Configuring a programme

One setting, `MARKET_AFFILIATE`, in the Render dashboard. **Account ids do not
go in this repo** — it is public.

```
MARKET_AFFILIATE="infinitediscs.com|ref|OURID, discountdiscgolf.com|aff|OURID"
```

Format is `host|param|id`, comma separated. The host may be written bare, with
`www.`, or as a full url; it is normalised. A programme declared for
`latitude64.se` also covers `store.latitude64.se` (dot-anchored, so a lookalike
domain cannot collect our tag).

### THE OPEN ITEM, and it is the one that matters

**`param` is not knowable until a programme approves us.** Infinite Discs'
affiliate page does not publish its parameter name; it issues a login and the
links come from there. So:

1. Apply. Wait for approval.
2. Take the tracking parameter **from that programme's own dashboard** — do not
   infer it from a blog post or from another retailer's scheme.
3. Set it, then **click a tagged link and confirm the click registers in their
   dashboard** before trusting it.

Step 3 is not optional. A wrong parameter produces a link that works perfectly
and tracks nothing, which is the failure mode this repo keeps recording: it
looks exactly like success.

## Programmes, with verified rates

Checked 2026-10-26. Rates move — re-read the merchant's own page before relying
on these.

| Retailer | Rate | Notes |
|---|---|---|
| [Infinite Discs](https://infinitediscs.com/Affiliate-Program) | **~10%** cash, higher in store credit | In-house. Approval required. Paid monthly once ≥ **$50** owed. No cookie window published. |
| [Discount Disc Golf](https://discountdiscgolf.com/affiliate-program) | **10%** on a new customer's first two orders, then **1%** ongoing | In-house, via Push Lap Growth. Paid monthly once ≥ **$25**. |
| Dynamic Discs | — | **No consumer programme found.** Its only referral scheme is wholesale: a $250 gift card for referring a *new business*'s first wholesale order. Not applicable. |

**There is no network aggregating disc golf retail.** AvantLink, ShareASale and
Impact carry general golf brands; no disc golf retailer was found on any of
them. So this is per-retailer business development — one application per
retailer rather than one signup. That is the grind, and it is also the
moat: nobody else has done it, and the Market already has the storefronts
wired.

## What this is honestly worth today

**Close to nothing, and that is expected.** Production carries ~142 accounts.
Any revenue rate times that is noise, and a projection would be fiction.

What it buys is that the layer exists before growth, cannot bend the results,
and costs nothing to carry. The binding constraint on this line is **not the
commission rate — it is Market coverage and traffic.** With no search key set
the Market reaches a set of storefronts rather than the web (see
`MARKET_SEARCH.md`); a `buzzz` search returns ~75 products from 14 retailers.
Switching on a search key widens that, and is the single biggest lever on this
revenue line — see `MARKET_COVERAGE.md` for what the keyless path can and
cannot reach, and why.

There is one structural nicety worth keeping in view: the coupon programme
currently costs money out of pocket (~$20 once, then ~$13/yr per engaged
account — see `REWARDS_STATUS.md`). Affiliate margin on purchases the lessons
drive would let the loop fund itself: lessons → coupon → purchase → commission
→ the next coupon.

## What we are not doing yet

- **A coaching marketplace.** The differentiated line, and **no disc golf
  coaching marketplace exists**. In-person lessons run $79–80/hr
  ([1](https://discgolfresort.com/disc-golf-lessons/),
  [2](https://www.disccoach.org/book-online),
  [3](https://treelovedg.com/products/disc-golf-lesson)); ball-golf per-video
  review is $20–50; and Overthrow Disc Golf — **six lessons in our own
  library** — already sells 1-on-1 at $60/mo. The app knows a player's
  *diagnosed weakness* from the assessment plus the lessons they finished,
  which is the matching signal a marketplace cannot buy. Take 15–20%. The hard
  part is supply, and the warm start is the 62 creators already credited in the
  library. **This is business development before it is code.**
- **Leagues.** [UDisc Leagues is free](https://udisc.com/f/leagues) — their
  acquisition funnel — so do not sell league software. The unmet need is that
  local TDs and weekly organisers have no way to take money except Venmo and
  cash, and Disc Golf Scene does registration but not weeklies. Taking 3–5% of
  dues monetises money already changing hands. **Needs density in one
  geography first**; 142 players across 48 states is not a league.
- **Sponsored training paths — and this one is a deliberate refusal.** It is
  free money and it breaks the rule that `youtube_channel` names *who you learn
  from*. The moment a player suspects a path exists because someone paid for
  it, the library stops being the asset that makes everything above work.
  Sponsor the events and the promo site; leave the curriculum alone.
