// src/modules/courses/live.ts — finding a course from live map data.
//
// The local `courses` table is 1,532 rows that were imported once and have
// been drifting ever since: whole states went missing to an old reseed bug and
// cannot be re-imported from this repo, and nothing adds a course that opened
// last month. For "what can I play near me, right now", that table is the
// wrong source -- so this asks OpenStreetMap, which is the map the whole sport
// already edits, and keeps our table only as the floor.
//
// THE PROVIDER CHAIN, and why there are three of them:
//
//   1. OVERPASS is the right tool: it queries OSM by tag inside a bounding
//      box, so "disc golf courses within 40km" is exactly expressible and
//      comes back with nothing else mixed in.
//   2. NOMINATIM is the fallback, because Overpass is not always reachable --
//      it is unreachable from the build container this was written in, and a
//      feature that only works on one network is not shipped. It is a
//      free-text geocoder rather than a tag query, so it is fuzzier, but
//      measured against a real area it found MORE courses than the strict
//      tag query would: real courses are tagged `leisure=pitch` and
//      `golf_course` as often as `disc_golf_course`, and a free-text search
//      for "disc golf" catches all three.
//   3. THE LOCAL TABLE is last and is never skipped on a failure. A player
//      standing in a car park with no courses on screen does not care which
//      upstream was down; 1,532 rows that might include theirs beats an
//      error message.
//
// Results are merged, not raced: a course both sources know about is one
// course. Dedupe is by position and name together, because the same basket is
// rarely at the same coordinate in two datasets.

import { haversineMeters } from '../../lib/geo';
import { isPlaceholderCourseName } from '../../db/data/placeholder-names';

const USER_AGENT = 'DiscGolfGo/1.0 (+https://discgolfgo.com)';
export const LIVE_TIMEOUT_MS = 7_000;
export const LIVE_CACHE_TTL_MS = 10 * 60_000;
/** Two courses within this distance AND sharing a name token are one course. */
export const DEDUPE_METERS = 400;

export type LiveCourse = {
  /** `osm:<type>/<id>` for a live hit, or `db:<id>` for a local row. */
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Metres from the search point, filled in by the caller. */
  distanceM: number | null;
  holes: number | null;
  city: string | null;
  state: string | null;
  source: 'overpass' | 'nominatim' | 'local';
  /** The OSM page for the feature, so a wrong course can be fixed at source. */
  osmUrl: string | null;
};

type Fetcher = typeof fetch;

async function getJson(fetchImpl: Fetcher, url: string, init: RequestInit = {}): Promise<any> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), LIVE_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      ...init,
      signal: ctl.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'application/json', ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Hole count is a free-text OSM tag; take a number only when it is sane. */
export function parseHoles(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) && n >= 1 && n <= 54 ? n : null;
}

/**
 * Name tokens used for dedupe. Dropping the words that appear in almost every
 * course name is what makes the comparison mean anything: without it
 * "Pioneer Park Disc Golf Course" and "Fairview Disc Golf Course" share three
 * tokens out of four and merge into one course 400m apart.
 */
const NOISE = new Set(['disc', 'golf', 'course', 'dgc', 'the', 'at', 'park', 'and', 'of']);

export function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !NOISE.has(w))
  );
}

/** Same place? Close together AND sharing a distinctive word. */
export function sameCourse(a: LiveCourse, b: LiveCourse): boolean {
  if (haversineMeters(a.lat, a.lon, b.lat, b.lon) > DEDUPE_METERS) return false;
  const ta = nameTokens(a.name);
  const tb = nameTokens(b.name);
  // Neither name has a distinctive word left: fall back to position alone,
  // since two "Disc Golf Course" pins 100m apart really are one course.
  if (!ta.size || !tb.size) return true;
  for (const t of ta) if (tb.has(t)) return true;
  return false;
}

/**
 * Merge provider results in priority order, keeping the first mention of each
 * course. The order of `lists` IS the trust order: an earlier list's name and
 * hole count win.
 */
export function mergeCourses(lists: LiveCourse[][]): LiveCourse[] {
  const out: LiveCourse[] = [];
  for (const list of lists) {
    for (const c of list) {
      const hit = out.find((o) => sameCourse(o, c));
      if (!hit) {
        out.push({ ...c });
        continue;
      }
      // A later source can still fill a gap the winner left blank -- it just
      // cannot overwrite something the winner already knew.
      if (hit.holes === null && c.holes !== null) hit.holes = c.holes;
      if (hit.city === null && c.city) hit.city = c.city;
      if (hit.state === null && c.state) hit.state = c.state;
    }
  }
  return out;
}

function bbox(lat: number, lon: number, radiusM: number) {
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  return { south: lat - dLat, west: lon - dLon, north: lat + dLat, east: lon + dLon };
}

export async function fromOverpass(
  fetchImpl: Fetcher,
  lat: number,
  lon: number,
  radiusM: number
): Promise<LiveCourse[]> {
  const b = bbox(lat, lon, radiusM);
  const area = `${b.south},${b.west},${b.north},${b.east}`;
  // `out center` so a way (a mapped course outline) reports one coordinate
  // rather than its whole polygon.
  const q =
    `[out:json][timeout:20];(` +
    `node["leisure"="disc_golf_course"](${area});` +
    `way["leisure"="disc_golf_course"](${area});` +
    `node["sport"="disc_golf"](${area});` +
    `way["sport"="disc_golf"](${area});` +
    `);out center 60;`;
  const body = await getJson(fetchImpl, 'https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: q }).toString(),
  });
  const els: any[] = Array.isArray(body?.elements) ? body.elements : [];
  return els
    .map((e): LiveCourse | null => {
      const tags = e.tags ?? {};
      const name: string = typeof tags.name === 'string' ? tags.name.trim() : '';
      const plat = e.lat ?? e.center?.lat;
      const plon = e.lon ?? e.center?.lon;
      // An unnamed pin is almost always a single tee or basket rather than a
      // course -- the exact rows the placeholder prune exists to keep out of
      // the local table, so they are not let in through the live door either.
      if (!name || typeof plat !== 'number' || typeof plon !== 'number') return null;
      // The same rule the seed and the boot prune use, so a tee, a basket or
      // a pro shop cannot get into the list through the live door either.
      if (isPlaceholderCourseName(name)) return null;
      return {
        id: `osm:${e.type}/${e.id}`,
        name,
        lat: plat,
        lon: plon,
        distanceM: null,
        holes: parseHoles(tags['disc_golf:holes'] ?? tags.holes),
        city: typeof tags['addr:city'] === 'string' ? tags['addr:city'] : null,
        state: typeof tags['addr:state'] === 'string' ? tags['addr:state'] : null,
        source: 'overpass',
        osmUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
      };
    })
    .filter((c): c is LiveCourse => c !== null);
}

export async function fromNominatim(
  fetchImpl: Fetcher,
  lat: number,
  lon: number,
  radiusM: number
): Promise<LiveCourse[]> {
  const b = bbox(lat, lon, radiusM);
  const url =
    'https://nominatim.openstreetmap.org/search' +
    `?q=${encodeURIComponent('disc golf')}&format=jsonv2&limit=40&bounded=1` +
    `&viewbox=${b.west},${b.north},${b.east},${b.south}&extratags=1&addressdetails=1`;
  const rows: any[] = await getJson(fetchImpl, url);
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r): LiveCourse | null => {
      const name: string = typeof r.name === 'string' && r.name.trim() ? r.name.trim() : '';
      const plat = Number(r.lat);
      const plon = Number(r.lon);
      if (!name || !Number.isFinite(plat) || !Number.isFinite(plon)) return null;
      // Free text, so it can return a disc golf SHOP or a street. Require the
      // name itself to mention disc golf, which is the one thing that makes a
      // free-text hit a course rather than something near one.
      if (!/disc\s*golf|\bdgc\b/i.test(name)) return null;
      if (isPlaceholderCourseName(name)) return null;
      const a = r.address ?? {};
      return {
        id: `osm:${r.osm_type}/${r.osm_id}`,
        name,
        lat: plat,
        lon: plon,
        distanceM: null,
        holes: parseHoles(r.extratags?.['disc_golf:holes'] ?? r.extratags?.holes),
        city: a.city ?? a.town ?? a.village ?? a.hamlet ?? null,
        state: a.state ?? null,
        source: 'nominatim',
        osmUrl: r.osm_type && r.osm_id ? `https://www.openstreetmap.org/${r.osm_type}/${r.osm_id}` : null,
      };
    })
    .filter((c): c is LiveCourse => c !== null);
}

export type LiveLookup = {
  courses: LiveCourse[];
  /** Which providers answered, so the page can say where this came from. */
  providers: Array<{ name: string; ok: boolean; count: number; error?: string }>;
  cached: boolean;
};

export type LiveDeps = {
  fetchImpl?: Fetcher;
  now?: () => number;
  /** The local table, used as the floor under the live sources. */
  localNearby: (lat: number, lon: number, radiusM: number) => Promise<LiveCourse[]>;
};

export function createLiveCourses(deps: LiveDeps) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const cache = new Map<string, { at: number; value: LiveLookup }>();

  return {
    async nearby(lat: number, lon: number, radiusM: number): Promise<LiveLookup> {
      // Round the cache key to ~1km so a phone's jittering GPS does not make
      // every reading a fresh fan-out to the map servers.
      const key = `${lat.toFixed(2)},${lon.toFixed(2)},${Math.round(radiusM / 1000)}`;
      const hit = cache.get(key);
      if (hit && now() - hit.at < LIVE_CACHE_TTL_MS) return { ...hit.value, cached: true };

      const providers: LiveLookup['providers'] = [];
      const lists: LiveCourse[][] = [];

      // The two live sources run together: Nominatim is not merely a fallback
      // for when Overpass is down, it genuinely finds courses Overpass's tag
      // query misses, so asking both and merging beats asking one.
      const [over, nom] = await Promise.allSettled([
        fromOverpass(fetchImpl, lat, lon, radiusM),
        fromNominatim(fetchImpl, lat, lon, radiusM),
      ]);
      for (const [name, r] of [['overpass', over], ['nominatim', nom]] as const) {
        if (r.status === 'fulfilled') {
          providers.push({ name, ok: true, count: r.value.length });
          lists.push(r.value);
        } else {
          const m = r.reason instanceof Error ? r.reason.message : 'failed';
          providers.push({
            name,
            ok: false,
            count: 0,
            error: m.includes('abort') ? 'timed out' : m,
          });
        }
      }

      // The floor. Always consulted, never first: its rows are the stale ones.
      try {
        const local = await deps.localNearby(lat, lon, radiusM);
        providers.push({ name: 'local', ok: true, count: local.length });
        lists.push(local);
      } catch (err) {
        providers.push({
          name: 'local',
          ok: false,
          count: 0,
          error: err instanceof Error ? err.message : 'failed',
        });
      }

      const merged = mergeCourses(lists)
        .map((c) => ({ ...c, distanceM: Math.round(haversineMeters(lat, lon, c.lat, c.lon)) }))
        .filter((c) => c.distanceM! <= radiusM)
        .sort((a, b) => a.distanceM! - b.distanceM!);

      const value: LiveLookup = { courses: merged, providers, cached: false };
      cache.set(key, { at: now(), value });
      return value;
    },
  };
}

export type LiveCoursesService = ReturnType<typeof createLiveCourses>;
