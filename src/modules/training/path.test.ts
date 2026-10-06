import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS, CATEGORIES } from '../../db/data/lessons';
import { ASSESSMENT, categoryWeights, parseAnswers, TOURNAMENT_CATEGORIES } from './assessment';
import { buildPath, DEFAULT_ANSWERS, type Answers } from './path';

const EVENT = { name: 'Boulder Creek Re-Run', startsAt: new Date('2026-12-12T07:30:00-08:00') };
const ans = (over: Partial<Answers> = {}): Answers => ({ ...DEFAULT_ANSWERS, skill: 'intermediate', ...over });

test('the assessment maps onto the real library', async (t) => {
  // A mapping typo does not throw — the weight is just silently dropped and the
  // category never surfaces. Only a test comparing against the real catalogue
  // catches it.
  await t.test('every answer names categories that exist', () => {
    const real = new Set(CATEGORIES.map((c) => c.slug));
    const bad: string[] = [];
    for (const q of ASSESSMENT)
      for (const o of q.options)
        for (const slug of o.categories ?? []) if (!real.has(slug)) bad.push(`${q.key}/${o.value} → ${slug}`);
    assert.deepEqual(bad, []);
  });

  // Found by exactly this check while writing it: `practice` (7 lessons) was
  // reachable from no answer at all, so it could only ever sit at the floor.
  await t.test('every category is reachable from some answer', () => {
    const reachable = new Set<string>([...TOURNAMENT_CATEGORIES, 'getting-started']);
    for (const q of ASSESSMENT)
      for (const o of q.options) for (const slug of o.categories ?? []) reachable.add(slug);
    const unreachable = CATEGORIES.map((c) => c.slug).filter((s) => !reachable.has(s));
    assert.deepEqual(unreachable, [], 'a category no answer reaches can never be recommended');
  });

  // The whole reason goals and weaknesses are asked separately: everyone wants
  // distance, and most players lose more strokes inside 100ft.
  await t.test('a weakness outranks a goal naming a different category', () => {
    const w = categoryWeights(ans({ goals: ['distance'], weakness: ['three_putts'] }));
    assert.ok(w.get('putting')! > w.get('driving')!, 'the stated weakness should lead');
  });

  await t.test('competition content is opt-in, never pushed', () => {
    const off = categoryWeights(ans({ tournament: 'none' }));
    const on = categoryWeights(ans({ tournament: 'registered' }));
    for (const slug of TOURNAMENT_CATEGORIES) {
      if (slug === 'mental-game') continue; // also reachable from a weakness
      assert.equal(off.get(slug), 0.1, `${slug} should sit at the floor for a player not competing`);
      assert.ok(on.get(slug)! > 1, `${slug} should lead for a player who is`);
    }
  });

  // Answers arrive from a request. They only ever SELECT a known option — the
  // same rule the leaderboard metrics follow.
  await t.test('submitted answers are checked against the catalogue', () => {
    assert.equal(parseAnswers({ skill: 'wizard', tournament: 'none' }), null, 'unknown skill is rejected');
    assert.equal(parseAnswers({ skill: 'beginner' }), null, 'a missing required answer is rejected');
    const parsed = parseAnswers({
      skill: 'beginner',
      tournament: 'none',
      goals: ['putting', 'nonsense', 'putting'],
      weakness: 'not-an-array',
    });
    assert.deepEqual(parsed?.goals, ['putting'], 'unknown values dropped, duplicates collapsed');
    assert.deepEqual(parsed?.weakness, [], 'a non-array is not trusted');
  });
});

test('the path answers the player rather than the library order', async (t) => {
  await t.test('two different players get materially different paths', () => {
    const putter = buildPath(ans({ weakness: ['three_putts'] })).lessons.map((l) => l.slug);
    const driver = buildPath(ans({ weakness: ['off_the_tee'] })).lessons.map((l) => l.slug);
    const shared = putter.filter((s) => driver.includes(s));
    assert.ok(shared.length <= 2, `paths should diverge, shared ${shared.length} of ${putter.length}`);
  });

  // The rigid behaviour this feature replaces: everyone starting at lesson one.
  await t.test('an experienced player is not sent to the ground floor', () => {
    const p = buildPath(ans({ skill: 'advanced', weakness: ['one_shot_shape'] }));
    assert.ok(
      !p.lessons.some((l) => l.category_slug === 'getting-started'),
      'a player who shapes shots on purpose should never be shown Getting Started'
    );
    assert.ok(p.lessons.every((l) => l.skill_level !== 'beginner'), 'nor beginner-tagged lessons');
  });

  // Without the cap, one strong answer floods the path and the player's other
  // stated weakness never appears.
  await t.test('no single category can take over the path', () => {
    const p = buildPath(ans({ weakness: ['three_putts', 'blow_up'] }));
    const perCategory = new Map<string, number>();
    for (const l of p.lessons) perCategory.set(l.category_slug, (perCategory.get(l.category_slug) ?? 0) + 1);
    assert.ok(Math.max(...perCategory.values()) <= 3, 'at most three from one category');
    assert.ok(
      p.lessons.some((l) => l.category_slug === 'putting') &&
        p.lessons.some((l) => l.category_slug === 'mental-game'),
      'both stated weaknesses should be represented'
    );
  });

  // Found by playing the real survey through a browser: answering "more
  // distance" and "I'm signed up" returned a path with no driving lesson in it,
  // because the opt-in added three categories above the stated goal.
  await t.test('opting into an event does not crowd out a stated goal', () => {
    const p = buildPath(ans({ goals: ['distance'], weakness: ['three_putts'], tournament: 'registered' }));
    const slugs = p.lessons.map((l) => l.category_slug);
    assert.ok(
      slugs.includes('driving') || slugs.includes('form-technique'),
      'a player who asked for distance should see distance content: ' + slugs.join(', ')
    );
    assert.ok(slugs.includes('putting'), 'and their weakness should still lead');
  });

  await t.test('a lesson already done never comes back', () => {
    const first = buildPath(ans()).lessons.map((l) => l.slug);
    const second = buildPath(ans(), first).lessons.map((l) => l.slug);
    assert.deepEqual(first.filter((s) => second.includes(s)), []);
  });

  // Empty is CORRECT at 100% — the honest answer is that there is nothing left,
  // and the page says so rather than the builder inventing filler.
  await t.test('the path empties only when the library is finished', () => {
    const all = LESSONS.map((l) => l.slug);
    assert.equal(buildPath(ans(), all).lessons.length, 0);
    assert.ok(buildPath(ans(), all.slice(0, all.length - 3)).lessons.length > 0);
  });

  await t.test('every lesson carries a reason the player can recognise', () => {
    for (const l of buildPath(ans({ weakness: ['three_putts'] })).lessons) {
      assert.ok(l.reason && l.reason.length > 10, `${l.slug} has no usable reason`);
    }
  });
});

test('the tournament plan is paced against a real date', async (t) => {
  await t.test('only a player who is actually playing gets one', () => {
    const now = new Date('2026-10-06T12:00:00Z');
    assert.equal(buildPath(ans({ tournament: 'none' }), [], { event: EVENT, now }).tournament, null);
    assert.equal(buildPath(ans({ tournament: 'curious' }), [], { event: EVENT, now }).tournament, null);
    assert.ok(buildPath(ans({ tournament: 'registered' }), [], { event: EVENT, now }).tournament);
  });

  await t.test('with no event there is no plan, however keen the player', () => {
    assert.equal(buildPath(ans({ tournament: 'registered' }), [], { event: null }).tournament, null);
  });

  // ceil said 68 where a person counting 6 Oct → 12 Dec says 67.
  await t.test('the countdown matches how a person counts days', () => {
    const p = buildPath(ans({ tournament: 'registered' }), [], {
      event: EVENT,
      now: new Date('2026-10-06T12:00:00Z'),
    });
    assert.equal(p.tournament!.days_away, 67);
  });

  await t.test('the plan compresses as the event approaches', () => {
    const weeksAt = (days: number) =>
      buildPath(ans({ tournament: 'registered' }), [], {
        event: EVENT,
        now: new Date(EVENT.startsAt.getTime() - days * 86_400_000),
      }).tournament!.weeks.length;
    assert.equal(weeksAt(60), 4);
    assert.equal(weeksAt(21), 3);
    assert.equal(weeksAt(10), 2);
    assert.equal(weeksAt(1), 1);
    assert.equal(weeksAt(0), 1, 'the day of the event still shows a plan, not an empty one');
  });

  await t.test('the plan only draws on competition content', () => {
    const p = buildPath(ans({ tournament: 'registered' }), [], {
      event: EVENT,
      now: new Date('2026-10-06T12:00:00Z'),
    });
    for (const w of p.tournament!.weeks)
      for (const l of w.lessons)
        assert.ok(TOURNAMENT_CATEGORIES.includes(l.category_slug), `${l.slug} is not competition content`);
  });
});
