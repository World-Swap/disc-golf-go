// src/modules/courses/live.test.ts — guards on live course lookup.
//
// The things pinned here are the ones that would be wrong quietly: a tee or a
// pro shop listed as a course, two sources showing the same course twice, and
// an unreachable map server emptying the page instead of falling back.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createLiveCourses,
  fromOverpass,
  fromNominatim,
  mergeCourses,
  sameCourse,
  nameTokens,
  parseHoles,
  type LiveCourse,
} from './live';

const SRC = readFileSync('src/modules/courses/live.ts', 'utf8');

function course(over: Partial<LiveCourse> = {}): LiveCourse {
  return {
    id: 'osm:node/1',
    name: 'Pioneer Park Disc Golf Course',
    lat: 30.27,
    lon: -97.74,
    distanceM: null,
    holes: 18,
    city: null,
    state: null,
    source: 'overpass',
    osmUrl: null,
    ...over,
  };
}

function fakeFetch(handler: (url: string) => unknown) {
  return (async (url: string | URL) => {
    const out = handler(String(url));
    if (out instanceof Error) throw out;
    return { ok: true, json: async () => out } as unknown as Response;
  }) as unknown as typeof fetch;
}

test('a hole count is taken only when it is a sane number', () => {
  assert.equal(parseHoles('18'), 18);
  assert.equal(parseHoles(9), 9);
  assert.equal(parseHoles('yes'), null);
  assert.equal(parseHoles('0'), null);
  assert.equal(parseHoles('900'), null, 'an absurd hole count was accepted');
  assert.equal(parseHoles(null), null);
});

test('the words in every course name are not what identifies a course', () => {
  // Without dropping these, "Pioneer Park Disc Golf Course" and "Fairview
  // Disc Golf Course" share three tokens and merge into one course.
  const t = nameTokens('Pioneer Park Disc Golf Course');
  assert.ok(t.has('pioneer'));
  for (const noise of ['disc', 'golf', 'course', 'park']) {
    assert.ok(!t.has(noise), `"${noise}" still counts as distinctive`);
  }
});

test('two courses merge only when they are close AND share a real word', () => {
  const a = course({ name: 'Pioneer Park Disc Golf Course' });
  // Same spot, different course: must NOT merge.
  const other = course({ name: 'Fairview Disc Golf Course', lat: 30.2701, lon: -97.7401 });
  assert.equal(sameCourse(a, other), false, 'two different courses at one spot were merged');
  // Same course, named slightly differently, 100m apart: must merge.
  const same = course({ name: 'Pioneer Park DGC', lat: 30.2709, lon: -97.74 });
  assert.equal(sameCourse(a, same), true, 'one course from two sources stayed as two');
  // Same name, miles apart: two real courses that share a name.
  const faraway = course({ name: 'Pioneer Park Disc Golf Course', lat: 30.5, lon: -97.74 });
  assert.equal(sameCourse(a, faraway), false, 'distance was ignored');
});

test('the merge keeps the first source and only fills its gaps', () => {
  const first = course({ name: 'Zilker Disc Golf', holes: null, city: null, source: 'overpass' });
  const second = course({ name: 'Zilker DGC', holes: 18, city: 'Austin', lat: 30.2705, source: 'nominatim' });
  const merged = mergeCourses([[first], [second]]);
  assert.equal(merged.length, 1, 'the same course was listed twice');
  assert.equal(merged[0]!.name, 'Zilker Disc Golf', 'a later source overwrote the winner');
  assert.equal(merged[0]!.holes, 18, 'a gap the winner left blank was not filled');
  assert.equal(merged[0]!.city, 'Austin');
});

test('an unnamed pin is a basket, not a course', async () => {
  const rows = await fromOverpass(
    fakeFetch(() => ({
      elements: [
        { type: 'node', id: 1, lat: 30, lon: -97, tags: { name: 'Real DGC' } },
        { type: 'node', id: 2, lat: 30, lon: -97, tags: {} },
        { type: 'node', id: 3, lat: 30, lon: -97, tags: { name: 'Tee 2 - Long' } },
        { type: 'node', id: 4, lat: 30, lon: -97, tags: { name: 'Chainbangers Pro Shop' } },
      ],
    })),
    30,
    -97,
    40_000
  );
  assert.deepEqual(rows.map((r) => r.name), ['Real DGC'], 'a tee, a shop or an unnamed pin got through');
});

test('a way reports one coordinate, not a polygon', async () => {
  const rows = await fromOverpass(
    fakeFetch(() => ({
      elements: [{ type: 'way', id: 9, center: { lat: 30.5, lon: -97.5 }, tags: { name: 'Mapped DGC' } }],
    })),
    30,
    -97,
    40_000
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.lat, 30.5);
  assert.equal(rows[0]!.osmUrl, 'https://www.openstreetmap.org/way/9');
});

test('free-text results that are not disc golf are dropped', async () => {
  const rows = await fromNominatim(
    fakeFetch(() => [
      { name: 'Nevin Park Disc Golf Course', lat: '35.2', lon: '-80.8', osm_type: 'way', osm_id: 3 },
      // Near a course, about a course, not a course.
      { name: 'Disc Golf Mural', lat: '35.2', lon: '-80.8', osm_type: 'node', osm_id: 4 },
      // A street that merely sits beside one.
      { name: 'Fairway Drive', lat: '35.2', lon: '-80.8', osm_type: 'way', osm_id: 5 },
    ]),
    35.2,
    -80.8,
    40_000
  );
  assert.deepEqual(rows.map((r) => r.name), ['Nevin Park Disc Golf Course']);
});

test('one map server being down never empties the list', async () => {
  const live = createLiveCourses({
    fetchImpl: fakeFetch((url) => {
      if (url.includes('overpass')) throw new Error('HTTP 503');
      return [{ name: 'Zilker Disc Golf', lat: '30.27', lon: '-97.74', osm_type: 'node', osm_id: 1 }];
    }),
    localNearby: async () => [],
  });
  const r = await live.nearby(30.27, -97.74, 40_000);
  assert.equal(r.courses.length, 1, 'a dead provider took the whole list with it');
  const over = r.providers.find((p) => p.name === 'overpass')!;
  assert.equal(over.ok, false);
  assert.match(over.error ?? '', /503/, 'the failure was not reported to the page');
});

test('with every map server down, the local table still answers', async () => {
  const live = createLiveCourses({
    fetchImpl: fakeFetch(() => {
      throw new Error('offline');
    }),
    localNearby: async () => [course({ id: 'db:12', name: 'Harvey Penick DGC', source: 'local' })],
  });
  const r = await live.nearby(30.27, -97.74, 40_000);
  assert.equal(r.courses.length, 1, 'the local floor was skipped when the live sources failed');
  assert.equal(r.courses[0]!.source, 'local');
  assert.equal(r.providers.filter((p) => !p.ok).length, 2);
});

test('results are sorted by distance and clipped to the radius asked for', async () => {
  const live = createLiveCourses({
    fetchImpl: fakeFetch(() => []),
    localNearby: async () => [
      // ~25km out: inside the 40km radius, so it is kept but sorted second.
      course({ id: 'db:1', name: 'Far DGC', lat: 30.5, lon: -97.74, source: 'local' }),
      // ~1km out.
      course({ id: 'db:2', name: 'Near DGC', lat: 30.28, lon: -97.74, source: 'local' }),
      // ~410km out: must be clipped by the radius entirely.
      course({ id: 'db:3', name: 'Miles Away DGC', lat: 34.0, lon: -97.74, source: 'local' }),
    ],
  });
  const r = await live.nearby(30.27, -97.74, 40_000);
  assert.deepEqual(r.courses.map((c) => c.name), ['Near DGC', 'Far DGC'], 'wrong order, or the radius was not applied');
  assert.ok(r.courses[0]!.distanceM! < r.courses[1]!.distanceM!);
});

test('a repeat lookup from a jittering GPS does not re-hit the map servers', async () => {
  let calls = 0;
  const live = createLiveCourses({
    fetchImpl: fakeFetch(() => {
      calls++;
      return [];
    }),
    localNearby: async () => [],
  });
  await live.nearby(30.2701, -97.7401, 40_000);
  const after = calls;
  const second = await live.nearby(30.2709, -97.7409, 40_000);
  assert.equal(second.cached, true, 'a 100m GPS jitter started a fresh fan-out');
  assert.equal(calls, after);
});

test('the live lookup cannot hang the request', () => {
  assert.match(SRC, /new AbortController\(\)/, 'a slow map server can hang the page');
  assert.match(SRC, /signal: ctl\.signal/, 'the abort signal is not passed to fetch');
  assert.match(SRC, /Promise\.allSettled/, 'one provider rejecting now fails the whole lookup');
});

test('the live door uses the same "not a course" rule as the seed', () => {
  // Two copies of this rule is how the first one came to be wrong in nine
  // files; the live path must import it rather than re-implement it.
  assert.match(SRC, /isPlaceholderCourseName/, 'the live path no longer applies the placeholder rule');
  assert.match(SRC, /from '\.\.\/\.\.\/db\/data\/placeholder-names'/, 'the rule was copied rather than imported');
});
