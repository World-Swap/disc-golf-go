import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHoleLayout, buildTournamentLayout, HAZARD_RADIUS } from './hole-layout';

test('one to four trees, evenly likely', () => {
  const counts = [0, 0, 0, 0, 0];
  const N = 20000;
  for (let i = 0; i < N; i++) counts[buildHoleLayout('t:' + i, 320).trees.length]++;
  assert.equal(counts[0], 0, 'every hole has at least one tree');
  for (let n = 1; n <= 4; n++) {
    const pct = (counts[n] / N) * 100;
    assert.ok(Math.abs(pct - 25) < 1.5, `${n} trees was ${pct.toFixed(1)}%, wanted 25%`);
  }
});

test('a quarter of holes carry a hazard, 30ft across and near the green', () => {
  const N = 20000;
  let withHazard = 0, minRing = Infinity, maxRing = 0;
  for (let i = 0; i < N; i++) {
    const h = buildHoleLayout('h:' + i, 320).hazard;
    if (!h) continue;
    withHazard++;
    assert.equal(h.r, HAZARD_RADIUS);
    const ring = Math.hypot(h.x, h.y);
    minRing = Math.min(minRing, ring);
    maxRing = Math.max(maxRing, ring);
  }
  const pct = (withHazard / N) * 100;
  assert.ok(Math.abs(pct - 25) < 1.5, `hazards on ${pct.toFixed(1)}% of holes, wanted 25%`);
  // Near the green, but never sitting on the pin.
  assert.ok(minRing >= 35, `closest hazard was ${minRing.toFixed(0)}ft from the basket`);
  assert.ok(maxRing <= 110, `furthest hazard was ${maxRing.toFixed(0)}ft from the basket`);
});

test('trees take their own band of the hole, so four cannot wall it off', () => {
  for (let i = 0; i < 4000; i++) {
    const t = buildHoleLayout('b:' + i, 400).trees;
    if (t.length < 2) continue;
    const ys = t.map((x) => x.y).sort((a, b) => a - b);
    for (let k = 1; k < ys.length; k++) {
      assert.ok(ys[k]! - ys[k - 1]! > 1, 'two trees stacked at the same distance');
    }
  }
});

test('the same tournament always builds the same holes', () => {
  const a = buildTournamentLayout('weekly', '2026-W41', 11, 18, Array(18).fill(320));
  const b = buildTournamentLayout('weekly', '2026-W41', 11, 18, Array(18).fill(320));
  assert.deepEqual(a, b);
  // And a different period is a different course to play.
  const c = buildTournamentLayout('weekly', '2026-W42', 11, 18, Array(18).fill(320));
  assert.notDeepEqual(a, c);
});

test('the tree corridor is sized to the hole', () => {
  // A 200ft hole cannot have trees 150ft off the line; there is no hole there.
  for (let i = 0; i < 2000; i++) {
    for (const t of buildHoleLayout('s:' + i, 200).trees) {
      assert.ok(Math.abs(t.x) <= Math.min(150, 200 * 0.46) + 0.001);
      assert.ok(t.y > 0 && t.y < 200);
    }
  }
});
