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

## Open — in the order it should be done

### 1. There is no staff page. This is the blocker.
`GET /rewards/admin/lookup/:code`, `POST /rewards/admin/redeem` and
`POST /rewards/admin/redeem-together` all exist and are admin-gated, but
**nothing in `web/` calls them**. At an event, honouring a coupon means running
curl. Needed: a page where staff enter or scan a code, see what it is worth and
whether it is live, and mark it used — including the two-code stack.

### 2. The merchandise store does not exist.
A `$5 off merchandise` coupon has no online checkout to apply to, so it is
in-person only. Either say that in the terms, or hold `merch_5` back and ship
only `entry_5` until there is a store.

### 3. Tournament entry discounts have no written process.
Registration is on discgolfscene, which we do not control, so a TD applies the
$5 by hand and then marks the code used. That procedure needs writing before the
first event, not during it.

### 4. The coupon email states expiry but not the stacking rule or "no cash value".
It is the document a player holds at a counter. The coupon `terms` field does
carry the stacking rule (and is denormalised at issue time, so outstanding
coupons keep promising what they promised) — the email should match.

### 5. Then flip `REWARDS_ENABLED`.
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
