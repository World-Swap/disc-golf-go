#!/usr/bin/env node
/**
 * scripts/backfill-pdga-ids.js
 *
 * Backfills pdga_course_id (PDGA slug) for all courses in the DB by matching
 * against the PDGA public course directory.
 *
 * Strategy:
 *   1. Fetch all DB courses that don't yet have a pdga_course_id.
 *   2. For each US state represented in our DB, scrape the PDGA public search
 *      (paginated HTML) to get a full list of {name, city, slug} tuples.
 *   3. Fuzzy-match each DB course against PDGA entries using:
 *        - Same city (exact, case-insensitive)
 *        - Name similarity score >= MATCH_THRESHOLD (Jaro-Winkler / token overlap)
 *      Only update when there is exactly one confident match.
 *   4. Print summary: matched / unmatched / ambiguous.
 *
 * Usage:
 *   node scripts/backfill-pdga-ids.js           # dry run — show what would match
 *   node scripts/backfill-pdga-ids.js --apply   # write pdga_course_id to DB
 *   node scripts/backfill-pdga-ids.js --verbose # show all match decisions
 *
 * Rate-limiting: 1 request per 500ms to be polite to pdga.com.
 * The PDGA has ~400 US courses per state on average; we hit 1 page per state.
 * Total requests: ~50 states × (1-8 pages avg) + some individual lookups.
 */

'use strict';

const { Pool } = require('pg');
const fetch = require('node-fetch');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const MATCH_THRESHOLD = 0.70; // minimum similarity score for a confident match
const REQUEST_DELAY_MS = 600; // ms between PDGA HTTP requests
const PDGA_BASE = 'https://www.pdga.com';

// ── State name → PDGA two-letter code mapping ────────────────────────────────
const STATE_CODES = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN',
  'Mississippi': 'MS', 'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE',
  'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC',
  'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK', 'Oregon': 'OR',
  'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA',
  'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
  'District of Columbia': 'DC',
};

// ── Sleep helper ──────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── String normalisation helpers ──────────────────────────────────────────────
function normalize(s) {
  return s
    .toLowerCase()
    .replace(/disc\s*golf(\s*(course|center|park|dgc))?/gi, '')
    .replace(/\bdgc\b/gi, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(s) {
  return new Set(normalize(s).split(' ').filter(Boolean));
}

/**
 * Token-overlap similarity (Jaccard index on word tokens).
 * Fast and effective for course name matching.
 */
function similarity(a, b) {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;
  let intersection = 0;
  for (const t of sa) if (sb.has(t)) intersection++;
  const union = sa.size + sb.size - intersection;
  return intersection / union;
}

/**
 * City match — exact after normalization, or one contains the other.
 * Handles "Manhattan Beach" vs "Manhattan Beach" and edge cases like
 * "San Jose" vs "San José".
 */
function cityMatch(dbCity, pdgaCity) {
  const a = dbCity.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '');
  const b = pdgaCity.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '');
  return a === b || a.includes(b) || b.includes(a);
}

// ── PDGA scraper ──────────────────────────────────────────────────────────────

/**
 * Fetch one page of PDGA results for a state.
 * Returns { courses: [{name, city, slug}], hasNextPage: bool }
 */
async function fetchPdgaStatePage(stateCode, page = 0) {
  const url =
    `${PDGA_BASE}/course-directory/advanced/search` +
    `?field_course_location_administrative_area=${stateCode}` +
    `&field_course_location_country=US` +
    `&order=title&sort=asc` +
    (page > 0 ? `&page=${page}` : '');

  let html;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'DiscGolfGo/1.0 course-data-backfill (+https://discgolfgo.com)',
        'Accept': 'text/html',
      },
      timeout: 15000,
    });
    if (!res.ok) {
      console.warn(`  HTTP ${res.status} for ${stateCode} page ${page}`);
      return { courses: [], hasNextPage: false };
    }
    html = await res.text();
  } catch (err) {
    console.warn(`  Fetch error for ${stateCode} page ${page}: ${err.message}`);
    return { courses: [], hasNextPage: false };
  }

  // Parse course rows from HTML table.
  // Pattern: <a href="/course-directory/course/SLUG">COURSE NAME</a>
  // Followed by city in the same row.
  const courses = [];

  // Extract all course links with their slugs and names
  const linkRe = /href="\/course-directory\/course\/([^"]+)"[^>]*>([^<]+)<\/a>/g;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const slug = m[1].trim();
    const name = m[2].trim();
    if (!slug || !name) continue;
    // Skip navigation/pagination links (they won't have course names)
    if (slug.includes('?') || name.length < 3) continue;
    courses.push({ name, slug, city: null });
  }

  // Now extract city for each course by parsing the table rows more carefully.
  // The HTML table columns are: Course | Est. | City | State | Country | Postal | Holes | Rating
  // We'll parse <tr> rows and pull city from the 3rd <td>
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const stripRe = /<[^>]+>/g;

  const rowsWithCity = [];
  let rowMatch;
  while ((rowMatch = rowRe.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const tds = [];
    let tdMatch;
    tdRe.lastIndex = 0;
    while ((tdMatch = tdRe.exec(rowHtml)) !== null) {
      tds.push(tdMatch[1].replace(stripRe, '').trim());
    }
    if (tds.length >= 3) {
      // tds[0]=course name/link, tds[1]=est year, tds[2]=city, tds[3]=state
      const city = tds[2] || '';
      // Extract href slug from tds[0]
      const slugFromRow = (/<a[^>]+href="\/course-directory\/course\/([^"]+)"/.exec(rowHtml) || [])[1];
      if (slugFromRow && city) {
        rowsWithCity.push({ slug: slugFromRow.trim(), city: city.trim() });
      }
    }
  }

  // Merge city data into course list
  const cityBySlug = {};
  for (const r of rowsWithCity) cityBySlug[r.slug] = r.city;
  for (const c of courses) {
    if (cityBySlug[c.slug]) c.city = cityBySlug[c.slug];
  }

  // Detect next page: look for "next" pagination link
  const hasNextPage = /rel="next"|Go to next page/.test(html);

  return { courses, hasNextPage };
}

/**
 * Scrape all pages for a given state. Returns full array of PDGA course entries.
 */
async function fetchAllCoursesForState(stateCode) {
  const all = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    if (page > 0) await sleep(REQUEST_DELAY_MS);
    const { courses, hasNextPage } = await fetchPdgaStatePage(stateCode, page);
    all.push(...courses);
    hasMore = hasNextPage;
    page++;
    if (page > 20) {
      console.warn(`  Safety limit: stopping at page 20 for ${stateCode}`);
      break;
    }
  }

  return all;
}

// ── Matching logic ────────────────────────────────────────────────────────────

/**
 * Find the best PDGA match for a DB course from a list of PDGA entries.
 * Returns { match, score, reason } or null if no confident match.
 */
function findBestMatch(dbCourse, pdgaEntries) {
  const candidates = pdgaEntries.filter(
    (p) => p.city && cityMatch(dbCourse.city, p.city)
  );

  if (candidates.length === 0) {
    // Try without city filter if no city match found
    // (some courses have slightly different city names in PDGA)
    const withoutCity = pdgaEntries.map((p) => ({
      ...p,
      score: similarity(dbCourse.name, p.name),
      cityMatched: false,
    }));
    const best = withoutCity.sort((a, b) => b.score - a.score)[0];
    if (best && best.score >= 0.85) {
      return { match: best, score: best.score, reason: 'name-only (no city match)' };
    }
    return null;
  }

  const scored = candidates.map((p) => ({
    ...p,
    score: similarity(dbCourse.name, p.name),
    cityMatched: true,
  }));

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  const second = scored[1];

  if (!top || top.score < MATCH_THRESHOLD) return null;

  // Ambiguous: two candidates with very similar scores
  if (second && second.score >= MATCH_THRESHOLD && (top.score - second.score) < 0.15) {
    return { match: null, score: top.score, reason: 'ambiguous', candidates: [top, second] };
  }

  return { match: top, score: top.score, reason: 'exact+city' };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const doApply = args.includes('--apply');
  const verbose = args.includes('--verbose');

  console.log('\n════════════════════════════════════════════════════════');
  console.log(' PDGA Course ID Backfill');
  console.log(` Mode: ${doApply ? 'APPLY (will write to DB)' : 'DRY RUN (read-only)'}`);
  console.log('════════════════════════════════════════════════════════\n');

  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    // 1. Load all DB courses that still need a PDGA ID
    const { rows: dbCourses } = await client.query(`
      SELECT id, name, city, state
      FROM courses
      WHERE pdga_course_id IS NULL
      ORDER BY state, city, name
    `);

    console.log(`DB courses needing PDGA ID: ${dbCourses.length}`);

    if (dbCourses.length === 0) {
      console.log('Nothing to do — all courses already have pdga_course_id.\n');
      return;
    }

    // 2. Group by state
    const byState = {};
    for (const c of dbCourses) {
      if (!byState[c.state]) byState[c.state] = [];
      byState[c.state].push(c);
    }

    const states = Object.keys(byState).sort();
    console.log(`States to process: ${states.join(', ')}\n`);

    // 3. For each state, scrape PDGA + match
    let totalMatched = 0;
    let totalUnmatched = 0;
    let totalAmbiguous = 0;
    const unmatched = [];
    const ambiguous = [];

    for (const stateName of states) {
      const stateCode = STATE_CODES[stateName];
      if (!stateCode) {
        console.warn(`⚠  No state code for "${stateName}" — skipping`);
        const skipped = byState[stateName];
        totalUnmatched += skipped.length;
        for (const c of skipped) unmatched.push({ ...c, reason: 'unknown state' });
        continue;
      }

      const courses = byState[stateName];
      console.log(`\n── ${stateName} (${stateCode}) — ${courses.length} DB course(s) ──`);

      // Scrape PDGA for this state
      const pdgaEntries = await fetchAllCoursesForState(stateCode);
      console.log(`  PDGA entries scraped: ${pdgaEntries.length}`);
      await sleep(REQUEST_DELAY_MS);

      for (const dbCourse of courses) {
        const result = findBestMatch(dbCourse, pdgaEntries);

        if (!result) {
          if (verbose) {
            console.log(`  ✗ UNMATCHED: "${dbCourse.name}" (${dbCourse.city})`);
          }
          totalUnmatched++;
          unmatched.push({ ...dbCourse, reason: 'no match found' });
          continue;
        }

        if (result.match === null) {
          // Ambiguous
          if (verbose) {
            console.log(`  ? AMBIGUOUS: "${dbCourse.name}" (${dbCourse.city})`);
            for (const c of (result.candidates || [])) {
              console.log(`      candidate: "${c.name}" (${c.city}) score=${c.score.toFixed(2)}`);
            }
          }
          totalAmbiguous++;
          ambiguous.push({ ...dbCourse, candidates: result.candidates });
          continue;
        }

        // Confident match
        const pdgaSlug = result.match.slug;
        console.log(`  ✓ MATCH: "${dbCourse.name}" → "${result.match.name}" [${pdgaSlug}] score=${result.score.toFixed(2)} (${result.reason})`);
        totalMatched++;

        if (doApply) {
          await client.query(
            `UPDATE courses SET pdga_course_id = $1, updated_at = NOW() WHERE id = $2`,
            [pdgaSlug, dbCourse.id]
          );
        }
      }
    }

    // 4. Summary
    console.log('\n════════════════════════════════════════════════════════');
    console.log(' SUMMARY');
    console.log('════════════════════════════════════════════════════════');
    console.log(`  ✓ Matched   : ${totalMatched}`);
    console.log(`  ✗ Unmatched : ${totalUnmatched}`);
    console.log(`  ? Ambiguous : ${totalAmbiguous}`);
    console.log(`  Total       : ${dbCourses.length}`);

    if (!doApply && totalMatched > 0) {
      console.log('\n  Run with --apply to write matched IDs to the database.\n');
    }

    if (ambiguous.length > 0) {
      console.log('\n── Ambiguous (needs manual review) ──────────────────────');
      for (const c of ambiguous) {
        console.log(`  "${c.name}" (${c.city}, ${c.state})`);
        for (const cand of (c.candidates || [])) {
          console.log(`    → "${cand.name}" (${cand.city}) score=${cand.score.toFixed(2)} slug=${cand.slug}`);
        }
      }
    }

    if (unmatched.length > 0) {
      console.log('\n── Unmatched (no confident PDGA match found) ────────────');
      for (const c of unmatched) {
        console.log(`  "${c.name}" (${c.city}, ${c.state}) — ${c.reason}`);
      }
    }

    console.log('\n');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
