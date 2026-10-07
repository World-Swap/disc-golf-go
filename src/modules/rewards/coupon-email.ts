// src/modules/rewards/coupon-email.ts — the email a player gets on redemption.
//
// Written to survive being PRINTED, because that is how a coupon is honoured:
// in person -- shown to the TD when registering for a listed event, or over the
// counter for merchandise. So the code is large and monospaced, the terms and
// the expiry date are on the page rather than behind a link, and nothing that
// matters depends on images or CSS loading.
//
// It deliberately does NOT tell anyone to "enter the code at checkout". There is
// no checkout: entries are taken by a TD on Disc Golf Scene and merchandise is
// sold in person. When the online store opens, that line gets added here and in
// the catalogue's terms -- and not before, because a coupon promises whatever
// its terms said at issue time and those terms are denormalised onto the row.

import type { CouponRow } from './rewards.repo';

const fmtDate = (d: Date) =>
  new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

export function couponEmail(coupon: CouponRow, username: string | null) {
  const who = username ? ` ${username}` : '';
  const expires = fmtDate(coupon.expires_at);
  const subject = `Your Disc Golf Go coupon: ${coupon.title}`;

  const text = [
    `Nice work${who} —`,
    ``,
    earnedLine(coupon),
    `  ${coupon.title}`,
    ``,
    `  CODE: ${coupon.code}`,
    ``,
    `${coupon.terms}`,
    ``,
    `Valid until ${expires}.`,
    ``,
    `How to use it:`,
    `  - Show this email -- printed or on your phone -- and we will`,
    `    read the code off it.`,
    `  - Tournament entry: show it to the TD when you register.`,
    `  - Merchandise: show it at a Disc Golf Go event.`,
    ``,
    `You can put 2 coupons of the same kind on one purchase.`,
    ``,
    `One use only, no cash value. The code stops working after ${expires}.`,
    ``,
    `— Disc Golf Go`,
  ].join('\n');

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#F7F4EF;font-family:Inter,-apple-system,Segoe UI,Roboto,sans-serif;color:#202020">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e6e0d8;border-radius:14px;padding:28px">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#2E7D57;font-weight:700">Disc Golf Go</p>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25">${esc(coupon.title)}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5">Nice work${esc(who)} — ${esc(earnedHtml(coupon))}</p>
    <div style="border:2px dashed #FC6414;border-radius:12px;padding:18px;text-align:center;margin:0 0 20px">
      <p style="margin:0 0 6px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#6b6b6b">Your code</p>
      <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:24px;font-weight:700;letter-spacing:.04em">${esc(coupon.code)}</p>
    </div>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.5">${esc(coupon.terms)}</p>
    <p style="margin:0 0 20px;font-size:14px"><strong>Valid until ${esc(expires)}.</strong></p>
    <p style="margin:0 0 6px;font-size:13px;font-weight:700">How to use it</p>
    <ul style="margin:0 0 20px;padding-left:18px;font-size:14px;line-height:1.6">
      <li>Show this email — printed or on your phone — and we will read the code off it.</li>
      <li>Tournament entry: show it to the TD when you register.</li>
      <li>Merchandise: show it at a Disc Golf Go event.</li>
      <li>You can put 2 coupons of the same kind on one purchase.</li>
    </ul>
    <p style="margin:0;font-size:12px;color:#6b6b6b">One use only, no cash value. The code stops working after ${esc(expires)}.</p>
  </div>
</body></html>`;

  return { subject, text, html };
}

/**
 * What the player did to get this, in their own terms.
 *
 * It used to read "You redeemed N gold" -- which, once coupons moved off gold
 * onto lesson completions, printed "You redeemed 0 gold for this" on the one
 * artifact a player keeps and carries to a counter. lessons_at_issue is
 * nullable only because it was added after the first coupons existed, so the
 * fallback says nothing rather than guessing a number.
 */
function earnedLine(c: CouponRow): string {
  return c.lessons_at_issue
    ? `You earned this by completing ${c.lessons_at_issue} training lessons:`
    : `You earned this from your training:`;
}

function earnedHtml(c: CouponRow): string {
  return c.lessons_at_issue
    ? `you earned this by completing ${c.lessons_at_issue} training lessons.`
    : `you earned this from your training.`;
}

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );
}
