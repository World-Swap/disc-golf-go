// src/modules/rewards/rewards.service.ts — spend gold, get a coupon, get an email.

import type { Database } from '../../db/types';
import { withTransaction } from '../../db/pool';
import { AppError, badRequest, notFound } from '../../http/errors';
import { sendEmail as defaultSendEmail, type SendEmail } from '../../lib/email';
import { createRewardsRepo, type RewardsRepo, type CouponRow } from './rewards.repo';
import { COUPON_TYPES, couponTypeByKey, REWARDS_ENABLED } from './rewards.catalog';
import { generateCouponCode, normaliseCouponCode, couponExpiryFrom, COUPON_VALID_MONTHS } from './coupon-code';
import { couponEmail } from './coupon-email';

/**
 * A ceiling on what one account can take OUT, regardless of how gold got in.
 *
 * This exists because the gold supply is not trustworthy enough to be the only
 * limit. Check-in gold is uncapped and there are 1,532 courses, so a spoofed
 * GPS track is worth 1,532 x 25 = 38,300 gold -- about 127 of the cheapest
 * coupon, which is real merchandise. Capping EARNING would mean auditing eight
 * separate paths and would still miss the next one; capping REDEMPTION bounds
 * the liability at one place no matter which path the gold came from.
 */
/**
 * How many coupons one account can be ISSUED in a window. This is the real
 * bound on what the programme costs: at 1 a month it is 12 a year, $60 per
 * account, whatever the gold balance says.
 */
export const MAX_COUPONS_PER_WINDOW = 1;
export const COUPON_WINDOW_DAYS = 30;

/**
 * How many coupons can be PRESENTED TOGETHER on one purchase. A different
 * question from the issuance cap above, and worth keeping distinct: issuance is
 * how fast you earn them, stacking is what you may do with the ones you hold.
 * At 1 a month, stacking 2 means saving two months for $10 off.
 *
 * Honest about what this does and does not enforce: `redeemTogether` refuses
 * more than this many codes in one call, and that is the flow staff use to
 * stack. It CANNOT stop two separate single redemptions a minute apart, because
 * the server has no concept of a "visit" -- that half is a counter policy the
 * terms state, not something code can guarantee.
 */
export const MAX_COUPONS_PER_VISIT = 2;

export function createRewardsService({
  db,
  repo = createRewardsRepo(db),
  sendEmail = defaultSendEmail,
  // Injected rather than read from process.env down here, so a test can
  // exercise the money paths without an environment variable, and so the flag
  // is read in exactly one place.
  enabled = REWARDS_ENABLED,
}: {
  db: Database;
  repo?: RewardsRepo;
  sendEmail?: SendEmail;
  enabled?: boolean;
}) {
  return {
    catalogue() {
      return {
        enabled,
        valid_months: COUPON_VALID_MONTHS,
        max_per_window: MAX_COUPONS_PER_WINDOW,
        window_days: COUPON_WINDOW_DAYS,
        max_per_visit: MAX_COUPONS_PER_VISIT,
        coupons: COUPON_TYPES.map((c) => ({
          key: c.key,
          kind: c.kind,
          title: c.title,
          terms: c.terms,
          gold_cost: c.goldCost,
        })),
      };
    },

    async mine(playerId: number) {
      const rows = await repo.listForPlayer(playerId);
      return { coupons: rows.map(view) };
    },

    /** Spend gold for a coupon. The whole thing is one transaction. */
    async redeem(playerId: number, typeKey: string) {
      if (!enabled) throw new AppError(503, 'Coupon redemption is not open yet');
      const type = couponTypeByKey(String(typeKey));
      if (!type) throw badRequest('Unknown coupon');

      const coupon = await withTransaction(db, async (client) => {
        // The lock comes first and everything else happens under it, so two
        // taps cannot both pass the balance check. Same shape as shop.buy().
        const gold = await repo.lockGold(client, playerId);
        if (gold == null) throw notFound('Player not found');
        if (gold < type.goldCost) {
          throw new AppError(400, 'Not enough gold', { have: gold, need: type.goldCost });
        }

        const taken = await repo.countRecent(client, playerId, COUPON_WINDOW_DAYS);
        if (taken >= MAX_COUPONS_PER_WINDOW) {
          const noun = MAX_COUPONS_PER_WINDOW === 1 ? 'coupon' : 'coupons';
          throw new AppError(429, `You can redeem ${MAX_COUPONS_PER_WINDOW} ${noun} every ${COUPON_WINDOW_DAYS} days`, {
            taken,
            window_days: COUPON_WINDOW_DAYS,
          });
        }

        await repo.spendGold(client, playerId, type.goldCost, type.key);

        const issuedAt = new Date();
        // The UNIQUE on code is the real guard; retrying on collision is just
        // politeness. At 24^12 a collision is not expected in this universe,
        // but a coupon that fails to issue AFTER the gold is spent would be.
        let lastErr: unknown;
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            return await repo.insertCoupon(client, {
              code: generateCouponCode(),
              player_id: playerId,
              type_key: type.key,
              kind: type.kind,
              title: type.title,
              terms: type.terms,
              face_value_usd: type.faceValueUsd,
              gold_spent: type.goldCost,
              expires_at: couponExpiryFrom(issuedAt),
            });
          } catch (e) {
            lastErr = e;
            if (!/coupons_code_key|duplicate key/.test(String((e as Error).message))) throw e;
          }
        }
        throw lastErr;
      });

      // Outside the transaction on purpose: a failed email must not roll back a
      // coupon the player has already paid for. It is recorded either way, and
      // visible in the app, so a bounced email is recoverable rather than lost.
      try {
        const p = await repo.playerEmail(playerId);
        if (p?.email) {
          const { subject, text, html } = couponEmail(coupon, p.username);
          await sendEmail({ to: p.email, subject, text, html });
          await repo.markEmailed(coupon.id);
        }
      } catch (e) {
        console.error('[rewards] coupon email failed for', coupon.code, (e as Error).message);
      }

      return { success: true, coupon: view(coupon) };
    },

    /** Staff-side: look a code up without changing anything. */
    async lookup(rawCode: string) {
      const code = normaliseCouponCode(String(rawCode ?? ''));
      if (!code) throw badRequest('That is not a valid coupon code');
      const row = await repo.findByCode(code);
      if (!row) throw notFound('No such coupon');
      return { coupon: view(row) };
    },

    /**
     * Staff-side: redeem several coupons against ONE purchase.
     *
     * Three rules, and each exists for a reason a counter would hit:
     *  - at most MAX_COUPONS_PER_VISIT codes, so the stack cannot be unbounded;
     *  - no duplicate codes in the same call, because scanning the same coupon
     *    twice must not read as two discounts;
     *  - every code must be the same KIND, since $5 off merchandise and $5 off
     *    an entry fee do not both apply to one merchandise purchase.
     *
     * It is all-or-nothing: if the second code is expired or already used, the
     * first is NOT consumed, because a half-applied stack at a busy desk is
     * worse than a refusal.
     */
    async redeemTogether(rawCodes: unknown, note: string) {
      const list = Array.isArray(rawCodes) ? rawCodes : [rawCodes];
      if (list.length === 0) throw badRequest('No coupon codes given');
      if (list.length > MAX_COUPONS_PER_VISIT) {
        throw new AppError(400, `At most ${MAX_COUPONS_PER_VISIT} coupons can be used on one purchase`, {
          max_per_visit: MAX_COUPONS_PER_VISIT,
          given: list.length,
        });
      }
      const codes = list.map((c) => {
        const code = normaliseCouponCode(String(c ?? ''));
        if (!code) throw badRequest('That is not a valid coupon code');
        return code;
      });
      if (new Set(codes).size !== codes.length) {
        throw badRequest('That is the same coupon twice');
      }

      return withTransaction(db, async (client) => {
        const rows = [];
        for (const code of codes) {
          const existing = await repo.findByCode(code, client);
          if (!existing) throw notFound(`No such coupon: ${code}`);
          rows.push(existing);
        }
        const kinds = new Set(rows.map((r) => r.kind));
        if (kinds.size > 1) {
          throw new AppError(400, 'These coupons are for different things and cannot be combined', {
            kinds: [...kinds],
          });
        }
        const redeemed = [];
        for (const code of codes) {
          const row = await repo.markRedeemed(code, String(note ?? '').slice(0, 500), client);
          if (!row) {
            // Throwing rolls the whole stack back -- see all-or-nothing above.
            const ex = rows.find((r) => r.code === code)!;
            if (ex.status === 'redeemed') {
              throw new AppError(409, `Already redeemed: ${code}`, { code, redeemed_at: ex.redeemed_at });
            }
            if (new Date(ex.expires_at) <= new Date()) {
              throw new AppError(410, `Expired: ${code}`, { code, expired_at: ex.expires_at });
            }
            throw new AppError(409, `Cannot be redeemed: ${code}`, { code, status: ex.status });
          }
          redeemed.push(row);
        }
        const totalUsd = redeemed.reduce((t, r) => t + Number(r.face_value_usd ?? 0), 0);
        return { success: true, coupons: redeemed.map(view), total_usd: totalUsd, count: redeemed.length };
      });
    },

    /** Staff-side: mark it used. The WHERE clause is what makes it one-shot. */
    async markRedeemed(rawCode: string, note: string) {
      const code = normaliseCouponCode(String(rawCode ?? ''));
      if (!code) throw badRequest('That is not a valid coupon code');
      const row = await repo.markRedeemed(code, String(note ?? '').slice(0, 500));
      if (row) return { success: true, coupon: view(row) };

      // Nothing updated: say WHY, because "failed" at a tournament desk with a
      // queue behind you is not an answer.
      const existing = await repo.findByCode(code);
      if (!existing) throw notFound('No such coupon');
      if (existing.status === 'redeemed') {
        throw new AppError(409, 'Already redeemed', { redeemed_at: existing.redeemed_at });
      }
      if (new Date(existing.expires_at) <= new Date()) {
        throw new AppError(410, 'This coupon has expired', { expired_at: existing.expires_at });
      }
      throw new AppError(409, 'This coupon cannot be redeemed', { status: existing.status });
    },
  };
}

/**
 * Expiry is computed on READ rather than trusted from the status column, so a
 * lapsed coupon reads as expired the moment it lapses, with no job to run and
 * nothing to drift. markRedeemed enforces the same thing in SQL.
 */
function view(c: CouponRow) {
  const expired = new Date(c.expires_at) <= new Date();
  return {
    code: c.code,
    kind: c.kind,
    title: c.title,
    terms: c.terms,
    gold_spent: c.gold_spent,
    status: c.status === 'issued' && expired ? 'expired' : c.status,
    issued_at: c.issued_at,
    expires_at: c.expires_at,
    redeemed_at: c.redeemed_at,
  };
}

export type RewardsService = ReturnType<typeof createRewardsService>;
