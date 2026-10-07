// src/modules/rewards/coupon-email.ts — the email a player gets on redemption.
//
// Written to survive being PRINTED, because that is how a coupon is honoured:
// in person -- shown to the TD when registering for a listed event, or over the
// counter for merchandise. So the code is large and monospaced, the terms and
// the expiry date are on the page rather than behind a link, and nothing that
// matters depends on images or CSS loading.
//
// The two kinds redeem by DIFFERENT routes and the email says which, because
// telling an entry holder to show it at a counter sends them to the wrong place:
//
//   tournament_entry -- Disc Golf Scene takes a discount code at registration,
//     so the player types it in themselves. We add their code to the event
//     beforehand with Max uses 1 and their own email address, so DGS enforces
//     single use and a code that gets shared is useless to anyone else.
//   merch -- shown in person at an event. There is no online store yet; when
//     there is, that route gets added here and in the catalogue's terms, and not
//     before, because terms are denormalised onto the row at issue time.

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
    ...howToText(coupon),
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
      ${howToHtml(coupon).map((l) => `<li>${esc(l)}</li>`).join('')}
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
/**
 * How this particular coupon is redeemed. Kind-specific on purpose: an entry
 * coupon is typed into Disc Golf Scene's registration form by the player, while
 * a merchandise coupon is shown to a person. Giving both sets of instructions to
 * everyone is how somebody turns up at a desk holding a code that was meant to
 * be entered online a week earlier.
 */
function howTo(c: CouponRow): string[] {
  if (c.kind === 'tournament_entry') {
    return [
      'Register for the event on Disc Golf Scene as usual.',
      'Enter this code in the discount code box at registration.',
      'The code only works for the email address on your Disc Golf Go account, so there is no point sharing it.',
      'It comes off the division entry fee only -- not greens, PDGA, TD fees or add-ons.',
      'Up to 2 entry coupons can be combined - reply before you register and we will issue them as a single $10 code.',
    ];
  }
  return [
    'Show this email -- printed or on your phone -- at a Disc Golf Go event.',
    'We read the code off it and take $5 off.',
    'You can put 2 merchandise coupons on one purchase.',
  ];
}

const howToText = (c: CouponRow): string[] => howTo(c).map((l) => `  - ${l}`);
const howToHtml = howTo;

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
