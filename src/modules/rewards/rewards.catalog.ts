// src/modules/rewards/rewards.catalog.ts — what levelling up pays, and what a
// coupon costs. One file, because these are the numbers that will be argued
// about and they should be arguable in one place.
//
// ============================================================================
// THE GOLD COSTS AND DISCOUNT VALUES BELOW ARE PLACEHOLDERS AWAITING SIGN-OFF.
// They are real money once a coupon is honoured, and nobody has agreed them.
// REWARDS_ENABLED is false until they are, so nothing can be issued by
// accident. Set the numbers, then flip the flag.
// ============================================================================
//
// For calibration, measured rather than guessed:
//   * 50 gold a level is the EXISTING GOLD_EVENTS.level_up value, not a new one.
//   * Levels are 125n(n-1) XP, so level 5 = 2,500 and level 15 = 26,250.
//   * After the 2026-10-07 rebalance the whole 134-lesson library is worth
//     25,700 XP, so finishing EVERYTHING lands a player around level 15.
//     That is the realistic ceiling, and it is what the costs below assume:
//     14 level-ups plus milestones is roughly 1,450 gold for a complete player.
//   * A real entry fee, for scale: the Boulder Creek C-tier is $50 am / $65 pro.

/** Nothing is awarded or issued while this is false. */
export const REWARDS_ENABLED = process.env.REWARDS_ENABLED === 'true';

/**
 * Player ids the rewards path is open for even while REWARDS_ENABLED is false.
 *
 * This exists because "turn it on so I can test with my account" and "turn it on
 * for everybody" are different acts, and the global flag only does the second.
 * Flipping REWARDS_ENABLED opens coupon claiming to every account that has the
 * lessons, AND ungates level-up gold -- which is SELF-HEALING, so on their next
 * XP award every existing player is back-paid for every level they ever reached.
 * That is a one-way change across the whole player base, which is not what a
 * test wants to be.
 *
 * Set REWARDS_TEST_PLAYER_IDS to a comma-separated list of ids instead, and the
 * whole path runs for exactly those accounts while everyone else stays refused.
 * A non-numeric entry is dropped rather than guessed at -- a typo must not widen
 * who can take real money out.
 *
 * It is a TEST hatch, not a tier: when the programme opens for real, set
 * REWARDS_ENABLED and clear this.
 */
export const REWARDS_TEST_PLAYER_IDS: ReadonlySet<number> = new Set(
  String(process.env.REWARDS_TEST_PLAYER_IDS ?? '')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
);

/** Is the rewards path open for this player? */
export function rewardsEnabledFor(playerId: number): boolean {
  return REWARDS_ENABLED || REWARDS_TEST_PLAYER_IDS.has(playerId);
}

/** Gold for reaching a level, on top of the flat per-level award. */
export const LEVEL_MILESTONE_BONUS: Record<number, number> = {
  5: 100,
  10: 250,
  15: 500,
  20: 750,
  25: 1000,
};

/** Flat gold for every level gained. Reuses the existing GOLD_EVENTS entry. */
export const LEVEL_UP_GOLD = 50;

/**
 * Every coupon is $5, and the price is derived rather than chosen.
 *
 * The brief was that finishing the whole library should be worth $20. Measured:
 * the 134 lessons are 19,200 XP, the thirteen category bonuses add 6,500, which
 * lands a completionist on LEVEL 14 -- 1,000 gold of level rewards plus 425
 * from training milestones, so 1,425 gold.
 *
 *   1,425 / 4 coupons = 356.25, rounded down to 350.
 *
 * 350 is picked over 300 deliberately. Both give exactly four coupons, but 300
 * leaves 225 gold spare -- most of a fifth -- so a little ordinary play would
 * tip a completionist to $25. 350 leaves 25, which cannot drift anywhere.
 *
 * Note the redemption cap interacts with this: at 3 coupons per 30 days, taking
 * all four out takes two months. That is intended -- it is a reward for a
 * season of training, not a checkout.
 */
export const COUPON_VALUE_USD = 5;

/**
 * Lessons completed per coupon earned.
 *
 * Coupons used to be BOUGHT WITH GOLD, and that was the wrong currency. Gold
 * comes from eight sources, and the biggest of them were a GPS check-in and a
 * Throw Lab round -- the two most spoofable paths in the app, and the two the
 * positioning rules say we do not sell. So the thing the app is for paid for
 * the reward least, and the thing a script can fake paid for it most.
 *
 * Now only lessons earn coupons, and nothing else touches the reward path at
 * all: check-in XP, Throw Lab XP, level gold and referral gold are all now
 * irrelevant to what a player can claim. Gold still exists and still buys
 * shop and vault items; it just no longer buys money.
 *
 * 33 is derived rather than chosen: the brief is that the whole library is worth
 * $20, which is four $5 coupons, and 134 / 33 = 4.06 -- exactly four with two
 * lessons spare. 34 would give 3.9 (three coupons and most of a fourth, which a
 * little ordinary progress would tip over), and 33 leaves a remainder that
 * cannot drift anywhere. Same reasoning that picked 350 gold over 300.
 *
 * It is an ENTITLEMENT, not a balance: you cannot un-complete a lesson, so
 * "spending" them is incoherent. Crossing 33, 66, 99 … earns one each, counted
 * against coupons already issued, so the same lessons can never pay twice.
 */
export const LESSONS_PER_COUPON = 33;

export type CouponKind = 'tournament_entry' | 'merch';

export interface CouponType {
  /** Stable key. Stored on the coupon row; never renamed once issued. */
  key: string;
  kind: CouponKind;
  /** What the player sees, and what gets printed on the coupon. */
  title: string;
  /** The actual concession, in words, because a bare number is not honourable. */
  terms: string;
  /**
   * Lessons that must be COMPLETED to be entitled to one. Not a currency and not
   * gold: see LESSONS_PER_COUPON.
   */
  lessonsRequired: number;
  /** For reporting what outstanding coupons could cost, in whole dollars. */
  faceValueUsd: number;
}

export const COUPON_TYPES: CouponType[] = [
  {
    key: 'merch_5',
    kind: 'merch',
    title: '$5 off merchandise',
    terms: '$5 off merchandise at a Disc Golf Go event. Show this code in person to be honoured. Up to 2 merchandise coupons on one purchase. One use only, no cash value.',
    lessonsRequired: LESSONS_PER_COUPON,
    faceValueUsd: COUPON_VALUE_USD,
  },
  {
    key: 'entry_5',
    kind: 'tournament_entry',
    title: '$5 off a tournament entry',
    terms: '$5 off a Disc Golf Go listed event. Enter this code when you register on Disc Golf Scene. It is tied to your email address and comes off the division entry fee only, not greens, PDGA, TD fees or add-ons. Up to 2 entry coupons can be combined - ask us before you register and we will issue them as a single $10 code. One use only, no cash value.',
    lessonsRequired: LESSONS_PER_COUPON,
    faceValueUsd: COUPON_VALUE_USD,
  },
];

export const couponTypeByKey = (key: string): CouponType | undefined =>
  COUPON_TYPES.find((c) => c.key === key);

/**
 * Total gold owed for having reached `level`, counting every level from 2 up.
 * Expressed as a total rather than a delta on purpose: it is then a pure
 * function of the level, so a player who levelled up while the feature was off,
 * or whose rewards were interrupted half way, settles to the correct amount
 * instead of depending on which events happened to fire.
 */
export function goldOwedForLevel(level: number): number {
  let total = 0;
  for (let n = 2; n <= level; n++) {
    total += LEVEL_UP_GOLD + (LEVEL_MILESTONE_BONUS[n] ?? 0);
  }
  return total;
}
