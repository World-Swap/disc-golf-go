// src/db/data/placeholder-names.ts — the one rule for "this isn't a course".
//
// The OSM import (see courses.ts) walked every `sport=disc_golf` feature it
// could find, and OSM tags individual tees and baskets as their own nodes. Those
// came through as courses, so the picker filled up with entries like "Tee 2 -
// Long", "Hole 10 - White", "Basket4", "Disc Golf Course" and "Course 1" — a
// hole designation or a bare category, never a name a player would recognise.
//
// Used in two places, and deliberately only defined here: seedDatabase() filters
// the seed through it so a fresh database never gets these rows, and the boot
// prune in migrate.ts removes any that a past seed already wrote.
//
// Every pattern is anchored at the start of the name, and the ones keyed on a
// number require the digits, so real courses survive: "Hole in the Wall DGC",
// "Beavers Hole DGC", "Tee Time Park", "7 Acre Park DGC", "501 Disc Golf",
// "18 Hole Course at Riverside" and "Chain's Edge - Blue" all pass.
const PLACEHOLDER_PATTERNS: RegExp[] = [
  // A hole / tee / basket designation, with or without a layout or sub-hole
  // suffix: "Hole 1", "Hole2", "Hole 10 - White", "Tee 2 - Long", "Basket4",
  // "Hole 6A". No word boundary after the digits — "6A" would defeat one.
  /^(hole|tee|basket|pin|pad)\s*#?\s*\d+/i,
  // "Course 1", "Hole #7" — a bare label plus a number and nothing else.
  /^(course|layout)\s*#?\s*\d+\s*$/i,
  // The category as a name: "Disc Golf", "Disc Golf Course", "Disc Gulf".
  /^(disc|dics|disk)\s*g[ou]l?f\s*(course|club|park|dgc|area|field|range)?\s*$/i,
  // "Disc Golf Basket #9", "Disc Golf Tee #3".
  /^(disc|dics|disk)\s*g[ou]l?f\s*(hole|tee|basket|pin|pad)\s*#?\s*\d*\s*$/i,
  /^frisbee\s*golf\s*(course)?\s*$/i,
  // "Tee Box #1", "Teepad12" — the tee mapped as its own feature.
  /^tee\s*(box|pad)\s*#?\s*\d*\s*$/i,
  // A tee or basket named by position rather than numbered, at the end of an
  // otherwise real course name: "North Tee", "Walnut Creek DGC 1st Tee",
  // "Disc Golf Course starting tee", "Disk Golf Practice Basket".
  /\b(starting|first|1st|last|final|north|south|east|west|upper|lower|practice|alternate|alt)\s+(tee|basket|pin|pad)s?\s*$/i,
  // Signage and practice equipment, not a course: "BC Disc Golf Course Map",
  // "Disc Golf Map #2", "Disc Golf Net #1".
  /\bmaps?\s*#?\s*\d*\s*$/i,
  /\bnets?\s*#?\s*\d*\s*$/i,
  // "9-Hole Disc Golf Course", "18 hole course" — a hole count, not a name.
  /^\d+\s*-?\s*hole\s*(disc\s*g[ou]l?f)?\s*(course)?\s*$/i,
  // "7 Basket", "7 Tee" — the number leading instead of trailing.
  /^\d+\s*(hole|tee|basket|pin|pad)s?\s*$/i,
  // Practice equipment mapped as a course: "Practice Basket", "Practice hole".
  /^(practice|putting|warm\s?up)\b/i,
  // Nothing but a hole number: "7", "7A", "1st", "12 - 14".
  /^[\d\s\-–.#]+$/,
  /^\d+\s*[a-z]?\s*$/i,
  /^\d+\s*(st|nd|rd|th)\s*$/i,
  // Courses that don't exist yet, e.g. "(PLANNED) Westerman Trails Disc Golf
  // Course (No infrastructure yet exists)" — nothing to play or check in at.
  /^\(?\s*(planned|proposed|future|upcoming|under\s*construction)\b/i,
  /^(unnamed|unknown|untitled|tbd|n\/?a|none|null|test|temp)\b/i,
];

/** True when `name` is a hole/tee designation or bare category, not a course. */
export function isPlaceholderCourseName(name: string | null | undefined): boolean {
  const n = (name ?? '').trim();
  if (!n) return true;
  return PLACEHOLDER_PATTERNS.some((p) => p.test(n));
}
