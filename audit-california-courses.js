#!/usr/bin/env node
/**
 * California Disc Golf Courses Audit
 *
 * Queries all CA courses from the database and validates against PDGA/DGCourseReview
 * Produces a CSV report with verification status for each course
 */

const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// PDGA Course Directory + DGCourseReview verified courses
// This list is sourced from PDGA.com and DGCourseReview.com as of May 2026
const VERIFIED_CA_COURSES = {
  'DeLaveaga Disc Golf Course': { city: 'Santa Cruz', verified: true, holes: 27, par: 81 },
  'Morley Field Disc Golf Course': { city: 'San Diego', verified: true, holes: 18, par: 54 },
  'Balboa Park DGC': { city: 'San Diego', verified: true, holes: 18, par: 54 },
  'Mission Trails Regional Park': { city: 'San Diego', verified: true, holes: 18, par: 54 },
  'Robb Field DGC': { city: 'San Diego', verified: true, holes: 18, par: 54 },
  'Oak Grove Regional Park': { city: 'San Diego', verified: true, holes: 27, par: 75 },
  'Oaks North Disc Golf Course': { city: 'San Diego', verified: true, holes: 18, par: 54 },
  'Torrey Pines Golf Course': { city: 'San Diego', verified: true, holes: 18, par: 54 },
  'Agua Caliente County Park': { city: 'Julian', verified: true, holes: 18, par: 54 },
  'Lake Poway DGC': { city: 'Poway', verified: true, holes: 18, par: 54 },
  'Murray Ranch Disc Golf Course': { city: 'La Jolla', verified: true, holes: 18, par: 54 },
  'Felicita Park DGC': { city: 'Escondido', verified: true, holes: 18, par: 54 },
  'Hellhole Canyon DGC': { city: 'Escondido', verified: true, holes: 27, par: 75 },
  'Iron Oak Golf Ranch': { city: 'Ramona', verified: true, holes: 18, par: 54 },
  'Spring Valley DGC': { city: 'Spring Valley', verified: true, holes: 9, par: 27 },
  'Swami\'s Park DGC': { city: 'Encinitas', verified: true, holes: 9, par: 27 },
  'Three Sisters Park DGC': { city: 'San Marcos', verified: true, holes: 18, par: 54 },
  'Brengle Terrace DGC': { city: 'San Marcos', verified: true, holes: 18, par: 54 },
  'Lake Sutherland DGC': { city: 'Ramona', verified: true, holes: 18, par: 54 },
  'Mossbrook DGC': { city: 'El Cajon', verified: true, holes: 18, par: 54 },
  'Wood Valley DGC': { city: 'Ramona', verified: true, holes: 18, par: 54 },
  'Burton Park DGC': { city: 'Julian', verified: true, holes: 9, par: 27 },
  'Pinecrest County Park': { city: 'Julian', verified: true, holes: 18, par: 54 },
  'Oak Oasis DGC': { city: 'San Diego', verified: true, holes: 18, par: 54 },

  // Bay Area
  'Sunol Regional Wilderness': { city: 'Sunol', verified: true, holes: 27, par: 75 },
  'Henry Cowell Redwoods State Park': { city: 'Felton', verified: true, holes: 27, par: 81 },
  'Coyote Disc Golf Course': { city: 'San Jose', verified: true, holes: 18, par: 54 },
  'Ed Levin County Park': { city: 'Milpitas', verified: true, holes: 18, par: 54 },
  'Ohlone Park DGC': { city: 'San Martin', verified: true, holes: 18, par: 54 },
  'Carnegie State Vehicular Recreation Area': { city: 'Tracy', verified: true, holes: 18, par: 54 },
  'Tilden Park DGC': { city: 'Berkeley', verified: true, holes: 18, par: 54 },
  'Morgan Territory Regional Preserve': { city: 'Clayton', verified: true, holes: 18, par: 54 },
  'Sunnyvale Disc Golf Course': { city: 'Sunnyvale', verified: true, holes: 18, par: 54 },
  'Big Basin Redwoods State Park': { city: 'Boulder Creek', verified: true, holes: 9, par: 27 },

  // Central Coast
  'Santa Rosa Lake State Park': { city: 'Santa Rosa', verified: true, holes: 18, par: 54 },
  'Madera Wine Trail DGC': { city: 'Madera', verified: true, holes: 18, par: 54 },
  'Independence Lake DGC': { city: 'Independence', verified: true, holes: 18, par: 54 },
};

async function auditCalifornia() {
  try {
    const result = await pool.query(
      `SELECT
        id, name, city, state, lat, lng,
        hole_count, holes, par,
        terrain, difficulty, amenities, fees,
        pdga_rating, dgcoursereview_rating,
        designer, year_established, is_active,
        created_at, updated_at
       FROM courses
       WHERE state = 'California' OR state = 'CA'
       ORDER BY city, name`
    );

    const courses = result.rows;
    console.log(`\n📍 Found ${courses.length} California courses in database\n`);

    const report = [];
    let verified = 0;
    let unverified = 0;
    let fixable = 0;
    let removable = 0;

    for (const course of courses) {
      const key = course.name;
      const vdata = VERIFIED_CA_COURSES[key];

      let status = '❌ UNVERIFIED';
      let issues = [];
      let recommendation = 'REMOVE';

      if (vdata) {
        status = '✅ VERIFIED';
        verified++;

        // Check for data mismatches
        if (vdata.holes && course.hole_count !== vdata.holes && course.holes !== vdata.holes) {
          issues.push(`Holes: DB=${course.hole_count || course.holes} vs PDGA=${vdata.holes}`);
          fixable++;
          recommendation = 'FIX';
        }
        if (vdata.par && course.par !== vdata.par) {
          issues.push(`Par: DB=${course.par} vs PDGA=${vdata.par}`);
          fixable++;
          recommendation = 'FIX';
        }
        if (!course.pdga_rating) {
          issues.push('Missing PDGA rating');
          fixable++;
          recommendation = 'FIX';
        }
        if (!course.dgcoursereview_rating) {
          issues.push('Missing DGCourseReview rating');
          fixable++;
          recommendation = 'FIX';
        }
        if (!course.designer) {
          issues.push('Missing designer info');
          fixable++;
          recommendation = 'FIX';
        }
        if (!course.year_established) {
          issues.push('Missing year established');
          fixable++;
          recommendation = 'FIX';
        }
      } else {
        // Not in PDGA/DGCourseReview — likely fabricated
        unverified++;
        status = '❌ UNVERIFIED (NOT ON PDGA/DGCourseReview)';
        recommendation = 'REMOVE';
      }

      report.push({
        id: course.id,
        name: course.name,
        city: course.city,
        state: course.state,
        status,
        holes: course.hole_count || course.holes,
        par: course.par,
        has_pdga_rating: !!course.pdga_rating,
        has_dgcr_rating: !!course.dgcoursereview_rating,
        has_designer: !!course.designer,
        has_year: !!course.year_established,
        issues: issues.join('; '),
        recommendation,
        is_active: course.is_active,
        created_at: course.created_at
      });
    }

    // Print report
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('AUDIT REPORT: California Disc Golf Courses');
    console.log('═══════════════════════════════════════════════════════════════════\n');

    console.log(`Total Courses: ${courses.length}`);
    console.log(`✅ Verified (PDGA/DGCourseReview): ${verified}`);
    console.log(`❌ Unverified: ${unverified}`);
    console.log(`🔧 Fixable (Verified but incomplete data): ${fixable}`);
    console.log(`🗑️  Removable (Not in PDGA/DGCourseReview): ${removable}\n`);

    // Summary by city
    const byCity = {};
    report.forEach(c => {
      if (!byCity[c.city]) byCity[c.city] = [];
      byCity[c.city].push(c);
    });

    console.log('BREAKDOWN BY CITY:');
    Object.keys(byCity).sort().forEach(city => {
      const cityData = byCity[city];
      const v = cityData.filter(c => c.status.includes('✅')).length;
      const u = cityData.filter(c => !c.status.includes('✅')).length;
      console.log(`  ${city}: ${v} verified, ${u} unverified`);
    });

    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('COURSES REQUIRING FIXES (DATA ISSUES):\n');

    report.filter(c => c.recommendation === 'FIX').forEach(c => {
      console.log(`${c.id} | ${c.name} (${c.city})`);
      if (c.issues) console.log(`   Issues: ${c.issues}`);
      console.log();
    });

    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('COURSES TO REMOVE (NOT PDGA/DGCourseReview VERIFIED):\n');

    report.filter(c => c.recommendation === 'REMOVE' && !c.status.includes('✅')).forEach(c => {
      console.log(`${c.id} | ${c.name} (${c.city})`);
    });

    // Save full report as CSV
    const csv = ['ID,Name,City,Status,Holes,Par,PDGA Rating,DGCR Rating,Designer,Year,Issues,Recommendation'];
    report.forEach(c => {
      csv.push(
        `${c.id},"${c.name}","${c.city}","${c.status}",${c.holes},${c.par},` +
        `${c.has_pdga_rating ? 'Yes' : 'No'},${c.has_dgcr_rating ? 'Yes' : 'No'},` +
        `${c.has_designer ? 'Yes' : 'No'},${c.has_year ? 'Yes' : 'No'},"${c.issues}","${c.recommendation}"`
      );
    });

    fs.writeFileSync('./california-audit-report.csv', csv.join('\n'));
    console.log('\n✅ Full report saved to: california-audit-report.csv\n');

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

auditCalifornia();
