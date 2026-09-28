import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout } from './hole-layouts';

test('a course plays the same layout every time', async (t) => {
  // The bug this exists to stop: the game used Math.random() for hole length,
  // so a course was a different course on every page load -- and in the
  // tournament, every player got their own layout and was ranked against the
  // others anyway.
  await t.test('the same course and hole always give the same hole', () => {
    const a = buildLayout(2388, 18, 54);
    const b = buildLayout(2388, 18, 54);
    assert.deepEqual(a, b, 'two builds of one course must be identical');
  });

  await t.test('different courses get different layouts', () => {
    const a = buildLayout(11, 18, 54).map((h) => h.distance_ft);
    const b = buildLayout(12, 18, 54).map((h) => h.distance_ft);
    assert.notDeepEqual(a, b, 'every course would otherwise be the same course');
  });

  await t.test('holes within a course differ from one another', () => {
    const lens = buildLayout(500, 18, 54).map((h) => h.distance_ft);
    assert.ok(new Set(lens).size >= 12, `expected varied holes, got ${new Set(lens).size} distinct`);
  });
});

test('the card adds up to the course par', async (t) => {
  await t.test('a flat par-3 course stays flat', () => {
    const l = buildLayout(7, 18, 54);
    assert.equal(l.length, 18);
    assert.equal(l.reduce((a, h) => a + h.par, 0), 54);
    assert.ok(l.every((h) => h.par === 3));
  });

  // Maple Hill, Pyramids, 501 Disc Golf and the other 13 courses whose par is
  // not exactly holes x 3 are the only ones carrying real shape, so the total
  // has to survive exactly or that shape is lost.
  await t.test('a par-60 course totals 60, spread over several holes', () => {
    const l = buildLayout(931, 18, 60);
    assert.equal(l.reduce((a, h) => a + h.par, 0), 60);
    const long = l.filter((h) => h.par > 3);
    assert.equal(long.length, 6, 'six strokes of surplus means six longer holes');
    assert.ok(long.every((h) => h.par === 4), 'spread wide before going deep');
  });

  await t.test('a big surplus goes to par 5 rather than one absurd hole', () => {
    const l = buildLayout(42, 18, 68);       // Nantucket: +14 over a flat card
    assert.equal(l.reduce((a, h) => a + h.par, 0), 68);
    assert.ok(l.every((h) => h.par >= 3 && h.par <= 5), 'no hole outside 3..5');
  });

  await t.test('the long holes are not all bunched at the front', () => {
    const l = buildLayout(931, 18, 60);
    const idx = l.filter((h) => h.par > 3).map((h) => h.hole);
    assert.ok(Math.max(...idx) - Math.min(...idx) >= 8, `bunched: ${idx.join(',')}`);
  });
});

test('every hole is playable', async (t) => {
  // The game rejects a card outside these bounds, and the server revalidates
  // par 2..6 on submit, so a layout that breaks them cannot be scored at all.
  await t.test('par and distance stay inside what the game accepts', () => {
    for (const [id, holes, par] of [[1, 18, 54], [2, 9, 27], [3, 6, 18], [4, 36, 108], [5, 24, 76]] as const) {
      for (const h of buildLayout(id, holes, par)) {
        assert.ok(h.par >= 2 && h.par <= 6, `par ${h.par} is unplayable`);
        assert.ok(h.distance_ft >= 80 && h.distance_ft <= 1100,
          `${h.distance_ft} ft is outside what buildCourse() will accept`);
      }
    }
  });

  await t.test('a longer par means a longer hole', () => {
    const l = buildLayout(77, 18, 63);
    const avg = (p: number) => {
      const xs = l.filter((h) => h.par === p).map((h) => h.distance_ft);
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    };
    assert.ok(avg(4) > avg(3), 'par 4s should out-measure par 3s');
  });

  await t.test('junk course data still produces a playable card', () => {
    for (const [holes, par] of [[0, 0], [18, null], [-5, 54], [9, 3]] as const) {
      const l = buildLayout(1, holes as number, par as number | null);
      assert.ok(l.length >= 1, 'always at least one hole');
      assert.ok(l.every((h) => h.par >= 2 && h.par <= 6 && h.distance_ft > 0));
    }
  });

  // Nothing downstream should ever take these for surveyed distances.
  await t.test('every hole is labelled as derived', () => {
    assert.ok(buildLayout(9, 18, 54).every((h) => h.source === 'derived'));
  });
});
