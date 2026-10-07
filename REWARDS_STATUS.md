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

**In person, and only in person.** There is no online checkout and nothing to
type a code into:

- **Tournament entry** — the player shows the code to the TD when registering.
  Registration runs on Disc Golf Scene, which we do not control, so the TD takes
  the $5 off by hand.
- **Merchandise** — shown over the counter at a Disc Golf Go event.
- **Online** — not yet. When the store goes live, the catalogue's `terms` and the
  coupon email get the online path added, and the test that forbids the word
  "online" in either (`admin-overview.test.ts`) is deleted in the same change.
  Not before: a coupon's terms are **denormalised onto its row at issue time**,
  so a coupon issued today promising online redemption keeps promising it for
  six months.

**The staff surface is the admin page, not a separate staff page.** `/admin` →
**Coupons** shows, computed from the real tables rather than from any stored
counter:

- what is outstanding, used, expired and unclaimed, in both counts and dollars;
- every player with training progress, their coupons available / used / expired,
  and the entitlement they have earned but not yet claimed;
- every code ever issued, with who holds it and its live status;
- a lookup for one or two codes that says what each is worth and whether it is
  live, and marks them used — one, or two of the same kind as a stack.

Marking used is irreversible and confirms with the code in the prompt, which is
the one thing the person at the counter can check against the paper coupon.

Two rules the console enforces because the server does, shown on the page rather
than taught by a refusal: at most **2 codes** on one purchase, and they must be
the **same kind** — $5 off merchandise and $5 off an entry fee do not both apply
to one merchandise purchase. A stack is **all-or-nothing in one transaction**: a
pair containing an expired code is refused with the good code left unspent.

What this honestly does not enforce: the server has no concept of a "visit", so
it cannot stop two separate single redemptions a minute apart. The batch limit
binds the flow staff actually use for stacking; the rest is a counter policy the
terms state.

---

## Open — in the order it should be done

### 1. Write the TD procedure for the first event.
This is the last thing between here and switching it on, and it is a document
rather than code. Coupons are honoured **in person**: entries are taken by a TD
on Disc Golf Scene, which we do not control, so the TD takes $5 off by hand and
the code is then marked used in the admin console. What needs writing, before
the first event rather than during it: who marks the code used and when, what to
do when a player presents a code the console says is expired or already used
(refuse, and the console says which), and that two coupons of the **same kind**
go on one purchase and the console applies both or neither.

### 2. Then flip `REWARDS_ENABLED`.
Ideally with **one event as a pilot** rather than opening it to all 141 players
at once.

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
