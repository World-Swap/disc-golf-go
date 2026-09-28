// src/db/data/hole-layouts.ts — a stable per-hole layout for every course.
//
// WHAT THIS IS, PLAINLY: these layouts are DERIVED, not surveyed. The course
// data we hold gives only a hole count and a total par (1,520 of 1,536 courses
// are an exact holes x 3, so the totals carry almost no shape of their own).
// Nobody has the real tee-to-basket distances for these courses, so this builds
// a layout that is *consistent and plausible* rather than one that is true.
// Every row it writes carries `source: 'derived'` so a future import of real
// data can tell what it is allowed to overwrite, and so nothing downstream ever
// mistakes it for a survey.
//
// WHY IT EXISTS AT ALL: the game used to fall back to `Math.random()` for a
// hole's length, per page load. That made a course a different course every
// time it was played -- and in the weekly tournament, where everyone is meant
// to be playing ONE course, it quietly gave every player their own layout and
// then ranked them against each other. A derived layout that is the same for
// everybody is worth more than a random one that is the same for nobody.
//
// Determinism is the whole point: the layout is a pure function of the course
// id and the hole number, so it never has to be stored to stay stable, and
// re-running the backfill produces byte-identical rows.

/** One hole as it is written into `courses.hole_details`. */
export interface HoleDetail {
  hole: number;
  par: number;
  distance_ft: number;
  /** Always 'derived' here. Real imported data must say something else. */
  source: 'derived';
}

/**
 * A small deterministic PRNG (mulberry32). Seeded per course AND per hole, so
 * a course's holes do not all share one stream -- otherwise inserting a hole
 * would shift every later hole's length.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mixes two small integers into one well-spread seed. */
function seedFor(courseId: number, hole: number): number {
  return (Math.imul(courseId | 0, 0x9e3779b1) ^ Math.imul(hole | 0, 0x85ebca6b)) >>> 0;
}

/** Feet, by par. Ranges are ordinary US course distances, not championship. */
const LENGTH_BANDS: Record<number, [number, number]> = {
  3: [215, 395],
  4: [400, 640],
  5: [650, 900],
};

/**
 * Which holes get the par upgrades. Real courses do not put every long hole
 * together, so the surplus is spread with a stride rather than applied to the
 * first few holes. The stride is coprime-ish with the hole count so it walks
 * the whole card before repeating.
 */
function upgradeOrder(holes: number, courseId: number): number[] {
  const stride = 5 + (courseId % 3) * 2; // 5, 7 or 9
  const order: number[] = [];
  const seen = new Set<number>();
  let i = courseId % holes;
  for (let k = 0; k < holes * 2 && order.length < holes; k++) {
    if (!seen.has(i)) { seen.add(i); order.push(i); }
    i = (i + stride) % holes;
  }
  // Whatever the stride stepped over, when it shares a factor with the count.
  for (let h = 0; h < holes; h++) if (!seen.has(h)) order.push(h);
  return order;
}

/**
 * Build the whole card. `totalPar` is honoured exactly where it can be: the
 * surplus over a flat par-3 course is spent one stroke at a time, so an 18-hole
 * par-60 course gets six upgraded holes and still totals 60.
 */
export function buildLayout(courseId: number, holes: number, totalPar: number | null): HoleDetail[] {
  const n = Math.max(1, Math.min(Math.floor(holes) || 18, 36));
  const flat = n * 3;
  const target = Number.isFinite(totalPar as number) && (totalPar as number) > 0 ? Math.floor(totalPar as number) : flat;

  // Pars start flat and are raised toward the course's real total. A hole is
  // capped at 5: par 6 exists but is rare enough that inventing one is worse
  // than spreading the strokes wider.
  const pars = new Array<number>(n).fill(3);
  let surplus = Math.max(0, target - flat);
  if (surplus > 0) {
    const order = upgradeOrder(n, courseId);
    // Two passes: everything to par 4 first, then to par 5, so the long holes
    // are spread across the card instead of a few monsters at the front.
    for (const step of [1, 2]) {
      for (const h of order) {
        if (surplus <= 0) break;
        if (pars[h]! === 2 + step) { pars[h]! += 1; surplus -= 1; }
      }
      if (surplus <= 0) break;
    }
  }

  return pars.map((par, idx) => {
    const hole = idx + 1;
    const [lo, hi] = LENGTH_BANDS[par] ?? LENGTH_BANDS[3]!;
    const r = rng(seedFor(courseId, hole));
    r(); // discard the first draw; mulberry32's first value correlates with the seed
    return { hole, par, distance_ft: Math.round(lo + r() * (hi - lo)), source: 'derived' as const };
  });
}
