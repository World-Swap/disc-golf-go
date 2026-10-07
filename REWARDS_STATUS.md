# Rewards — where this stands, and what is left

Written 2026-10-07. **Read `CLAUDE.md`'s Recent changes for the reasoning behind
each decision; this file is the current state and the open list.** It exists
because this repo's own rule is that nothing outside it survives a session.

The feature is **OFF**: `REWARDS_ENABLED` is unset, so `POST /api/rewards/redeem`
answers 503. Nothing can be claimed until that flag is set to `true`.

---

## What the programme is

Players earn **$5 coupons by completing training lessons**. Two kinds — one off
merchandise, one off a tournament entry. A code lasts 6 months and can be used
once.

| Constant | Value | Where |
|---|---|---|
| `LESSONS_PER_COUPON` | **33** | `src/modules/rewards/rewards.catalog.ts` |
| `COUPON_VALUE_USD` | **5** | same |
| `COUPON_VALID_MONTHS` | **6** | `src/modules/rewards/coupon-code.ts` |
| `MAX_COUPONS_PER_WINDOW` | **1** per 30 days | `src/modules/rewards/rewards.service.ts` |
| `MAX_COUPONS_PER_VISIT` | **2** (stacking) | same |
| `REWARDS_ENABLED` | **off** | env |

**Coupons are NOT bought with gold.** They were until 2026-10-07, and that was
the wrong currency: gold has eight sources and the biggest were a GPS check-in
and a Throw Lab round — the two most spoofable paths, and the two the positioning
rules say we do not sell. So the thing the app is for paid for the reward least
and the thing a script can fake paid for it most. Now **only lessons count**;
check-in XP, Throw Lab XP, level gold and referral gold reach the reward path not
at all. Gold still buys shop and vault items. It no longer buys money.

Proved against a real Postgres: **999,999 gold + level 61 + zero lessons is
refused.** A source-level test fails if `redeem()` ever touches gold again.

**It is an entitlement, not a balance.** You cannot un-complete a lesson, so
"spending" them is incoherent. Crossing 33 / 66 / 99 earns one each, counted
against coupons already issued **over all time**, so the same lessons can never
pay twice.

---

## What it actually costs — the numbers that matter

**The content binds, not the cap.** Taking 12 coupons would need
`12 x 33 = 396` lessons; the library holds **163** (134 curated + 29 generated).
So the $60/year cap is a safety net that currently never fires.

| | Coupons | Value |
|---|---|---|
| Curated library (134 lessons) | 4 | **$20** |
| Including generated (163) | 4 | $20 — and **2 lessons from a 5th** |
| A finished player, each year after | ~2.5 | **~$13** |
| The cap allows | 12/yr | $60 — **unreachable** |

A dedicated player therefore earns **$20, paced over four months** by the 1/month
window, then about **$13 a year** from new content (the generator publishes
~7 lessons a month).

> **Do not quote "$60 per account per year" as the cost.** It was quoted that way
> for most of 2026-10-07 and it is three times the real figure. $60 is the
> ceiling on a dial that never gets turned that far.

The "$20 for the library" claim is pinned by a test against the **curated** 134
and drifts upward with generated content — roughly **$5 per 33 new lessons**.

**Decision, 2026-10-07: accept this (option 1).** The alternatives considered and
not taken were an annual re-earnable entitlement (pays for re-watching) and a
lower price (pays more for the same work and breaks the $20 brief). If a finished
player should keep earning, the honest lever is a **second non-spoofable action**
— attending a real event with a TD confirming, or a moderated course review — not
a cheaper coupon.

---

## Anti-abuse, and what each guard actually claims

Everything here is a **price**, not proof. Every client signal is a number the
caller chose; pretending otherwise would be a lie told to ourselves.

| Path | Bound | Note |
|---|---|---|
| Lesson completion | 45s dwell + a resource click + **20/hour** | server clock; first completion only |
| Check-in rewards | **1 a day** | past it a check-in still records, just stops paying |
| Throw Lab | 12 XP-paying rounds a day | the client simulates the physics |
| Referrals | **10 paid** per account | friend's joining bonus is deliberately NOT capped |
| Daily challenge gold | clamped at **6** in code | `player_daily_challenges` denormalises the old rate |
| Redemption | 1 per 30 days | the backstop that does not depend on any of the above |

Exactly-once is enforced by **database constraints**, not arithmetic:
`coupons.code` UNIQUE, `player_level_rewards (player_id, level)` UNIQUE,
`player_game_challenges (player_id, challenge_key, period_key)` UNIQUE.

Both ledgers reconcile to their balances, and no file but
`src/modules/progression/grants.ts` may increment `players.xp` or `players.gold`
— enforced by a source-level test.

---

## How a coupon is honoured

The two kinds redeem by **different routes**, and conflating them sends a player
to the wrong place.

### Tournament entry — a discount code on Disc Golf Scene

Disc Golf Scene's listing editor has **Discount codes → Add a code**, taking
Code, Amount, Percentage, Max uses, Expires on, PDGA and Email. Its own note:
codes *"apply only to the divisional entry fee and do not apply to additional
items"*, which is exactly what the coupon's terms claim about greens, PDGA and
TD fees — so that limit is the site's, not ours, and the terms are accurate.

Before an event, add each live entry coupon as a code. `/admin` → **Coupons** →
**Disc Golf Scene setup** lists them already laid out as that form's fields,
with a Copy fields button. Two of the optional fields carry the security of the
whole scheme and are not optional for us:

- **Max uses: 1** — DGS then enforces single use itself, which makes it the
  guard and this console merely the record. Without it, one code could be
  entered by every registrant.
- **Email: the player's** — ties the code to the account that earned it, so a
  code posted in a group chat is worthless to anyone else. The console flags any
  coupon whose account has no email, because that one cannot be tied down.

Set **Expires on** to the coupon's own expiry so a code cannot outlive it. The
player enters the code themselves at registration; mark it used here once the
entry list shows them.

### Merchandise — in person

Shown at an event, read off the player's phone or a printout, $5 off. There is
no online store. When one opens, that route gets added to the catalogue's terms
and the coupon email deliberately — **not before**, because a coupon's terms are
**denormalised onto its row at issue time**, so a coupon issued today promising
online redemption keeps promising it for six months. `admin-overview.test.ts`
holds merchandise to in-person wording until then.

### Two on one purchase

A player may present **2 coupons of the same kind**. `redeem-together` marks both
used in one transaction — all-or-nothing, so a pair containing an expired code is
refused with the good one left unspent. How the discount is *delivered* differs:
at a counter, take $10 off; on Disc Golf Scene, add a single **$10** code rather
than two $5 ones, because a registration takes one code.

What this honestly does not enforce: the server has no concept of a "visit", so
it cannot stop two separate single redemptions a minute apart. The batch limit
binds the flow staff use for stacking; the rest is counter policy the terms state.

### The staff surface is the admin page

No separate staff page — whoever honours a code is already signed in to `/admin`.
The **Coupons** tab shows, computed from the real tables rather than any stored
counter: what is outstanding, used, expired and unclaimed in counts and dollars;
every player with training progress, their coupons, and the entitlement they have
earned but not claimed; every code ever issued; the Disc Golf Scene setup list;
and a lookup that marks one or two codes used. Marking used is irreversible and
confirms with the code in the prompt — the one thing the person at the counter
can check against the paper coupon.

---

## Open — in the order it should be done

### 1. Do a dry run on the next event before switching it on.
The procedure is written above and the console produces the fields, but it has
never been run against a real Disc Golf Scene listing. Worth proving once, with a
code issued to a test account: add it to the event with Max uses 1 and that
account's email, register with it, confirm DGS takes $5 off the division entry
fee, confirm a second attempt is refused, and confirm a different email cannot
use it. That last check is the one carrying the anti-sharing claim.

### 2. Then flip `REWARDS_ENABLED`.
Ideally with **one event as a pilot** rather than opening it to all 141 players
at once.

**To test it on one account first, do NOT use this flag.** It is global and does
two things: it opens coupon claiming to every account with the lessons, and it
ungates level-up gold — which is *self-healing*, so on their next XP award every
existing player is back-paid for every level they ever reached. That is a
one-way change across the whole player base.

Set **`REWARDS_TEST_PLAYER_IDS`** to a comma-separated list of player ids
instead (Render → the web service → Environment). The whole path — claiming and
level gold — runs for exactly those accounts and everyone else is refused with
a 503. The Coupons tab says *"Test mode"* and names the ids, so the console
cannot look live when it is not. A non-numeric entry is dropped rather than
guessed at, so a typo narrows the list instead of widening it, and the public
`/rewards/catalogue` never carries the ids.

Clear it when the programme opens for real.

**One thing to know before testing: a coupon needs 33 completed lessons**, and
the engagement gate is 20 completions an hour with 45 seconds between opening a
lesson and finishing it — so 33 honestly is a couple of hours spread over days.
For a test, insert the completions directly for the test account rather than
clicking through them.

---

## Also open, unrelated to rewards

- **`scripts/xp-rebalance-backfill.js` is HELD and has never been run.** Since
  coupons stopped running off XP this is a much smaller decision than it was —
  leaderboard position and shop gold only, no money. The script's own header
  says so.
- **`scripts/xp-reconcile.js` is AUTHORISED** and was run against production on
  2026-10-07 (475 XP to three players). Idempotent; re-running is the check. A
  future run reporting more than 0 owed means a new uncredited-bonus path exists.
- **Capacitor 6.2.2 is in the repo and not in anyone's hands.** It fixes a
  critical advisory that matters here because the native shells load the live
  site through `server.url`. It reaches players only through a new signed store
  release, which is manual — see `CLAUDE.md`'s release section.

---

## Production, read 2026-10-07

141 players · 10 hold any gold · 3,600 gold total · top balance 1,830, which is
the owner's own account. No coupon has ever been issued. Gold balances are now
irrelevant to coupons, so the old balances carry no liability.
