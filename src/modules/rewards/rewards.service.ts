// src/modules/rewards/rewards.service.ts — finish lessons, earn a coupon, get an email.

import type { Database } from '../../db/types';
import { withTransaction } from '../../db/pool';
import { AppError, badRequest, notFound } from '../../http/errors';
import { sendEmail as defaultSendEmail, type SendEmail } from '../../lib/email';
import { createRewardsRepo, type RewardsRepo, type CouponRow } from './rewards.repo';
import { COUPON_TYPES, couponTypeByKey, REWARDS_ENABLED, REWARDS_TEST_PLAYER_IDS, LESSONS_PER_COUPON } from './rewards.catalog';
import { generateCouponCode, normaliseCouponCode, couponExpiryFrom, COUPON_VALID_MONTHS } from './coupon-code';
import { couponEmail } from './coupon-email';

/**
 * A ceiling on what one account can take OUT, regardless of how gold got in.
 *
 * It was written when coupons were bought with GOLD, and gold had eight sources
 * including a GPS check-in -- so the supply was not trustworthy and this was the
 * only honest bound. Coupons are earned from LESSONS now, which closes that hole
 * at the source, but this cap stays and is still the number that bounds the
 * cost: 1 a month is 12 a year, which is a $60 CEILING -- not what anyone earns.
 * Reaching it needs 12 x LESSONS_PER_COUPON = 396 lessons and the library holds
 * 163, so the CONTENT binds and this cap is a safety net that currently never
 * fires. A player who finishes everything earns $20, paced out over four months
 * by this window, then about $13 a year from new content. Do not quote the $60
 * as the per-account cost; it was quoted that way for most of a day and it is
 * three times the real figure.
 * Capping EARNING alone would mean auditing every path and would still miss the
 * next one; capping REDEMPTION bounds
 * the liability at one place no matter which path the gold came from.
 */
/**
 * How many coupons one account can be ISSUED in a window. This is the real
 * bound on what the programme could cost in the worst case: at 1 a month, 12 a year, $60 per
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
  // Accounts the path is open for while `enabled` is false, so the programme can
  // be exercised end to end on one real account without opening it to everyone.
  testPlayerIds = REWARDS_TEST_PLAYER_IDS,
}: {
  db: Database;
  repo?: RewardsRepo;
  sendEmail?: SendEmail;
  enabled?: boolean;
  testPlayerIds?: ReadonlySet<number>;
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
          lessons_required: c.lessonsRequired,
        })),
      };
    },

    async mine(playerId: number) {
      const rows = await repo.listForPlayer(playerId);
      // The entitlement comes back with the coupons so the page can say where a
      // player stands without a second call -- and so the number it shows is the
      // same one redeem() enforces, rather than the page recomputing it from a
      // lesson count and drifting.
      const prog = await withTransaction(db, async (client) => {
        const lessons = await repo.lessonsCompleted(client, playerId);
        const issued = await repo.countIssuedEver(client, playerId);
        const earned = Math.floor(lessons / LESSONS_PER_COUPON);
        return {
          lessons_completed: lessons,
          lessons_per_coupon: LESSONS_PER_COUPON,
          coupons_earned: earned,
          coupons_issued: issued,
          available: Math.max(earned - issued, 0),
          // Based on EARNED, not issued: with 40 lessons and one coupon earned
          // but unclaimed, (issued + 1) * 33 reads 33 -- a threshold already
          // passed. (earned + 1) * 33 is 66, which is the honest answer, and the
          // two are identical in the only case redeem() uses it (earned == issued).
          next_at: (earned + 1) * LESSONS_PER_COUPON,
        };
      });
      // Whether the path is open FOR THIS PLAYER, which the public catalogue
      // cannot answer: it reports the global flag, so a test account on the
      // hatch would be shown "not open yet" while the server would happily
      // issue it a coupon. This endpoint knows who is asking, so it is the only
      // honest place for the answer.
      const openForMe = enabled || testPlayerIds.has(playerId);
      return { enabled: openForMe, coupons: rows.map(view), progress: prog };
    },

    /** Spend gold for a coupon. The whole thing is one transaction. */
    async redeem(playerId: number, typeKey: string) {
      if (!enabled && !testPlayerIds.has(playerId)) throw new AppError(503, 'Coupon redemption is not open yet');
      const type = couponTypeByKey(String(typeKey));
      if (!type) throw badRequest('Unknown coupon');

      const coupon = await withTransaction(db, async (client) => {
        // The lock comes first and everything else happens under it, so two
        // taps cannot both pass the balance check. Same shape as shop.buy().
        if (!(await repo.lockPlayer(client, playerId))) throw notFound('Player not found');

        // ENTITLEMENT, not a balance. Only lessons earn coupons -- check-in XP,
        // Throw Lab XP, level gold and referral gold now reach this path not at
        // all, which is the whole point of pricing in lessons: the two most
        // spoofable sources in the app can no longer buy money.
        const lessons = await repo.lessonsCompleted(client, playerId);
        const issued = await repo.countIssuedEver(client, playerId);
        const earned = Math.floor(lessons / LESSONS_PER_COUPON);
        if (earned <= issued) {
          const nextAt = (issued + 1) * LESSONS_PER_COUPON;
          const left = nextAt - lessons;
          // Pluralised, because "Complete 1 more lessons" is exactly the slip the
          // "1 coupons every 30 days" message had, and this is the message the
          // player closest to a reward sees.
          throw new AppError(400, `Complete ${left} more ${left === 1 ? 'lesson' : 'lessons'} to earn your next coupon`, {
            lessons_completed: lessons,
            lessons_required: nextAt,
            coupons_earned: earned,
            coupons_issued: issued,
          });
        }

        const taken = await repo.countRecent(client, playerId, COUPON_WINDOW_DAYS);
        if (taken >= MAX_COUPONS_PER_WINDOW) {
          const noun = MAX_COUPONS_PER_WINDOW === 1 ? 'coupon' : 'coupons';
          throw new AppError(429, `You can redeem ${MAX_COUPONS_PER_WINDOW} ${noun} every ${COUPON_WINDOW_DAYS} days`, {
            taken,
            window_days: COUPON_WINDOW_DAYS,
          });
        }

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
              // Zero on every coupon issued since the switch to lesson pricing.
              // The column stays because rows issued under the old gold pricing
              // carry a real number and that history should not be rewritten.
              gold_spent: 0,
              lessons_at_issue: lessons,
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
      // coupon the player has already earned. It is recorded either way, and
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

    /**
     * Everything the admin console's Coupons tab shows, in one call: who holds
     * what, which codes are live, which have been used, and what it has cost.
     *
     * Every figure is derived here from the coupons table and
     * training_completions -- nothing is a stored counter, so none of it can
     * drift from the rows behind it. "available" and "expired" come from
     * couponStatus, the same function that decides what a player sees on
     * /rewards and what the single-code lookup reports at a counter.
     *
     * `unclaimed` is a different thing from `available` and both matter: a
     * coupon that exists and has not been used is AVAILABLE, while an
     * entitlement crossed but never claimed is UNCLAIMED. A player sitting on 40
     * lessons and no coupons has one unclaimed and nothing available.
     */
    async adminOverview() {
      const [rows, lessonCounts] = await Promise.all([
        repo.adminAllCoupons(),
        repo.adminLessonCounts(),
      ]);
      const now = new Date();

      type Acc = {
        player_id: number;
        username: string | null;
        email: string | null;
        lessons: number;
        available: number;
        used: number;
        expired: number;
        voided: number;
        issued: number;
        value_available_usd: number;
        value_used_usd: number;
      };
      const byPlayer = new Map<number, Acc>();
      const blank = (id: number, username: string | null, email: string | null): Acc => ({
        player_id: id, username, email, lessons: 0,
        available: 0, used: 0, expired: 0, voided: 0, issued: 0,
        value_available_usd: 0, value_used_usd: 0,
      });

      // Anyone with lessons is listed even with no coupon yet, because their
      // unclaimed entitlement is the thing worth seeing before it is claimed.
      for (const l of lessonCounts) {
        const a = blank(l.player_id, l.username, l.email);
        a.lessons = l.lessons;
        byPlayer.set(l.player_id, a);
      }

      const coupons = rows.map((c) => {
        const status = couponStatus(c, now);
        let a = byPlayer.get(c.player_id);
        if (!a) {
          a = blank(c.player_id, c.username, c.email);
          byPlayer.set(c.player_id, a);
        }
        // The join is the authority on the name; a lessons-only row may predate it.
        if (c.username) a.username = c.username;
        if (c.email) a.email = c.email;
        a.issued += 1;
        // Every status is named explicitly rather than swept into an `else`.
        // That `else` is what made a VOIDED coupon count as expired here while
        // the summary counted it as neither, so one page showed two numbers that
        // disagreed. A status added later should land in `voided` -- visible and
        // wrong -- rather than silently inflating the expired count.
        if (status === 'issued') {
          a.available += 1;
          a.value_available_usd += c.face_value_usd;
        } else if (status === 'redeemed') {
          a.used += 1;
          a.value_used_usd += c.face_value_usd;
        } else if (status === 'expired') {
          a.expired += 1;
        } else {
          a.voided += 1;
        }
        return {
          code: c.code,
          player_id: c.player_id,
          username: c.username,
          email: c.email,
          kind: c.kind,
          title: c.title,
          face_value_usd: c.face_value_usd,
          lessons_at_issue: c.lessons_at_issue,
          status,
          issued_at: c.issued_at,
          expires_at: c.expires_at,
          redeemed_at: c.redeemed_at,
        };
      });

      const players = [...byPlayer.values()]
        .map((a) => ({
          ...a,
          // Earned over all time, counted against coupons already issued -- the
          // same arithmetic redeem() runs, so this page and the app agree.
          coupons_earned: Math.floor(a.lessons / LESSONS_PER_COUPON),
          unclaimed: Math.max(Math.floor(a.lessons / LESSONS_PER_COUPON) - a.issued, 0),
        }))
        // Most interesting first: who is holding or owed something, then by
        // lessons done. A long tail of players with one lesson sorts last.
        .sort((x, y) =>
          (y.available + y.unclaimed) - (x.available + x.unclaimed) ||
          y.issued - x.issued ||
          y.lessons - x.lessons);

      const sum = (f: (c: (typeof coupons)[number]) => number) => coupons.reduce((n, c) => n + f(c), 0);
      const count = (st: string) => coupons.filter((c) => c.status === st).length;
      return {
        enabled,
        // Admin-only: catalogue() is unauthenticated and must never carry this.
        test_player_ids: [...testPlayerIds],
        lessons_per_coupon: LESSONS_PER_COUPON,
        max_per_window: MAX_COUPONS_PER_WINDOW,
        window_days: COUPON_WINDOW_DAYS,
        max_per_visit: MAX_COUPONS_PER_VISIT,
        summary: {
          issued: coupons.length,
          available: count('issued'),
          used: count('redeemed'),
          expired: count('expired'),
          // Cancelled by staff. Counted apart from expired because they mean
          // different things: one lapsed, the other was taken back.
          voided: count('void'),
          // What is outstanding is the number that matters at a counter: it is
          // money that can still be presented. Used is what it has cost so far.
          value_available_usd: sum((c) => (c.status === 'issued' ? c.face_value_usd : 0)),
          value_used_usd: sum((c) => (c.status === 'redeemed' ? c.face_value_usd : 0)),
          holders: players.filter((p) => p.available > 0).length,
          unclaimed: players.reduce((n, p) => n + p.unclaimed, 0),
        },
        players,
        coupons,
      };
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
export function couponStatus(c: Pick<CouponRow, 'status' | 'expires_at'>, now = new Date()): string {
  return c.status === 'issued' && new Date(c.expires_at) <= now ? 'expired' : c.status;
}

function view(c: CouponRow) {
  return {
    code: c.code,
    kind: c.kind,
    title: c.title,
    terms: c.terms,
    gold_spent: c.gold_spent,
    // The face value is denormalised onto the row at issue time, so an
    // outstanding coupon keeps promising what it promised. Reporting it here
    // means a counter reads the discount off the coupon rather than off the
    // current catalogue -- or, worse, off a hardcoded number in a page.
    face_value_usd: c.face_value_usd,
    status: couponStatus(c),
    issued_at: c.issued_at,
    expires_at: c.expires_at,
    redeemed_at: c.redeemed_at,
  };
}

export type RewardsService = ReturnType<typeof createRewardsService>;
