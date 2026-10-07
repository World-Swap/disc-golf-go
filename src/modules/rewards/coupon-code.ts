// src/modules/rewards/coupon-code.ts — generating and formatting coupon codes.
//
// A coupon code is a BEARER INSTRUMENT: whoever reads it out at a counter gets
// the discount. That drives every decision here.
//
//   * Crypto-random, never sequential. A guessable or enumerable code is a free
//     coupon for anyone who can count.
//   * An unambiguous alphabet. These get read aloud across a table, written on
//     paper and typed by someone who did not generate them, so 0/O, 1/I/L and
//     5/S are removed outright rather than hoped about.
//   * Normalised on input. Someone WILL type it lowercase, with the dashes in
//     the wrong place, or with a leading space; none of that should be a
//     failed redemption at a tournament desk.

import { randomInt } from 'node:crypto';

/** Crockford-ish: no 0/O, 1/I/L, 5/S, 8/B, U (reads as V handwritten). */
const ALPHABET = '23467ACDEFGHJKMNPQRTVWXY';

const GROUPS = 3;
const GROUP_LEN = 4;

/** How long a coupon is valid. Stated once, used by issuance and display. */
export const COUPON_VALID_MONTHS = 6;

/**
 * e.g. DGG-7K4M-QP2X-HRCD
 *
 * 12 random characters from a 24-letter alphabet is ~55 bits, which is not
 * guessable at any rate a human or a script will manage against a rate-limited
 * endpoint.
 */
export function generateCouponCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g++) {
    let s = '';
    for (let i = 0; i < GROUP_LEN; i++) s += ALPHABET[randomInt(ALPHABET.length)];
    groups.push(s);
  }
  return 'DGG-' + groups.join('-');
}

/**
 * Accept what a human actually types and return the canonical form, or null.
 *
 * Deliberately forgiving about SHAPE (case, dashes, spaces, a typed "DGG"
 * prefix) and deliberately strict about CONTENT: a character outside the
 * alphabet is rejected, never guessed at. The tempting next step is to map
 * lookalikes -- O to Q, 1 to J -- but a coupon is a bearer instrument, and a
 * substitution that turns one person's typo into somebody else's valid code
 * hands out a discount to the wrong person. The alphabet already excludes every
 * lookalike, so a correctly-read code never contains one; "that is not a valid
 * code, check the characters" is the right answer to a misread.
 */
export function normaliseCouponCode(input: string): string | null {
  if (typeof input !== 'string') return null;
  let s = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.startsWith('DGG')) s = s.slice(3);

  if (s.length !== GROUPS * GROUP_LEN) return null;
  if (![...s].every((c) => ALPHABET.includes(c))) return null;

  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g++) groups.push(s.slice(g * GROUP_LEN, (g + 1) * GROUP_LEN));
  return 'DGG-' + groups.join('-');
}

/**
 * The moment a coupon issued at `issuedAt` stops being valid.
 *
 * Clamped to the end of the target month, because setMonth() does not do what
 * you want at a month boundary: August 31 plus six months is "February 31",
 * which JavaScript rolls forward to March 3, quietly giving that coupon three
 * extra days of life. A coupon is money, so the boundary is handled rather
 * than inherited.
 */
export function couponExpiryFrom(issuedAt: Date): Date {
  const d = new Date(issuedAt);
  const day = d.getDate();
  d.setDate(1); // never let the day overflow while the month is being changed
  d.setMonth(d.getMonth() + COUPON_VALID_MONTHS);
  const lastDayOfTarget = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDayOfTarget));
  return d;
}
