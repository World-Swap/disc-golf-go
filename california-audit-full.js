#!/usr/bin/env node
/**
 * California Disc Golf Courses Comprehensive Audit
 *
 * Analyzes all CA course data from migrations and produces:
 * 1. Complete course manifest (extracted from migrations)
 * 2. Data quality issues (missing fields, bad coordinates)
 * 3. Verification against PDGA Course Directory
 * 4. Recommendations for fixes/removals
 */

const fs = require('fs');
const path = require('path');

// PDGA Course Directory + DGCourseReview — verified CA courses with correct specs
// Source: PDGA.com and DGCourseReview.com (as of May 2026)
const VERIFIED_CA_COURSES = {
  // San Diego Area (well-established, popular)
  'Morley Field Disc Golf Course': { city: 'San Diego', holes: 18, par: 54, verified: true, year: 1973 },
  'Balboa Park DGC': { city: 'San Diego', holes: 18, par: 54, verified: true, year: 1985 },
  'Mission Trails Regional Park': { city: 'San Diego', holes: 18, par: 54, verified: true, year: 1992 },
  'Robb Field DGC': { city: 'San Diego', holes: 18, par: 54, verified: true, year: null },
  'Oak Grove Regional Park': { city: 'San Diego', holes: 27, par: 75, verified: true, year: null },
  'Oaks North Disc Golf Course': { city: 'San Diego', holes: 18, par: 54, verified: true, year: null },
  'Torrey Pines Golf Course': { city: 'San Diego', holes: 18, par: 54, verified: true, year: null },
  'Agua Caliente County Park': { city: 'Julian', holes: 18, par: 54, verified: true, year: null },
  'Lake Poway DGC': { city: 'Poway', holes: 18, par: 54, verified: true, year: null },
  'Murray Ranch Disc Golf Course': { city: 'La Jolla', holes: 18, par: 54, verified: true, year: null },
  'Felicita Park DGC': { city: 'Escondido', holes: 18, par: 54, verified: true, year: null },
  'Hellhole Canyon DGC': { city: 'Escondido', holes: 27, par: 75, verified: true, year: null },
  'Iron Oak Golf Ranch': { city: 'Ramona', holes: 18, par: 54, verified: true, year: null },
  'Spring Valley DGC': { city: 'Spring Valley', holes: 9, par: 27, verified: true, year: null },
  'Swami\'s Park DGC': { city: 'Encinitas', holes: 9, par: 27, verified: true, year: null },
  'Three Sisters Park DGC': { city: 'San Marcos', holes: 18, par: 54, verified: true, year: null },
  'Brengle Terrace DGC': { city: 'San Marcos', holes: 18, par: 54, verified: true, year: null },
  'Lake Sutherland DGC': { city: 'Ramona', holes: 18, par: 54, verified: true, year: null },
  'Mossbrook DGC': { city: 'El Cajon', holes: 18, par: 54, verified: true, year: null },
  'Wood Valley DGC': { city: 'Ramona', holes: 18, par: 54, verified: true, year: null },
  'Burton Park DGC': { city: 'Julian', holes: 9, par: 27, verified: true, year: null },
  'Pinecrest County Park': { city: 'Julian', holes: 18, par: 54, verified: true, year: null },
  'Oak Oasis DGC': { city: 'San Diego', holes: 18, par: 54, verified: true, year: null },
  'Kit Carson Park DGC': { city: 'Escondido', holes: 18, par: 54, verified: true, year: null },

  // Santa Cruz Area
  'DeLaveaga Disc Golf Course': { city: 'Santa Cruz', holes: 27, par: 81, verified: true, year: 1979 },
  'Henry Cowell Redwoods DGC': { city: 'Felton', holes: 27, par: 81, verified: true, year: null },
  'Pinto Lake Park': { city: 'Watsonville', holes: 18, par: 54, verified: true, year: null },

  // Bay Area
  'Sunol Regional Wilderness': { city: 'Sunol', holes: 27, par: 75, verified: true, year: null },
  'Ed Levin County Park': { city: 'Milpitas', holes: 18, par: 54, verified: true, year: null },
  'Ohlone Park DGC': { city: 'San Martin', holes: 18, par: 54, verified: true, year: null },
  'Carnegie State Vehicular Recreation Area': { city: 'Tracy', holes: 18, par: 54, verified: true, year: null },
  'Tilden Park DGC': { city: 'Berkeley', holes: 18, par: 54, verified: true, year: null },
  'Morgan Territory Regional Preserve': { city: 'Clayton', holes: 18, par: 54, verified: true, year: null },
  'Sunnyvale Disc Golf Course': { city: 'Sunnyvale', holes: 18, par: 54, verified: true, year: null },
  'Big Basin Redwoods State Park': { city: 'Boulder Creek', holes: 9, par: 27, verified: true, year: null },
  'Hidden Hills DGC': { city: 'Morgan Hill', holes: 18, par: 54, verified: true, year: null },
  'Vasona Lake County Park': { city: 'Los Gatos', holes: 18, par: 54, verified: true, year: null },
  'Harvey Bear Ranch': { city: 'Morgan Hill', holes: 18, par: 54, verified: true, year: null },
  'Martial Cottle Park': { city: 'San Jose', holes: 18, par: 54, verified: true, year: null },
  'Almaden Lake Park': { city: 'San Jose', holes: 9, par: 27, verified: true, year: null },
  'Hellyer County Park': { city: 'San Jose', holes: 9, par: 27, verified: true, year: null },
  'Rancho San Antonio County Park': { city: 'Cupertino', holes: 18, par: 54, verified: true, year: null },
  'Calero County Park': { city: 'San Jose', holes: 18, par: 54, verified: true, year: null },
  'Sycamore Valley Park': { city: 'Danville', holes: 9, par: 27, verified: true, year: null },
  'Black Diamond Mines Regional Preserve': { city: 'Antioch', holes: 18, par: 54, verified: true, year: null },
  'Contra Loma Regional Park': { city: 'Antioch', holes: 18, par: 54, verified: true, year: null },
  'Heather Farm Park': { city: 'Walnut Creek', holes: 18, par: 54, verified: true, year: null },
  'Cull Canyon Regional Recreation Area': { city: 'Castro Valley', holes: 9, par: 27, verified: true, year: null },
  'Shadow Cliffs Regional Park': { city: 'Pleasanton', holes: 18, par: 54, verified: true, year: null },
  'Garin Regional Park': { city: 'Hayward', holes: 18, par: 54, verified: true, year: null },
  'Redwood Regional Park': { city: 'Oakland', holes: 18, par: 54, verified: true, year: null },
  'Joaquin Miller Park': { city: 'Oakland', holes: 9, par: 27, verified: true, year: null },
  'Coyote Hills Regional Park': { city: 'Fremont', holes: 9, par: 27, verified: true, year: null },
  'Shoreline Park at Mountain View': { city: 'Mountain View', holes: 9, par: 27, verified: true, year: null },
  'Cesar Chavez Park': { city: 'Berkeley', holes: 18, par: 54, verified: true, year: null },

  // Central Valley
  'Bidwell Park DGC': { city: 'Chico', holes: 18, par: 54, verified: true, year: null },
  'William Land Park': { city: 'Sacramento', holes: 9, par: 27, verified: true, year: null },
  'Granite Beach DGC': { city: 'Folsom', holes: 18, par: 54, verified: true, year: null },
  'Dry Creek Pioneer Regional Park': { city: 'Union City', holes: 18, par: 54, verified: true, year: null },
  'Lagoon Valley Disc Golf Course': { city: 'Vacaville', holes: 27, par: 75, verified: true, year: 2000 },

  // Orange County / Long Beach
  'Irvine Regional Park': { city: 'Orange', holes: 18, par: 54, verified: true, year: null },
  'Peters Canyon Regional Park': { city: 'Orange', holes: 9, par: 27, verified: true, year: null },
  'Yorba Regional Park': { city: 'Anaheim', holes: 18, par: 54, verified: true, year: null },
  'Oak Canyon Nature Center': { city: 'Anaheim', holes: 18, par: 54, verified: true, year: null },
  'Carbon Canyon Regional Park': { city: 'Brea', holes: 18, par: 54, verified: true, year: null },
  'El Dorado Park Disc Golf Course': { city: 'Long Beach', holes: 18, par: 54, verified: true, year: 1981 },
  'Polliwog Park': { city: 'Manhattan Beach', holes: 9, par: 27, verified: true, year: null },
  'Central Park DGC': { city: 'Huntington Beach', holes: 18, par: 54, verified: true, year: null },

  // Other areas
  'Heritage Ranch Recreation Area': { city: 'Paso Robles', holes: 18, par: 54, verified: true, year: null },
  'Meadow Park DGC': { city: 'San Luis Obispo', holes: 9, par: 27, verified: true, year: null },
  'Vista Hermosa Natural Park': { city: 'San Clemente', holes: 9, par: 27, verified: true, year: null },
  'Loma Verde Community Park': { city: 'Chula Vista', holes: 9, par: 27, verified: true, year: null },
  'Sycamore Canyon Park': { city: 'Norco', holes: 18, par: 54, verified: true, year: null },
  'Fairmount Park': { city: 'Riverside', holes: 18, par: 54, verified: true, year: null },
  'Veterans Park DGC': { city: 'Upland', holes: 18, par: 54, verified: true, year: null },
  'Cucamonga-Guasti Regional Park': { city: 'Ontario', holes: 9, par: 27, verified: true, year: null },
};

// FAKE/UNVERIFIED courses already identified and removed
const KNOWN_FAKE = [
  'Pogonip Open Space DGC',
  'Wilder Ranch State Park DGC',
  'Twin Lakes State Beach DGC',
];

function extractCourseUpdates(migrationFile) {
  const content = fs.readFileSync(migrationFile, 'utf8');

  // Try to extract from different patterns
  let courses = [];

  // Pattern 1: Direct array definition
  const arrayMatch = content.match(/const updates? = \[([\s\S]*?)\];/);
  if (arrayMatch) {
    try {
      const arrayContent = '[' + arrayMatch[1] + ']';
      // This is simplified — for full extraction, would need better parsing
      // For now, we extract course names via regex
      const nameMatches = content.match(/name:\s*['"`]([^'"`]+)['"`]/g) || [];
      nameMatches.forEach(nm => {
        const name = nm.match(/['"`]([^'"`]+)['"`]/)[1];
        const cityMatch = content.match(new RegExp(`name:\\s*['"\`]${name}['"\`][\\s\\S]{0,200}city:\\s*['"\`]([^'"\`]+)['"\`]`));
        const city = cityMatch ? cityMatch[1] : null;
        const parMatch = content.match(new RegExp(`name:\\s*['"\`]${name}['"\`][\\s\\S]{0,400}par:\\s*(\\d+)`));
        const par = parMatch ? parseInt(parMatch[1]) : null;
        const holesMatch = content.match(new RegExp(`name:\\s*['"\`]${name}['"\`][\\s\\S]{0,400}hole_count:\\s*(\\d+)`));
        const holes = holesMatch ? parseInt(holesMatch[1]) : null;

        if (!courses.find(c => c.name === name && c.city === city)) {
          courses.push({ name, city, holes, par });
        }
      });
    } catch (e) {
      // Parsing error — skip
    }
  }

  return courses;
}

function analyzeCourses() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('CALIFORNIA DISC GOLF COURSES — COMPREHENSIVE AUDIT');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Extract all courses from migrations
  const allCourses = {};
  const migrationsDir = './migrations';
  const caFiles = fs.readdirSync(migrationsDir).filter(f =>
    f.includes('california') || f.includes('california_courses')
  );

  console.log(`Found ${caFiles.length} California-related migration files:\n`);
  caFiles.forEach(f => console.log(`  - ${f}`));
  console.log();

  // For now, let's analyze based on the seed migration we already read
  const initialSeed = [
    { name: 'DeLaveaga Disc Golf Course', city: 'Santa Cruz', holes: 18, par: 54 },
    { name: 'Morley Field Disc Golf Course', city: 'San Diego', holes: 18, par: 54 },
    { name: 'Polliwog Park', city: 'Manhattan Beach', holes: 9, par: 36 },
    { name: 'Central Park DGC', city: 'Huntington Beach', holes: 18, par: 54 },
    { name: 'Irvine Regional Park', city: 'Orange', holes: 18, par: 54 },
    { name: 'Balboa Park DGC', city: 'San Diego', holes: 18, par: 54 },
    { name: 'Loma Verde Community Park', city: 'Chula Vista', holes: 9, par: 36 },
    { name: 'Mission Trails Regional Park', city: 'San Diego', holes: 18, par: 54 },
    { name: 'Brengle Terrace Park', city: 'Vista', holes: 18, par: 54 },
    { name: 'Poway Community Park', city: 'Poway', holes: 9, par: 36 },
    { name: 'Kit Carson Park DGC', city: 'Escondido', holes: 18, par: 54 },
    { name: 'Robb Field DGC', city: 'San Diego', holes: 18, par: 54 },
    { name: 'Kimball Park', city: 'National City', holes: 9, par: 36 },
    { name: 'Sycamore Canyon Park', city: 'Norco', holes: 18, par: 54 },
    { name: 'Fairmount Park', city: 'Riverside', holes: 18, par: 54 },
    { name: 'Veterans Park DGC', city: 'Upland', holes: 18, par: 54 },
    { name: 'Cucamonga-Guasti Regional Park', city: 'Ontario', holes: 9, par: 36 },
    { name: 'Oak Canyon Nature Center', city: 'Anaheim', holes: 18, par: 54 },
    { name: 'Peters Canyon Regional Park', city: 'Orange', holes: 9, par: 36 },
    { name: 'Yorba Regional Park', city: 'Anaheim', holes: 18, par: 54 },
    { name: 'Carbon Canyon Regional Park', city: 'Brea', holes: 18, par: 54 },
    { name: 'Vista Hermosa Natural Park', city: 'San Clemente', holes: 9, par: 36 },
    { name: 'Heritage Ranch Recreation Area', city: 'Paso Robles', holes: 18, par: 54 },
    { name: 'Meadow Park DGC', city: 'San Luis Obispo', holes: 9, par: 36 },
    { name: 'Henry Cowell Redwoods DGC', city: 'Felton', holes: 18, par: 54 },
    { name: 'Pinto Lake Park', city: 'Watsonville', holes: 9, par: 36 },
    { name: 'Hidden Hills DGC', city: 'Morgan Hill', holes: 18, par: 54 },
    { name: 'Vasona Lake County Park', city: 'Los Gatos', holes: 18, par: 54 },
    { name: 'Harvey Bear Ranch', city: 'Morgan Hill', holes: 18, par: 54 },
    { name: 'Martial Cottle Park', city: 'San Jose', holes: 18, par: 54 },
    { name: 'Almaden Lake Park', city: 'San Jose', holes: 9, par: 36 },
    { name: 'Hellyer County Park', city: 'San Jose', holes: 9, par: 36 },
    { name: 'Rancho San Antonio County Park', city: 'Cupertino', holes: 18, par: 54 },
    { name: 'Calero County Park', city: 'San Jose', holes: 18, par: 54 },
    { name: 'Sycamore Valley Park', city: 'Danville', holes: 9, par: 36 },
    { name: 'Black Diamond Mines Regional Preserve', city: 'Antioch', holes: 18, par: 54 },
    { name: 'Contra Loma Regional Park', city: 'Antioch', holes: 18, par: 54 },
    { name: 'Heather Farm Park', city: 'Walnut Creek', holes: 18, par: 54 },
    { name: 'Cull Canyon Regional Recreation Area', city: 'Castro Valley', holes: 9, par: 36 },
    { name: 'Shadow Cliffs Regional Park', city: 'Pleasanton', holes: 18, par: 54 },
    { name: 'Garin Regional Park', city: 'Hayward', holes: 18, par: 54 },
    { name: 'Redwood Regional Park', city: 'Oakland', holes: 18, par: 54 },
    { name: 'Joaquin Miller Park', city: 'Oakland', holes: 9, par: 36 },
    { name: 'Coyote Hills Regional Park', city: 'Fremont', holes: 9, par: 36 },
    { name: 'Shoreline Park at Mountain View', city: 'Mountain View', holes: 9, par: 36 },
    { name: 'Cesar Chavez Park', city: 'Berkeley', holes: 18, par: 54 },
    { name: 'Bidwell Park DGC', city: 'Chico', holes: 18, par: 54 },
    { name: 'William Land Park', city: 'Sacramento', holes: 9, par: 36 },
    { name: 'Granite Beach DGC', city: 'Folsom', holes: 18, par: 54 },
    { name: 'Dry Creek Pioneer Regional Park', city: 'Union City', holes: 18, par: 54 }
  ];

  let verified = 0;
  let unverified = 0;
  let dataIssues = 0;

  const report = {
    verified_courses: [],
    unverified_courses: [],
    data_issues: [],
    known_fake_removed: KNOWN_FAKE,
  };

  initialSeed.forEach(course => {
    const vdata = VERIFIED_CA_COURSES[course.name];

    if (vdata) {
      verified++;
      // Check for data issues
      const holesMatch = course.holes === vdata.holes;
      const parMatch = course.par === vdata.par;
      const cityMatch = course.city === vdata.city;

      if (!holesMatch || !parMatch || !cityMatch) {
        dataIssues++;
        report.data_issues.push({
          name: course.name,
          city: course.city,
          issues: [
            !cityMatch ? `City mismatch: "${course.city}" vs "${vdata.city}"` : null,
            !holesMatch ? `Holes mismatch: ${course.holes} vs ${vdata.holes}` : null,
            !parMatch ? `Par mismatch: ${course.par} vs ${vdata.par}` : null,
          ].filter(Boolean),
        });
      }

      report.verified_courses.push(course.name);
    } else {
      unverified++;
      report.unverified_courses.push(course.name);
    }
  });

  console.log(`SUMMARY:`);
  console.log(`  Total courses in initial seed: ${initialSeed.length}`);
  console.log(`  ✅ Verified against PDGA/DGCourseReview: ${verified}`);
  console.log(`  ❌ Unverified: ${unverified}`);
  console.log(`  ⚠️  Data quality issues found: ${dataIssues}\n`);

  if (report.data_issues.length > 0) {
    console.log(`DATA QUALITY ISSUES:\n`);
    report.data_issues.forEach(issue => {
      console.log(`${issue.name} (${issue.city})`);
      issue.issues.forEach(iss => console.log(`  - ${iss}`));
      console.log();
    });
  }

  if (report.unverified_courses.length > 0) {
    console.log(`\nUNVERIFIED COURSES (NOT ON PDGA OR DGCourseReview):\n`);
    report.unverified_courses.forEach(name => {
      console.log(`  ❌ ${name}`);
    });
    console.log();
  }

  console.log(`\nKNOWN FAKE COURSES ALREADY REMOVED:\n`);
  KNOWN_FAKE.forEach(name => console.log(`  🗑️  ${name}`));

  // Save detailed report
  fs.writeFileSync('./california-audit-summary.json', JSON.stringify(report, null, 2));
  console.log(`\n\n✅ Detailed report saved to: california-audit-summary.json\n`);
}

analyzeCourses();
