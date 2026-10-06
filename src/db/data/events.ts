// src/db/data/events.ts — the in-person events, for the parts of the APP that
// need them as data (the tournament training plan counts down to a real date).
//
// There is a tension here worth stating, because this repo documents the
// failure it risks more than any other: the same event is also written out in
// web/events.html, and "one event in one place cannot drift from itself".
//
// A static page cannot be read by the path builder, and a date parsed out of
// HTML is worse than a second copy. So there are two copies -- and a test
// (`events-match-the-page` in seo.test.ts) asserts the page and this file agree
// on the name and the start date. Two copies that CANNOT silently disagree are
// safe; two that can are the bug. Change one and the test names the other.
//
// Everything else about an event -- fees, divisions, the registration link, the
// tier -- stays on the page alone, because nothing in the app reads it.

export interface AppEvent {
  /** Must match the <h1> / og:title on web/events.html exactly. */
  name: string;
  /** ISO 8601 with the offset. December at Boulder Creek is PST, so -08:00. */
  startsAt: string;
  url: string;
}

export const EVENTS: AppEvent[] = [
  {
    name: 'Boulder Creek Re-Run',
    startsAt: '2026-12-12T07:30:00-08:00',
    url: 'https://www.discgolfscene.com/BCR',
  },
];

/**
 * The next event still ahead of `now`, or null once they have all gone by.
 * Returning null is deliberate: a plan counting down to a date in the past is
 * worse than no plan, and the page handles the absence.
 */
export function nextEvent(now: Date = new Date()): { name: string; startsAt: Date; url: string } | null {
  const upcoming = EVENTS.map((e) => ({ ...e, startsAt: new Date(e.startsAt) }))
    .filter((e) => e.startsAt.getTime() >= now.getTime())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return upcoming[0] ?? null;
}
