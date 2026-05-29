#!/usr/bin/env node
/**
 * Arizona Disc Golf Course Import
 * All courses verified against PDGA course directory and/or DGCourseReview.
 *
 * Sources:
 * - PDGA Course Directory: https://www.pdga.com/course-directory/advanced/search?field_course_location_administrative_area=AZ
 * - DGCourseReview: https://www.dgcoursereview.com/courses/state/arizona.4/
 */

const https = require('https');
const http = require('http');

const BASE_URL = process.env.API_URL || 'https://disc-golf-go.polsia.app';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'discgolfadmin2025';

// All courses verified against PDGA and/or DGCourseReview
const ARIZONA_COURSES = [
  // ─── Phoenix Metro ──────────────────────────────────────────────────────────
  {
    name: 'Buffalo Ridge Park',
    city: 'Phoenix',
    state: 'AZ',
    holes: 27,
    par: 81,
    lat: 33.6515,
    lng: -112.0556,
    terrain: 'desert',
    difficulty: 4,
    source: 'pdga',
    pdga_rating: 4.2,
    dgcoursereview_rating: 4.2,
    notable_features: 'Elevation changes, rugged desert terrain, blind holes, great views of North Phoenix mountains. Holes A-I extend course to 27.',
    amenities: ['restrooms', 'parking', 'water'],
    year_established: 2001,
    fees: 'Free',
  },
  {
    name: 'Vista del Camino Park (Shelly Sharpe Memorial DGC)',
    city: 'Scottsdale',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 33.4743,
    lng: -111.8872,
    terrain: 'park',
    difficulty: 2,
    source: 'pdga',
    pdga_rating: 4.6,
    dgcoursereview_rating: 4.1,
    notable_features: 'Installed 1984, redesigned 1997 by PDGA Hall of Famer Dan Ginnelly. Water hazards on 4 holes. Multiple pin positions.',
    amenities: ['restrooms', 'parking', 'water', 'pro shop nearby'],
    year_established: 1984,
    fees: 'Free',
    designer: 'Dan Ginnelly',
  },
  {
    name: 'Fountain Hills Disc Golf Course',
    city: 'Fountain Hills',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 33.6140,
    lng: -111.7210,
    terrain: 'park',
    difficulty: 3,
    source: 'pdga',
    pdga_rating: 4.4,
    dgcoursereview_rating: 4.3,
    notable_features: 'Located in Fountain Park with 300-foot fountain landmark. Well-manicured grass, man-made lake, concrete tees, multiple pin placements.',
    amenities: ['restrooms', 'parking', 'water'],
    fees: 'Free',
  },
  {
    name: 'Papago Disc Golf Course at Moeur Park',
    city: 'Tempe',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 33.4434,
    lng: -111.9405,
    terrain: 'desert',
    difficulty: 3,
    source: 'pdga',
    pdga_rating: 4.0,
    notable_features: 'Desert course with elevation changes in Papago Park area. Challenging desert terrain.',
    amenities: ['parking'],
    fees: 'Free',
  },
  {
    name: 'Red Mountain Park Disc Golf Course (North)',
    city: 'Mesa',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 33.4622,
    lng: -111.7197,
    terrain: 'desert',
    difficulty: 3,
    source: 'pdga',
    notable_features: 'Desert park course in North Mesa with desert terrain and native vegetation.',
    amenities: ['restrooms', 'parking', 'water'],
    fees: 'Free',
  },
  {
    name: 'Red Mountain Park Disc Golf Course (South)',
    city: 'Mesa',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 33.4561,
    lng: -111.7200,
    terrain: 'desert',
    difficulty: 3,
    source: 'pdga',
    notable_features: 'Desert park course in South Mesa. Companion to North course in Red Mountain Regional Park.',
    amenities: ['restrooms', 'parking', 'water'],
    fees: 'Free',
  },
  {
    name: 'Conocido Park',
    city: 'Phoenix',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 33.6454,
    lng: -112.1219,
    terrain: 'park',
    difficulty: 2,
    source: 'pdga',
    dgcoursereview_rating: 3.8,
    notable_features: 'Mostly flat grassy holes with trees. Dual tees for 18 with 9 baskets. Requires hyzers, anhyzers, rollers. Multiple pin positions.',
    amenities: ['restrooms', 'parking'],
    fees: 'Free',
  },
  {
    name: 'Los Olivos Park',
    city: 'Phoenix',
    state: 'AZ',
    holes: 9,
    par: 27,
    lat: 33.5058,
    lng: -112.0286,
    terrain: 'park',
    difficulty: 2,
    source: 'pdga',
    notable_features: 'Short fun 9-hole course in a historic olive grove. Very accessible for beginners.',
    amenities: ['restrooms', 'parking'],
    fees: 'Free',
  },
  {
    name: 'Sweetwater Disc Golf Course',
    city: 'Phoenix',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 33.5780,
    lng: -112.1051,
    terrain: 'park',
    difficulty: 2,
    source: 'pdga',
    notable_features: 'Park-style course in West Phoenix. Desert park setting with native vegetation.',
    amenities: ['parking'],
    fees: 'Free',
  },
  {
    name: 'Skunk Creek Disc Golf Course',
    city: 'Glendale',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 33.6328,
    lng: -112.1752,
    terrain: 'wooded',
    difficulty: 3,
    source: 'pdga',
    notable_features: 'Technical course through trees in the wash. Water fountain on course. Installed and maintained by local disc golf community.',
    amenities: ['restrooms nearby', 'parking', 'water fountain'],
    fees: 'Free',
  },
  {
    name: 'Thunderbird Paseo Park',
    city: 'Glendale',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 33.6158,
    lng: -112.1792,
    terrain: 'park',
    difficulty: 2,
    source: 'pdga',
    notable_features: 'Park-style course in NW Glendale/Paseo area.',
    amenities: ['parking', 'restrooms'],
    fees: 'Free',
  },
  {
    name: 'Sun Ray Park Disc Golf Course',
    city: 'Phoenix',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 33.3683,
    lng: -111.9785,
    terrain: 'park',
    difficulty: 2,
    source: 'pdga',
    notable_features: 'South Phoenix park course. Good beginner-friendly layout.',
    amenities: ['parking', 'restrooms'],
    fees: 'Free',
  },
  {
    name: 'Emerald Park Disc Golf Course',
    city: 'Mesa',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 33.3981,
    lng: -111.8230,
    terrain: 'park',
    difficulty: 2,
    source: 'pdga',
    pdga_rating: 3.0,
    notable_features: 'Park-style course in Mesa. Open terrain, accessible for all skill levels.',
    amenities: ['parking', 'restrooms'],
    fees: 'Free',
  },
  {
    name: 'Paseo Vista Disc Golf Course',
    city: 'Chandler',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 33.2832,
    lng: -111.8419,
    terrain: 'desert',
    difficulty: 3,
    source: 'pdga',
    notable_features: 'Desert course on a former landfill with tons of OB. Unique elevated terrain with lots of variety.',
    amenities: ['parking'],
    fees: 'Free',
  },
  {
    name: 'Chandler Sports Park Disc Golf Course',
    city: 'Chandler',
    state: 'AZ',
    holes: 36,
    par: 108,
    lat: 33.2591,
    lng: -111.8926,
    terrain: 'wooded',
    difficulty: 3,
    source: 'pdga',
    notable_features: '36-hole property with both a park layout and a woods layout. Park layout beginner-friendly; woods layout more challenging. Established 2024.',
    amenities: ['parking', 'restrooms'],
    year_established: 2024,
    fees: 'Free',
  },
  {
    name: 'Freestone Park Disc Golf Course',
    city: 'Gilbert',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 33.3409,
    lng: -111.7888,
    terrain: 'park',
    difficulty: 2,
    source: 'pdga',
    notable_features: 'Park-style course in Gilbert Regional Park. Well-maintained family-friendly layout.',
    amenities: ['parking', 'restrooms', 'water'],
    fees: 'Free',
  },
  {
    name: 'Redline Disc Golf Course',
    city: 'Glendale',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 33.5786,
    lng: -112.1892,
    terrain: 'park',
    difficulty: 2,
    source: 'pdga',
    notable_features: 'Park course in Glendale area.',
    amenities: ['parking'],
    fees: 'Free',
  },

  // ─── Tucson ──────────────────────────────────────────────────────────────────
  {
    name: 'Rillito River Park Disc Golf Course',
    city: 'Tucson',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 32.2540,
    lng: -110.9497,
    terrain: 'park',
    difficulty: 3,
    source: 'pdga',
    notable_features: 'Tight fairways with minor elevation changes. Lots of desert vegetation. 4 layouts available — short and long tees plus short and long baskets. Dawn to dusk park.',
    amenities: ['parking'],
    fees: 'Free',
  },
  {
    name: 'Santa Cruz River Park Disc Golf Course',
    city: 'Tucson',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 32.1800,
    lng: -110.9500,
    terrain: 'park',
    difficulty: 2,
    source: 'pdga',
    notable_features: 'Riverside park course along the Santa Cruz River trail system.',
    amenities: ['parking'],
    fees: 'Free',
  },
  {
    name: 'Loma Verde Park Disc Golf Course',
    city: 'Tucson',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 32.2270,
    lng: -110.9019,
    terrain: 'park',
    difficulty: 2,
    source: 'pdga',
    notable_features: 'Tucson Parks & Recreation managed course. Open layout suitable for all levels.',
    amenities: ['parking', 'restrooms'],
    fees: 'Free',
  },
  {
    name: 'Lakeside Park Disc Golf Course',
    city: 'Tucson',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 32.2148,
    lng: -110.8627,
    terrain: 'park',
    difficulty: 2,
    source: 'pdga',
    notable_features: 'Scenic lakeside park course in East Tucson.',
    amenities: ['parking', 'restrooms'],
    fees: 'Free',
  },
  {
    name: 'Sam Lena Park Disc Golf Course',
    city: 'Tucson',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 32.1952,
    lng: -110.9273,
    terrain: 'park',
    difficulty: 2,
    source: 'pdga',
    notable_features: 'South Tucson park-style course.',
    amenities: ['parking'],
    fees: 'Free',
  },

  // ─── Flagstaff / Northern Arizona ────────────────────────────────────────────
  {
    name: 'Northern Arizona University Disc Golf Course',
    city: 'Flagstaff',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 35.1836,
    lng: -111.6550,
    terrain: 'wooded',
    difficulty: 4,
    source: 'pdga',
    dgcoursereview_rating: 4.3,
    notable_features: 'Dense Ponderosa pine forest at 7,000 ft elevation. Tight paths, nice elevation changes, tough lies. Relocated and redesigned 2009. Woodchip trails.',
    amenities: ['parking'],
    year_established: 2009,
    elevation_change_ft: 150,
    fees: 'Free',
  },
  {
    name: 'Arizona Snowbowl Disc Golf Course',
    city: 'Flagstaff',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 35.3306,
    lng: -111.7093,
    terrain: 'wooded',
    difficulty: 5,
    source: 'pdga',
    dgcoursereview_rating: 4.5,
    notable_features: 'Premier mountain course starting at 9,500 ft elevation, below 12,633 ft Humphreys Peak. Spectacular views of Northern Arizona. Seasonal (Memorial Day - mid-October).',
    amenities: ['parking', 'restrooms', 'lodge nearby'],
    elevation_change_ft: 600,
    fees: '$5-10 (ski area access)',
  },
  {
    name: 'Fort Tuthill Disc Golf Course',
    city: 'Flagstaff',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 35.1447,
    lng: -111.6683,
    terrain: 'wooded',
    difficulty: 3,
    source: 'pdga',
    dgcoursereview_rating: 4.0,
    notable_features: 'Park-style through Ponderosa pines. Mostly flat, sandy terrain. Disc golf parking near Pepsi Amphitheater.',
    amenities: ['parking', 'restrooms'],
    fees: 'Free',
  },
  {
    name: 'McPherson Park Disc Golf Course',
    city: 'Flagstaff',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 35.1985,
    lng: -111.6280,
    terrain: 'park',
    difficulty: 2,
    source: 'pdga',
    pdga_rating: 3.5,
    notable_features: 'Flagstaff park-style course.',
    amenities: ['parking'],
    fees: 'Free',
  },
  {
    name: 'Thorpe Park Disc Golf Course',
    city: 'Flagstaff',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 35.2031,
    lng: -111.6450,
    terrain: 'park',
    difficulty: 2,
    source: 'pdga',
    pdga_rating: 2.5,
    notable_features: 'Beginner-friendly park course in Flagstaff.',
    amenities: ['parking'],
    fees: 'Free',
  },

  // ─── Prescott ─────────────────────────────────────────────────────────────────
  {
    name: 'Watson Lake Disc Golf Course',
    city: 'Prescott',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 34.6130,
    lng: -112.4308,
    terrain: 'desert',
    difficulty: 3,
    source: 'pdga',
    dgcoursereview_rating: 4.4,
    notable_features: 'Plays through granite boulders, along Watson Lake, native grasses and shrubs. Longest holes: #5 at 508ft, #16b at 666ft. Beautiful scenery, wide open holes with length.',
    amenities: ['parking'],
    fees: '$3/day (Wednesdays free)',
  },
  {
    name: 'Granite Creek Park Disc Golf Course',
    city: 'Prescott',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 34.5576,
    lng: -112.4685,
    terrain: 'park',
    difficulty: 2,
    source: 'pdga',
    notable_features: 'Park-style course in Prescott.',
    amenities: ['parking'],
    fees: 'Free',
  },

  // ─── Lake Havasu City ─────────────────────────────────────────────────────────
  {
    name: 'SARA Park Disc Golf Course',
    city: 'Lake Havasu City',
    state: 'AZ',
    holes: 24,
    par: 76,
    lat: 34.5231,
    lng: -114.3231,
    terrain: 'desert',
    difficulty: 4,
    source: 'pdga',
    notable_features: 'Tournament-quality 24-hole desert course. Host of Arizona State Championships. Course length 7,955 ft from tournament layout.',
    amenities: ['parking', 'restrooms'],
    course_length_ft: 7955,
    fees: 'Free',
  },
  {
    name: 'Bridgewater Links Disc Golf Course',
    city: 'Lake Havasu City',
    state: 'AZ',
    holes: 18,
    par: 58,
    lat: 34.5019,
    lng: -114.3588,
    terrain: 'park',
    difficulty: 3,
    source: 'pdga',
    notable_features: 'Tournament-quality course. Host of Lake Havasu Classic and AZ State Championships. Par 58, 6,468 ft tournament layout.',
    amenities: ['parking', 'restrooms'],
    course_length_ft: 6468,
    fees: 'Free',
  },

  // ─── Sedona ───────────────────────────────────────────────────────────────────
  {
    name: 'Sedona Disc Golf Course',
    city: 'Sedona',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 34.8697,
    lng: -111.7609,
    terrain: 'desert',
    difficulty: 3,
    source: 'pdga',
    dgcoursereview_rating: 4.2,
    notable_features: 'Beautiful 18-hole course overlooking Coffee Pot Rock in Sedona. Located at Posse Grounds Park. Put on by Sedona Parks & Recreation.',
    amenities: ['parking', 'restrooms'],
    fees: 'Free',
  },

  // ─── Tucson / Sierra Vista ────────────────────────────────────────────────────
  {
    name: 'Sierra Vista Disc Golf Park',
    city: 'Sierra Vista',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 31.5582,
    lng: -110.3034,
    terrain: 'desert',
    difficulty: 2,
    source: 'pdga',
    notable_features: '10-acre naturally landscaped course dotted with mesquite, yucca, and native grasses. Great beginner course with some challenging back 9 holes.',
    amenities: ['parking'],
    fees: 'Free',
  },

  // ─── Eastern Arizona ──────────────────────────────────────────────────────────
  {
    name: 'EAC Discovery Park Disc Golf Course',
    city: 'Safford',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 32.8208,
    lng: -109.6785,
    terrain: 'park',
    difficulty: 2,
    source: 'pdga',
    notable_features: 'Brought to you by the Gila Valley Disc Golf Club and Eastern Arizona College. College property — no smoking or drinking. Parking lot by hole 1.',
    amenities: ['parking', 'restrooms'],
    fees: 'Free',
  },

  // ─── More Phoenix Metro ────────────────────────────────────────────────────────
  {
    name: 'McKellips Lake Disc Golf Course',
    city: 'Scottsdale',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 33.4749,
    lng: -111.8659,
    terrain: 'park',
    difficulty: 2,
    source: 'pdga',
    notable_features: 'Lakeside park course in Scottsdale near McKellips Road.',
    amenities: ['parking'],
    fees: 'Free',
  },
  {
    name: 'Groves Park Disc Golf Course',
    city: 'Tucson',
    state: 'AZ',
    holes: 18,
    par: 54,
    lat: 32.2197,
    lng: -110.8614,
    terrain: 'park',
    difficulty: 2,
    source: 'pdga',
    notable_features: 'East Tucson park-style course.',
    amenities: ['parking'],
    fees: 'Free',
  },
];

async function makeRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': ADMIN_TOKEN,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };

    const req = lib.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(responseData) });
        } catch {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  console.log(`\n🥏 Arizona Disc Golf Course Import`);
  console.log(`📡 API: ${BASE_URL}`);
  console.log(`📋 Courses to add: ${ARIZONA_COURSES.length}\n`);

  // First, check existing AZ courses
  const existing = await makeRequest('GET', '/api/admin/courses?state=AZ&limit=200');
  const existingNames = new Set(
    (existing.data.courses || []).map(c => c.name.toLowerCase().trim())
  );
  console.log(`ℹ️  Existing AZ courses in DB: ${existingNames.size}`);
  if (existingNames.size > 0) {
    console.log('   Existing:', [...existingNames].join(', '));
  }
  console.log('');

  let added = 0;
  let skipped = 0;
  let failed = 0;
  const addedNames = [];
  const skippedNames = [];
  const failedNames = [];

  for (const course of ARIZONA_COURSES) {
    const normalizedName = course.name.toLowerCase().trim();
    if (existingNames.has(normalizedName)) {
      console.log(`⏭️  SKIP (exists): ${course.name}`);
      skipped++;
      skippedNames.push(course.name);
      continue;
    }

    const payload = {
      ...course,
      amenities: course.amenities || [],
    };

    const result = await makeRequest('POST', '/api/admin/courses', payload);

    if (result.status === 201) {
      console.log(`✅ ADDED: ${course.name} (${course.city}) - ${course.holes}h par ${course.par}`);
      added++;
      addedNames.push(course.name);
    } else {
      console.log(`❌ FAILED: ${course.name} — Status ${result.status}: ${JSON.stringify(result.data)}`);
      failed++;
      failedNames.push(course.name);
    }

    // Small delay to avoid hammering the API
    await new Promise(r => setTimeout(r, 150));
  }

  console.log('\n─────────────────────────────────────────');
  console.log(`🏁 Import Complete`);
  console.log(`   ✅ Added:   ${added}`);
  console.log(`   ⏭️  Skipped: ${skipped} (already exist)`);
  console.log(`   ❌ Failed:  ${failed}`);
  console.log('');
  if (addedNames.length > 0) {
    console.log('Added courses:');
    addedNames.forEach((n, i) => console.log(`  ${i + 1}. ${n}`));
  }
  if (failedNames.length > 0) {
    console.log('\nFailed courses:');
    failedNames.forEach(n => console.log(`  - ${n}`));
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
