/**
 * scripts/bulk-populate-layouts.js
 *
 * Standalone bulk layout population — no migration system needed.
 * Use: node scripts/bulk-populate-layouts.js
 * Requires DATABASE_URL env var.
 *
 * What it does:
 * - Finds all courses missing course_layouts records
 * - Inserts "Default" layout + course_holes (par=3) for each
 * - Tagged as source_tag='PDGA'
 * - Batch inserts in chunks of 50 for performance
 * - Idempotent (ON CONFLICT DO NOTHING)
 */
'use strict';

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();

  try {
    // ── Audit: count before ─────────────────────────────────────────────
    const { rows: [{ total, with_layout, without }] } = await client.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(cl.id) AS with_layout,
        COUNT(*) - COUNT(cl.id) AS without
      FROM courses c
      LEFT JOIN course_layouts cl ON cl.course_id = c.id
    `);
    console.log(`\n[audit] before: ${total} courses, ${with_layout} have layouts, ${without} missing\n`);

    // ── Fetch courses missing layouts ───────────────────────────────────
    const { rows: courses } = await client.query(`
      SELECT c.id, c.name, c.state, c.holes, c.hole_count
      FROM courses c
      WHERE NOT EXISTS (
        SELECT 1 FROM course_layouts cl WHERE cl.course_id = c.id
      )
      ORDER BY c.state, c.name
    `);
    console.log(`[bulk-populate-layouts] ${courses.length} courses need layouts`);

    let layoutsCreated = 0;
    let holesCreated = 0;
    const errors = [];

    // ── Process in chunks of 50 ──────────────────────────────────────────
    const CHUNK = 50;
    for (let i = 0; i < courses.length; i += CHUNK) {
      const chunk = courses.slice(i, i + CHUNK);
      const chunkNum = Math.floor(i / CHUNK) + 1;
      const totalChunks = Math.ceil(courses.length / CHUNK);
      process.stdout.write(`  chunk ${chunkNum}/${totalChunks} (${chunk.length} courses)... `);

      for (const course of chunk) {
        const holeCount = course.hole_count || course.holes;
        if (!holeCount || holeCount < 1) {
          errors.push(`${course.id} ${course.name}: invalid hole_count=${holeCount}`);
          continue;
        }

        try {
          const { rows: [layout] } = await client.query(`
            INSERT INTO course_layouts (course_id, name, hole_count, is_default, source_tag)
            VALUES ($1, 'Default', $2, TRUE, 'PDGA')
            ON CONFLICT (course_id, name) DO NOTHING
            RETURNING id
          `, [course.id, holeCount]);

          if (!layout) continue;
          layoutsCreated++;

          // Bulk-insert holes
          const holeNumbers = Array.from({ length: holeCount }, (_, n) => n + 1);
          const placeholders = holeNumbers.map((_, idx) => `($1, $${idx + 2}, 3)`).join(', ');
          await client.query(`
            INSERT INTO course_holes (layout_id, hole_number, par)
            VALUES ${placeholders}
            ON CONFLICT (layout_id, hole_number) DO NOTHING
          `, [layout.id, ...holeNumbers]);

          holesCreated += holeCount;
        } catch (err) {
          errors.push(`${course.id} ${course.name}: ${err.message}`);
        }
      }

      console.log('done');
    }

    // ── Audit: count after ─────────────────────────────────────────────
    const { rows: [{ total: t2, with_layout: wl2, without: w2 }] } = await client.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(cl.id) AS with_layout,
        COUNT(*) - COUNT(cl.id) AS without
      FROM courses c
      LEFT JOIN course_layouts cl ON cl.course_id = c.id
    `);
    console.log(`\n[audit] after:  ${t2} courses, ${wl2} have layouts, ${w2} missing`);
    console.log(`\n[result] layouts created: ${layoutsCreated}, holes created: ${holesCreated}`);

    if (errors.length > 0) {
      console.error(`\n[errors] ${errors.length} failures:`);
      errors.slice(0, 20).forEach(e => console.error('  -', e));
      if (errors.length > 20) console.error(`  ... and ${errors.length - 20} more`);
    }

    // ── Verify: no course with known hole count > 0 should have zero layouts ──
    const { rows: orphaned } = await client.query(`
      SELECT c.id, c.name, c.holes, c.hole_count
      FROM courses c
      LEFT JOIN course_layouts cl ON cl.course_id = c.id
      WHERE cl.id IS NULL
        AND COALESCE(c.hole_count, c.holes) > 0
    `);
    if (orphaned.length > 0) {
      console.error(`\n[WARN] ${orphaned.length} courses still missing layouts despite known hole count`);
      orphaned.slice(0, 5).forEach(r => console.error(`  - ${r.id} ${r.name} (holes=${r.holes || r.hole_count})`));
    } else {
      console.log('[verify] all courses with known hole count now have at least one layout');
    }

    // ── Summary by state ───────────────────────────────────────────────
    const { rows: byState } = await client.query(`
      SELECT c.state, COUNT(*) AS still_missing
      FROM courses c
      LEFT JOIN course_layouts cl ON cl.course_id = c.id
      WHERE cl.id IS NULL
      GROUP BY c.state
      ORDER BY COUNT(*) DESC
    `);
    if (byState.length > 0) {
      console.log('\n[remaining gaps by state]:');
      byState.forEach(r => console.log(`  ${r.state}: ${r.still_missing} courses`));
    }

    await client.release();
    await pool.end();
    process.exit(errors.length > 0 ? 1 : 0);
  } catch (err) {
    console.error('[bulk-populate-layouts] Fatal:', err);
    client.release();
    await pool.end();
    process.exit(1);
  }
}

run();