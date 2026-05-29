#!/usr/bin/env node
/**
 * scripts/refresh-courses.js
 *
 * Standalone utility for updating the course database.
 *
 * Usage:
 *   node scripts/refresh-courses.js            # dry run — print stats only
 *   node scripts/refresh-courses.js --apply    # upsert courses into DB
 *   node scripts/refresh-courses.js --stats    # show current DB stats
 *
 * How to add new courses:
 *   1. Add entries to the COURSES array below.
 *   2. Run with --apply.
 *
 * PDGA Course Directory API:
 *   https://www.pdga.com/course-directory (public CSV export available)
 *   Download the CSV, parse it, and map fields to the schema below.
 *
 * DGCourseReview:
 *   https://www.dgcoursereview.com (HTML scraping — use sparingly,
 *   respect robots.txt, add User-Agent and delays between requests).
 *
 * Fields per course:
 *   name          VARCHAR(200) — required
 *   city          VARCHAR(100) — required
 *   state         VARCHAR(50)  — required (full state name)
 *   lat           FLOAT        — required (decimal degrees, WGS84)
 *   lng           FLOAT        — required (decimal degrees, WGS84)
 *   holes         INTEGER      — default 18
 *   par           INTEGER      — default 54
 *   terrain_type  VARCHAR(50)  — 'wooded' | 'open' | 'mixed' | 'desert' |
 *                                'hilly' | 'water' | 'coastal'
 *   rating        DECIMAL(3,1) — 0.0–10.0 (from DGCR or PDGA star rating)
 *   amenities     OBJECT       — { restrooms, water, pro_shop, parking }
 *   tee_type      VARCHAR(100) — 'concrete' | 'rubber' | 'dirt' | 'turf'
 *   basket_type   VARCHAR(100) — 'DISCatcher' | 'Mach X' | 'various' etc.
 *   status        VARCHAR(20)  — 'active' | 'closed' | 'seasonal'
 *   source        VARCHAR(50)  — 'pdga' | 'dgcr' | 'manual'
 *   pdga_course_id INTEGER     — PDGA numeric course ID (optional)
 */

'use strict';

const { Pool } = require('pg');
const { normalizeState } = require('../lib/normalize-state');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Export it before running this script.');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// ADD NEW COURSES HERE
// (these are applied on top of the seeded data — duplicates are skipped/updated)
// ─────────────────────────────────────────────────────────────────────────────
const NEW_COURSES = [
  // Example:
  // {
  //   name: 'Example Course DGC',
  //   city: 'Example City',
  //   state: 'Example State',
  //   lat: 40.0000,
  //   lng: -100.0000,
  //   holes: 18,
  //   par: 54,
  //   terrain_type: 'wooded',
  //   rating: 8.0,
  //   amenities: { restrooms: true, water: true, pro_shop: false, parking: true },
  //   source: 'pdga',
  //   status: 'active',
  // },
];

// ─────────────────────────────────────────────────────────────────────────────

async function stats(client) {
  const res = await client.query(`
    SELECT
      COUNT(*)                                    AS total_courses,
      COUNT(*) FILTER (WHERE status = 'active')   AS active,
      COUNT(*) FILTER (WHERE status = 'closed')   AS closed,
      COUNT(*) FILTER (WHERE status = 'seasonal') AS seasonal,
      COUNT(DISTINCT state)                        AS states_covered,
      COUNT(*) FILTER (WHERE rating IS NOT NULL)  AS with_rating,
      COUNT(*) FILTER (WHERE terrain_type IS NOT NULL) AS with_terrain,
      ROUND(AVG(rating), 2)                        AS avg_rating,
      MIN(updated_at)                              AS oldest_update,
      MAX(updated_at)                              AS newest_update
    FROM courses
  `);
  const row = res.rows[0];
  console.log('\n── Course Database Stats ────────────────────────────');
  console.log(`  Total courses  : ${row.total_courses}`);
  console.log(`  Active         : ${row.active}`);
  console.log(`  Closed         : ${row.closed}`);
  console.log(`  Seasonal       : ${row.seasonal}`);
  console.log(`  States covered : ${row.states_covered} / 50`);
  console.log(`  With rating    : ${row.with_rating}`);
  console.log(`  With terrain   : ${row.with_terrain}`);
  console.log(`  Avg rating     : ${row.avg_rating}`);
  console.log(`  Oldest update  : ${row.oldest_update}`);
  console.log(`  Newest update  : ${row.newest_update}`);

  const byState = await client.query(`
    SELECT state, COUNT(*) AS n
    FROM courses
    GROUP BY state
    ORDER BY n DESC, state
  `);
  console.log('\n── Courses by State ──────────────────────────────────');
  for (const r of byState.rows) {
    console.log(`  ${r.state.padEnd(25)} ${r.n}`);
  }
  console.log('─────────────────────────────────────────────────────\n');
}

async function apply(client, courses) {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const c of courses) {
    if (!c.name || !c.city || !c.state || !c.lat || !c.lng) {
      console.warn(`  SKIPPED (missing required field): ${JSON.stringify(c)}`);
      skipped++;
      continue;
    }

    const amenities = c.amenities ? JSON.stringify(c.amenities) : '{}';
    // Normalize state abbreviations to full names before insert
    c.state = normalizeState(c.state);
    const result = await client.query(
      `INSERT INTO courses
         (name, city, state, lat, lng, par, holes,
          terrain_type, rating, amenities, tee_type, basket_type,
          source, status, pdga_course_id, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
       ON CONFLICT (name, city, state) DO UPDATE SET
         lat            = EXCLUDED.lat,
         lng            = EXCLUDED.lng,
         par            = EXCLUDED.par,
         holes          = EXCLUDED.holes,
         terrain_type   = COALESCE(EXCLUDED.terrain_type, courses.terrain_type),
         rating         = COALESCE(EXCLUDED.rating,       courses.rating),
         amenities      = EXCLUDED.amenities,
         tee_type       = COALESCE(EXCLUDED.tee_type,     courses.tee_type),
         basket_type    = COALESCE(EXCLUDED.basket_type,  courses.basket_type),
         source         = EXCLUDED.source,
         status         = EXCLUDED.status,
         pdga_course_id = COALESCE(EXCLUDED.pdga_course_id, courses.pdga_course_id),
         updated_at     = NOW()
       RETURNING (xmax = 0) AS was_inserted`,
      [
        c.name, c.city, c.state, c.lat, c.lng,
        c.par ?? 54, c.holes ?? 18,
        c.terrain_type ?? null, c.rating ?? null, amenities,
        c.tee_type ?? null, c.basket_type ?? null,
        c.source ?? 'manual', c.status ?? 'active',
        c.pdga_course_id ?? null,
      ]
    );

    if (result.rows[0].was_inserted) inserted++;
    else updated++;
  }

  return { inserted, updated, skipped };
}

async function main() {
  const args = process.argv.slice(2);
  const doApply = args.includes('--apply');
  const doStats = args.includes('--stats') || doApply;

  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    if (!doApply && !doStats) {
      console.log(`\nDry run — ${NEW_COURSES.length} course(s) staged for upsert.`);
      console.log('Run with --apply to write to the database.');
      console.log('Run with --stats to see current database statistics.\n');
      NEW_COURSES.forEach((c, i) =>
        console.log(`  [${i + 1}] ${c.name} — ${c.city}, ${c.state} (${c.lat}, ${c.lng})`)
      );
      return;
    }

    if (doApply) {
      if (NEW_COURSES.length === 0) {
        console.log('\nNo new courses to apply. Add entries to NEW_COURSES in this script.\n');
      } else {
        console.log(`\nApplying ${NEW_COURSES.length} course(s)...`);
        const { inserted, updated, skipped } = await apply(client, NEW_COURSES);
        console.log(`  ✓ Inserted: ${inserted}`);
        console.log(`  ✓ Updated : ${updated}`);
        if (skipped) console.log(`  ✗ Skipped : ${skipped} (missing required fields)`);
      }
    }

    if (doStats) {
      await stats(client);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
