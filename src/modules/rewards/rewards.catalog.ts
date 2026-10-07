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

export type CouponKind = 'tournament_entry' | 'merch';

export interface CouponType {
  /** Stable key. Stored on the coupon row; never renamed once issued. */
  key: string;
  kind: CouponKind;
  /** What the player sees, and what gets printed on the coupon. */
  title: string;
  /** The actual concession, in words, because a bare number is not honourable. */
  terms: string;
  goldCost: number;
  /** For reporting what outstanding coupons could cost, in whole dollars. */
  faceValueUsd: number;
}

export const COUPON_TYPES: CouponType[] = [
  {
    key: 'merch_5',
    kind: 'merch',
    title: '$5 off merchandise',
    terms: '$5 off any merchandise purchase, online or at a Disc Golf Go event.',
    goldCost: 300,
    faceValueUsd: 5,
  },
  {
    key: 'merch_10',
    kind: 'merch',
    title: '$10 off merchandise',
    terms: '$10 off a merchandise purchase of $25 or more, online or at an event.',
    goldCost: 550,
    faceValueUsd: 10,
  },
  {
    key: 'entry_10',
    kind: 'tournament_entry',
    title: '$10 off a tournament entry',
    terms: '$10 off the entry fee for any Disc Golf Go listed event. Does not cover greens, PDGA or TD fees.',
    goldCost: 550,
    faceValueUsd: 10,
  },
  {
    key: 'entry_am',
    kind: 'tournament_entry',
    title: 'Amateur tournament entry',
    terms: 'Covers one amateur entry fee at a Disc Golf Go listed event. Does not cover greens, PDGA or TD fees.',
    goldCost: 2000,
    faceValueUsd: 50,
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
