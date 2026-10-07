// src/modules/rewards/admin-overview.test.ts — what the admin console's Coupons
// tab reports.
//
// This is the only staff surface for coupons: whoever honours one at an event
// reads these buckets. Two things it must not get wrong, and both have a test
// here because both are easy to get wrong in a way nobody notices:
//
//  1. An EXPIRED coupon must never count as available. The rule lives in
//     couponStatus and nowhere else, which is why the summary is computed in JS
//     over the rows rather than counted in SQL -- a second copy of the rule
//     would be free to disagree with the codes printed beside it.
//  2. "Unclaimed" (an entitlement crossed but not taken) and "available" (a
//     coupon that exists and can be presented) are different things, and only
//     the second is money that can walk up to a counter.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRewardsService, couponStatus } from './rewards.service';
import { LESSONS_PER_COUPON } from './rewards.catalog';

const DAY = 86_400_000;
const future = new Date(Date.now() + 30 * DAY);
const past = new Date(Date.now() - DAY);

function coupon(over: Record<string, unknown> = {}) {
  return {
    id: 1, code: 'DGG-AAAA-AAAA', player_id: 1, type_key: 'merch_5', kind: 'merch',
    title: '$5 off merchandise', terms: 'terms', face_value_usd: 5, gold_spent: 0,
    lessons_at_issue: LESSONS_PER_COUPON, status: 'issued',
    issued_at: new Date(), expires_at: future, redeemed_at: null,
    username: 'bob', email: 'bob@example.com',
    ...over,
  };
}

const fakeDb = { async query() { return { rows: [] }; }, async connect() { return { query: async () => ({ rows: [] }), release: () => {} } as never; } } as never;

function svc(coupons: unknown[], lessons: unknown[]) {
  return createRewardsService({
    db: fakeDb,
    repo: {
      async adminAllCoupons() { return coupons; },
      async adminLessonCounts() { return lessons; },
    } as never,
    sendEmail: async () => {},
    enabled: true,
  });
}

test('an expired coupon is never counted as available', async () => {
  // The whole reason the summary is derived rather than counted in SQL: the
  // status COLUMN still reads 'issued' on a lapsed coupon, because expiry is
  // decided on read. Counting the column would overstate what is outstanding
  // and promise money that cannot be presented.
  const rows = [
    coupon({ code: 'DGG-AAAA-AAAA', expires_at: future }),
    coupon({ code: 'DGG-BBBB-BBBB', expires_at: past }),      // status column: 'issued'
    coupon({ code: 'DGG-CCCC-CCCC', status: 'redeemed', redeemed_at: new Date() }),
  ];
  const out = await svc(rows, []).adminOverview();

  assert.equal(out.summary.issued, 3);
  assert.equal(out.summary.available, 1, 'only the unexpired, unused one is available');
  assert.equal(out.summary.used, 1);
  assert.equal(out.summary.expired, 1);
  assert.equal(out.summary.value_available_usd, 5, 'an expired coupon is not outstanding money');
  assert.equal(out.summary.value_used_usd, 5);

  // And the row the page prints agrees with the bucket it was counted in.
  const byCode = new Map(out.coupons.map((c) => [c.code, c.status]));
  assert.equal(byCode.get('DGG-BBBB-BBBB'), 'expired');
  assert.equal(byCode.get('DGG-AAAA-AAAA'), 'issued');
});

test('the page and the counter use ONE definition of expired', () => {
  // couponStatus is shared by view() (what a counter lookup reports) and
  // adminOverview (what the tab counts). Pin both directions so a change to one
  // cannot quietly diverge from the other.
  assert.equal(couponStatus({ status: 'issued', expires_at: future }), 'issued');
  assert.equal(couponStatus({ status: 'issued', expires_at: past }), 'expired');
  assert.equal(couponStatus({ status: 'redeemed', expires_at: past }), 'redeemed',
    'a coupon already honoured stays honoured after its date passes');
});

test('unclaimed entitlement is reported separately from coupons in hand', async () => {
  // A player on two coupons' worth of lessons who has claimed one holds one
  // coupon and is owed one more. Collapsing those into a single number would
  // either overstate what can be presented today or hide what is coming.
  const out = await svc(
    [coupon({ player_id: 7, username: 'ana', lessons_at_issue: LESSONS_PER_COUPON })],
    [{ player_id: 7, username: 'ana', email: 'ana@example.com', lessons: LESSONS_PER_COUPON * 2 }]
  ).adminOverview();

  const ana = out.players.find((p) => p.player_id === 7)!;
  assert.equal(ana.lessons, LESSONS_PER_COUPON * 2);
  assert.equal(ana.coupons_earned, 2);
  assert.equal(ana.issued, 1);
  assert.equal(ana.available, 1, 'one coupon in hand');
  assert.equal(ana.unclaimed, 1, 'one more earned but not taken');
  assert.equal(out.summary.unclaimed, 1);
  assert.equal(out.summary.holders, 1);
});

test('a player with lessons and no coupon is still listed', async () => {
  // They are the ones about to claim, so they are exactly who the tab is for.
  const out = await svc([], [
    { player_id: 3, username: 'cal', email: null, lessons: LESSONS_PER_COUPON },
    { player_id: 4, username: 'dee', email: null, lessons: 1 },
  ]).adminOverview();

  assert.equal(out.players.length, 2);
  assert.equal(out.players[0]!.username, 'cal', 'whoever is owed something sorts first');
  assert.equal(out.players[0]!.unclaimed, 1);
  assert.equal(out.players[1]!.unclaimed, 0);
  assert.equal(out.summary.issued, 0);
});

test('a coupon whose account is gone still appears, with its code', async () => {
  // coupons.player_id carries no foreign key, so deleting an account leaves the
  // coupon behind. It can still be presented on paper, so it must still be
  // findable here -- the join is LEFT for exactly this.
  const out = await svc([coupon({ player_id: 99, username: null, email: null })], []).adminOverview();
  assert.equal(out.coupons.length, 1);
  assert.equal(out.coupons[0]!.code, 'DGG-AAAA-AAAA');
  assert.equal(out.coupons[0]!.username, null);
  assert.equal(out.summary.available, 1);
});

test('the limits the tab prints come from the service, not the page', async () => {
  // The page used to be free to write "2 per visit" in its own copy. If these
  // ever stop being served, the staff-facing rules can drift from the ones the
  // server enforces, and someone at a counter learns the real rule from a refusal.
  const out = await svc([], []).adminOverview();
  const { MAX_COUPONS_PER_WINDOW, COUPON_WINDOW_DAYS, MAX_COUPONS_PER_VISIT } =
    await import('./rewards.service');
  assert.equal(out.lessons_per_coupon, LESSONS_PER_COUPON);
  assert.equal(out.max_per_window, MAX_COUPONS_PER_WINDOW);
  assert.equal(out.window_days, COUPON_WINDOW_DAYS);
  assert.equal(out.max_per_visit, MAX_COUPONS_PER_VISIT);
});

test('each kind names the route it is actually redeemed by', async () => {
  // The two kinds redeem differently and the copy must not blur them:
  //
  //   tournament_entry -- Disc Golf Scene takes a discount code at registration,
  //     so the player enters it. The terms must name that site, or the player
  //     never finds the box to type it into.
  //   merch -- shown in person. There is no online store, so merchandise terms
  //     must not promise buying online. When the store opens, that claim gets
  //     added here deliberately rather than drifting in.
  //
  // This replaces a blanket ban on the word "online", which was right only while
  // BOTH kinds were in person and would now forbid describing the entry route
  // honestly.
  const { COUPON_TYPES } = await import('./rewards.catalog');
  const { couponEmail } = await import('./coupon-email');

  const base = {
    id: 1, code: 'DGG-AAAA-AAAA', player_id: 1, title: 'x', face_value_usd: 5,
    gold_spent: 0, lessons_at_issue: 33, status: 'issued', issued_at: new Date(),
    expires_at: new Date(Date.now() + DAY), redeemed_at: null,
  };

  const entry = COUPON_TYPES.find((t) => t.kind === 'tournament_entry')!;
  const merch = COUPON_TYPES.find((t) => t.kind === 'merch')!;
  assert.ok(entry && merch, 'both kinds must exist');

  assert.match(entry.terms, /Disc Golf Scene/,
    'entry terms must name where the code is entered');
  const entryEmail = couponEmail({ ...base, type_key: entry.key, kind: entry.kind, terms: entry.terms } as never, 'ana');
  assert.match(entryEmail.text, /Disc Golf Scene/);
  assert.match(entryEmail.text, /discount code box/,
    'the email must say where the box is, not just that a code exists');

  // Merchandise: in person only, until there is a store.
  const merchEmail = couponEmail({ ...base, type_key: merch.key, kind: merch.kind, terms: merch.terms } as never, 'ana');
  for (const re of [/\bonline\b/i, /at checkout/i]) {
    assert.ok(!re.test(merch.terms), `merch terms must not match ${re}: ${merch.terms}`);
    assert.ok(!re.test(merchEmail.text), `merch email must not match ${re}`);
  }
  assert.match(merchEmail.text, /in person|at a Disc Golf Go event/i);

  // An entry holder must not be told to show it at a counter, and a merch holder
  // must not be sent to a registration form. Giving everyone both sets of
  // instructions is how somebody turns up at a desk with a code that was meant
  // to be entered online a week earlier.
  assert.ok(!/Disc Golf Scene/.test(merchEmail.text), 'merch email must not mention registration');
  assert.ok(!/show (this email|it) .*(counter|in person)/i.test(entryEmail.text),
    'entry email must not tell the player to show it in person');

  // And neither may quote a gold price: coupons are earned from lessons, so
  // gold_spent is 0 on every row and "you redeemed 0 gold" was what it said.
  for (const e of [entryEmail, merchEmail]) {
    assert.ok(!/\bgold\b/i.test(e.text), 'the email must not mention gold');
    assert.match(e.text, /33 training lessons/);
  }
});

test('the DGS fields a code is set up with are the ones that bind it', async () => {
  // Disc Golf Scene's own discount-code form offers Max uses and Email as
  // OPTIONAL fields. They are the two that carry the security of the scheme:
  // Max uses 1 makes DGS enforce single use, and Email ties the code to the
  // player who earned it, so a code shared in a group chat is worthless to
  // everyone else. The console tells the operator to set both, and the coupon
  // must therefore carry an email to tie it to.
  const page = await import('node:fs').then((fs) =>
    fs.readFileSync('web/admin.html', 'utf8'));
  assert.match(page, /Max uses 1/, 'the console must tell the operator to cap uses at 1');
  assert.match(page, /'Max uses: 1'/, 'the copied field block must carry it too');
  assert.match(page, /Email: ' \+ \(c\.email/, 'the copied block must carry the player email');
});
