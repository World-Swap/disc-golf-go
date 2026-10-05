// src/modules/tournament/hole-layout.ts — the fixed character of a tournament
// hole: its wind, the trees off the tee, and the hazard by the green.
//
// WHY THIS IS ON THE SERVER. The game can derive all of this on the client
// from a seed, and that is what a quick round does. A tournament cannot: the
// whole field is ranked on one course, so if the conditions were derived from
// code, a deploy in the middle of a week would silently hand later players a
// different hole from earlier ones, and nobody would be able to tell. Drawing
// the layout once when the tournament row is created and storing it is what
// makes "everyone played the same hole" a fact about the database rather than
// a hope about the deploy schedule.
//
// What is NOT fixed here is the trees you face on your SECOND shot and after.
// Those depend on where your own drive finished, which is the point of a golf
// hole; the field shares the tee, not the lie it earns.

/** Deterministic, so a layout can be regenerated and asserted in a test. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  h ^= h >>> 16; h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export interface Tree { x: number; y: number; r: number }
export interface Hazard { x: number; y: number; r: number }
export interface HoleLayout {
  /** +1 straight into the player's face, -1 straight behind. */
  wind: { head: number; cross: number; strength: number };
  /** Trees between the tee and the basket, in feet in the throw's own frame. */
  trees: Tree[];
  /** A penalty area near the green, or null on the holes that have none. */
  hazard: Hazard | null;
}

export const HAZARD_CHANCE = 0.25;
export const HAZARD_RADIUS = 30;      // feet, as asked for

/**
 * One hole's fixed features. `distance` is the hole's length in feet, which
 * decides how wide the tree corridor is — a 200ft hole cannot have trees 150ft
 * off the line, there is no hole out there.
 */
export function buildHoleLayout(seedKey: string, distance: number): HoleLayout {
  const rnd = mulberry32(hash(seedKey));

  // About a third of holes are calm. Wind on every hole stops being something
  // you read and becomes noise.
  const a = rnd(), b = rnd();
  const strength = a < 0.34 ? 0 : (a - 0.34) / 0.66;
  const theta = b * Math.PI * 2;
  const wind = {
    head: Math.cos(theta) * strength,
    cross: Math.sin(theta) * strength,
    strength,
  };

  // One to four trees, evenly likely. Spread over distinct bands of the hole
  // so four of them cannot stack into a wall across one line.
  const n = 1 + Math.floor(rnd() * 4);
  const trees: Tree[] = [];
  const span = Math.min(150, distance * 0.46);
  for (let i = 0; i < n; i++) {
    const band = (i + rnd() * 0.9) / n;                 // its own slice of the hole
    trees.push({
      y: distance * (0.26 + band * 0.48),
      x: (rnd() - 0.5) * 2 * span,
      r: 15 + rnd() * 11,
    });
  }

  // A hazard by the green on a quarter of holes: 30ft across, somewhere in
  // the 35-110ft ring around the basket, so it is a real risk on the approach
  // without ever sitting on top of the pin.
  let hazard: Hazard | null = null;
  if (rnd() < HAZARD_CHANCE) {
    const ring = 35 + rnd() * 75;
    const bearing = (rnd() - 0.5) * 2.4;                // mostly short of the pin
    hazard = {
      y: ring * Math.cos(bearing),
      x: ring * Math.sin(bearing),
      r: HAZARD_RADIUS,
    };
  }

  return { wind, trees, hazard };
}

/** Every hole of a tournament, fixed at the moment the tournament is created. */
export function buildTournamentLayout(
  kind: string, weekKey: string, courseId: number | null, holes: number,
  holeDistances: number[]
): HoleLayout[] {
  const out: HoleLayout[] = [];
  for (let h = 1; h <= holes; h++) {
    const dist = holeDistances[h - 1] ?? 320;
    out.push(buildHoleLayout(`${kind}:${weekKey}:${courseId ?? 'x'}:h${h}`, dist));
  }
  return out;
}
