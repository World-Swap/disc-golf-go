#!/usr/bin/env node
/**
 * Massachusetts Disc Golf Course Import
 * All courses verified against PDGA course directory and/or DGCourseReview.
 *
 * Sources:
 * - PDGA Course Directory: https://www.pdga.com/course-directory/advanced/search?field_course_location_administrative_area=MA
 * - DGCourseReview: https://www.dgcoursereview.com/courses/state/massachusetts/
 */

const https = require('https');
const http = require('http');

const BASE_URL = process.env.API_URL || 'https://disc-golf-go.polsia.app';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'discgolfadmin2025';

// All courses verified against PDGA and/or DGCourseReview
const MASSACHUSETTS_COURSES = [

  // ─── WORCESTER AREA ─────────────────────────────────────────────────────────

  {
    name: 'Maple Hill',
    city: 'Leicester',
    state: 'MA',
    holes: 18,
    par: 60,
    lat: 42.276549,
    lng: -71.896006,
    terrain: 'wooded',
    difficulty: 4,
    source: 'pdga',
    pdga_rating: 4.3,
    dgcoursereview_rating: 4.7,
    notable_features: 'Home of the DGPT MVP Open. Four layouts: Red 5071 ft, White 6089 ft, Blue 7975 ft, Gold 8415 ft. Ponds, long fairways, wooded holes, open fields, and clever elevation. Dual tees and Mach X targets. Adjacent to Pyramids course — the Leicester disc golf hub.',
    amenities: ['restrooms', 'parking', 'camping', 'tee signs', 'pro shop', 'scorecards'],
    year_established: 2002,
    fees: '$10/player',
    designer: 'Steven Dodge',
    course_length_ft: 7975,
    pdga_course_id: '26177',
  },

  {
    name: 'Pyramids',
    city: 'Leicester',
    state: 'MA',
    holes: 18,
    par: 60,
    lat: 42.275813,
    lng: -71.891269,
    terrain: 'wooded',
    difficulty: 3,
    source: 'pdga',
    pdga_rating: 4.5,
    dgcoursereview_rating: 4.1,
    notable_features: 'One of MA\'s oldest courses (est. 1988). Hilly wooded corridors with boulders and a casual stream. Two layouts: 5249 ft / 6722 ft. Adjacent to Marshall Street Disc Golf pro shop and Maple Hill.',
    amenities: ['parking', 'camping', 'restrooms', 'tee signs', 'pro shop'],
    year_established: 1988,
    fees: '$8-10/round',
    designer: 'Jason Southwick',
    course_length_ft: 6722,
    pdga_course_id: '25025',
  },

  {
    name: 'Newton Hill',
    city: 'Worcester',
    state: 'MA',
    holes: 18,
    par: 54,
    lat: 42.269582,
    lng: -71.820721,
    terrain: 'wooded',
    difficulty: 3,
    source: 'pdga',
    pdga_rating: 4.3,
    notable_features: '41-acre urban hill course with abundant elevation changes. Free public course on Doherty Memorial High School grounds. 5361 ft layout with Chainstar targets on rubber tees.',
    amenities: ['parking', 'tee signs'],
    year_established: 2009,
    fees: 'Free',
    course_length_ft: 5361,
    pdga_course_id: '27140',
  },

  {
    name: 'Buffumville Lake Disc Golf Course',
    city: 'Charlton',
    state: 'MA',
    holes: 18,
    par: 54,
    lat: 42.117776,
    lng: -71.907292,
    terrain: 'mixed',
    difficulty: 3,
    source: 'pdga',
    pdga_rating: 4.25,
    notable_features: 'US Army Corps of Engineers flood control dam setting. Mix of open areas, woods, water hazards, and rolling elevation. Redesigned 2010. Concrete/asphalt tees. Companion 12-hole amateur course on same property. 7200 ft main layout.',
    amenities: ['parking', 'tee signs', 'scorecards', 'restrooms'],
    year_established: 1998,
    fees: 'Free',
    course_length_ft: 7200,
    pdga_course_id: '25022',
  },

  {
    name: 'Meadowbrook Orchards Disc Golf',
    city: 'Sterling',
    state: 'MA',
    holes: 18,
    par: 60,
    lat: 42.424198,
    lng: -71.720760,
    terrain: 'mixed',
    difficulty: 3,
    source: 'pdga',
    pdga_rating: 5.0,
    dgcoursereview_rating: 4.4,
    notable_features: 'Built on an organic fruit, vegetable, and flower farm with panoramic views on the final 5 holes. DiscGolfPark Pro targets on paver tees; cart-friendly. Restaurant/cafe on site. 7000 ft course with 8 holes over 400 ft.',
    amenities: ['restrooms', 'parking', 'camping', 'tee signs', 'restaurant', 'pro shop'],
    year_established: 2022,
    fees: '$10-15/round',
    designer: 'Bob Kulchuk, David Chandler',
    course_length_ft: 7000,
    pdga_course_id: '288161',
  },

  // ─── CENTRAL MA / NORTH-CENTRAL ─────────────────────────────────────────────

  {
    name: 'Barre Falls Disc Golf Course',
    city: 'Barre',
    state: 'MA',
    holes: 18,
    par: 54,
    lat: 42.427967,
    lng: -72.023800,
    terrain: 'mixed',
    difficulty: 3,
    source: 'pdga',
    pdga_rating: 5.0,
    notable_features: 'US Army Corps of Engineers dam course. Open by New England standards — scattered foliage, elevation changes, and water hazards. Rubber tees; DISCatcher targets. Camping on site. 5361 ft layout.',
    amenities: ['parking', 'camping', 'restrooms', 'tee signs', 'scorecards'],
    year_established: 2001,
    fees: 'Free',
    designer: 'Jason Southwick',
    course_length_ft: 5361,
    pdga_course_id: '25487',
  },

  {
    name: 'Flat Rock Disc Golf',
    city: 'Athol',
    state: 'MA',
    holes: 18,
    par: 54,
    lat: 42.576200,
    lng: -72.208300,
    terrain: 'mixed',
    difficulty: 3,
    source: 'pdga',
    pdga_rating: 4.0,
    dgcoursereview_rating: 3.7,
    notable_features: 'Rolling open meadows with water hazards — less wooded than typical NE courses. Crushed stone tees with slight slope elevation. Pay-to-play private property open to public. 6180 ft layout.',
    amenities: ['parking', 'camping', 'restrooms', 'tee signs'],
    year_established: 2003,
    fees: 'Paid',
    course_length_ft: 6180,
    pdga_course_id: '26798',
  },

  {
    name: 'Tully Lake Disc Golf Course',
    city: 'Royalston',
    state: 'MA',
    holes: 18,
    par: 54,
    lat: 42.641362,
    lng: -72.224599,
    terrain: 'wooded',
    difficulty: 3,
    source: 'pdga',
    pdga_rating: 4.0,
    dgcoursereview_rating: 3.9,
    notable_features: 'US Army Corps of Engineers facility at Tully Lake. Scenic lakeside setting with trails. Mix of wooded and open holes with varied elevation. DISCatcher targets on mixed tee types. Campground adjacent. 5943 ft layout.',
    amenities: ['parking', 'camping', 'tee signs', 'scorecards'],
    year_established: 2005,
    fees: 'Free',
    course_length_ft: 5943,
    pdga_course_id: '26082',
  },

  {
    name: '501 Disc Golf',
    city: 'Warren',
    state: 'MA',
    holes: 18,
    par: 60,
    lat: 42.195500,
    lng: -72.196800,
    terrain: 'wooded',
    difficulty: 4,
    source: 'pdga',
    pdga_rating: 5.0,
    dgcoursereview_rating: 4.7,
    notable_features: 'Classic New England woods course carved from mature trees with 3 open field holes. Figure-8 layout through very hilly terrain. Two layouts: Green/short 5324 ft, Blue/long 7255 ft. Prodigy T1 targets. Women-owned family operation. Designed by Jason Southwick.',
    amenities: ['parking', 'restrooms', 'tee signs'],
    year_established: 2016,
    fees: 'Paid',
    designer: 'Jason Southwick',
    course_length_ft: 7255,
    pdga_course_id: '228101',
  },

  {
    name: 'Mile Marker 63 Disc Golf',
    city: 'East Brookfield',
    state: 'MA',
    holes: 18,
    par: 60,
    lat: 42.227663,
    lng: -72.064730,
    terrain: 'mixed',
    difficulty: 3,
    source: 'pdga',
    pdga_rating: 5.0,
    dgcoursereview_rating: 4.4,
    notable_features: 'Designed by Simon Lizotte & Casey White on a former 9-hole ball golf course and organic farm. Beautiful views with water OB, fence OB, and mandatories. MVP Black Hole Portal targets on artificial turf tees. Two layouts: 7714 ft / 6058 ft. Hosts Massachusetts State Championships.',
    amenities: ['parking', 'camping', 'restrooms', 'tee signs', 'farm stand', 'pro shop'],
    year_established: 2024,
    fees: 'Paid',
    designer: 'Simon Lizotte & Casey White',
    course_length_ft: 7714,
    pdga_course_id: '306328',
  },

  // ─── GREATER BOSTON / METRO ──────────────────────────────────────────────────

  {
    name: 'Devens Disc Golf Course',
    city: 'Devens',
    state: 'MA',
    holes: 18,
    par: 54,
    lat: 42.550139,
    lng: -71.603911,
    terrain: 'wooded',
    difficulty: 3,
    source: 'pdga',
    pdga_rating: 4.0,
    notable_features: 'Technical course up and down an old military training hill on the former Fort Devens base. Hilly, rocky, and wooded with beautiful boulders and heavy elevation changes. Rubber mat tees; Chainstar targets. Free public course. 4644 ft layout.',
    amenities: ['parking', 'tee signs'],
    year_established: 2006,
    fees: 'Free',
    designer: 'John Borelli',
    course_length_ft: 4644,
    pdga_course_id: '26421',
  },

  {
    name: 'Pye Brook Park Disc Golf Course',
    city: 'Topsfield',
    state: 'MA',
    holes: 20,
    par: 60,
    lat: 42.663660,
    lng: -70.959090,
    terrain: 'mixed',
    difficulty: 3,
    source: 'pdga',
    pdga_rating: 3.2,
    notable_features: 'Built on the periphery of a capped landfill — unique open terrain on the North Shore. Challenging elevation changes with sloped greens. 3 wooded holes, water hazards, and a 777 ft 19th hole. 20 holes total; 6456 ft layout. Gate closed Nov-Apr (walk in).',
    amenities: ['parking', 'restrooms', 'tee signs'],
    year_established: 2004,
    fees: 'Free',
    course_length_ft: 6456,
    pdga_course_id: '25895',
  },

  {
    name: 'Amesbury Pines Disc Golf Course',
    city: 'Amesbury',
    state: 'MA',
    holes: 18,
    par: 54,
    lat: 42.852500,
    lng: -70.925000,
    terrain: 'wooded',
    difficulty: 2,
    source: 'pdga',
    pdga_rating: 3.0,
    notable_features: 'One of Massachusetts\'s oldest disc golf courses (est. 1997). Pine-wooded park setting on the North Shore. Free public municipal course.',
    amenities: ['parking', 'tee signs'],
    year_established: 1997,
    fees: 'Free',
    pdga_course_id: '25024',
  },

  // ─── SOUTH SHORE ────────────────────────────────────────────────────────────

  {
    name: 'Borderland State Park Disc Golf Course',
    city: 'Easton',
    state: 'MA',
    holes: 18,
    par: 56,
    lat: 42.062468,
    lng: -71.165710,
    terrain: 'mixed',
    difficulty: 4,
    source: 'pdga',
    pdga_rating: 4.8,
    dgcoursereview_rating: 4.2,
    notable_features: 'Longest course in New England at 8585 ft main layout / 5080 ft alternate. Scenic combination of grassy fields, woods, and elevation. Dual tees and dual baskets (Chainstar). Practice basket available. Highest-rated course in MA on PDGA. Gates close at 8pm summer / 4pm winter.',
    amenities: ['parking', 'restrooms', 'tee signs', 'scorecards', 'practice basket'],
    year_established: 1999,
    fees: '$5/day parking',
    course_length_ft: 8585,
    pdga_course_id: '25023',
  },

  // ─── CAPE COD / ISLANDS ──────────────────────────────────────────────────────

  {
    name: 'Burgess Park Disc Golf Course',
    city: 'Marstons Mills',
    state: 'MA',
    holes: 18,
    par: 54,
    lat: 41.663420,
    lng: -70.405950,
    terrain: 'wooded',
    difficulty: 2,
    source: 'pdga',
    pdga_rating: 4.5,
    notable_features: 'Cape Cod\'s primary disc golf destination since 1990. Short mostly-wooded layout with Blue/pro, White/am, and Red/beginner tee sets. Hosts the Cape Cod Open annually. Adjacent playground; scorecards available. 4197 ft long layout.',
    amenities: ['parking', 'restrooms', 'tee signs', 'playground', 'scorecards'],
    year_established: 1990,
    fees: 'Free',
    course_length_ft: 4197,
    pdga_course_id: '25026',
  },

  {
    name: 'Nantucket Disc Golf Course',
    city: 'Nantucket',
    state: 'MA',
    holes: 18,
    par: 68,
    lat: 41.261067,
    lng: -70.080110,
    terrain: 'wooded',
    difficulty: 3,
    source: 'pdga',
    pdga_rating: 4.5,
    notable_features: 'Championship-style course in Nantucket State Forest South Pasture. Long layout par 68 with three par-5 holes. Short tees great for beginners; long tees challenge the best at 8773 ft. Just 2 miles from Nantucket town. Rubber tees; DISCatcher targets; handicap accessible.',
    amenities: ['parking', 'tee signs'],
    year_established: 2012,
    fees: 'Free',
    designer: 'John Houck',
    course_length_ft: 8773,
    pdga_course_id: '30068',
  },

  {
    name: 'Oakcrest Cove Disc Golf Course',
    city: 'Sandwich',
    state: 'MA',
    holes: 36,
    par: 108,
    lat: 41.762000,
    lng: -70.512000,
    terrain: 'wooded',
    difficulty: 3,
    source: 'pdga',
    pdga_rating: 3.0,
    notable_features: '36-hole facility near Cape Cod — one of the largest in MA. Two full 18-hole layouts in wooded Cape Cod terrain. Established 2021.',
    amenities: ['parking', 'tee signs'],
    year_established: 2021,
    fees: 'Paid',
    course_length_ft: null,
    pdga_course_id: '282004',
  },

  // ─── PIONEER VALLEY / WESTERN MA ────────────────────────────────────────────

  {
    name: 'Northampton State Hospital Disc Golf Course',
    city: 'Northampton',
    state: 'MA',
    holes: 18,
    par: 54,
    lat: 42.312778,
    lng: -72.655278,
    terrain: 'mixed',
    difficulty: 3,
    source: 'pdga',
    pdga_rating: 3.0,
    notable_features: 'On the former grounds of Northampton State Psychiatric Hospital (demolished 2006). Variable terrain from tight woods to open fields with extreme slopes. Multi-use area shared with walkers and trail runners. Free public course. 5200 ft layout.',
    amenities: ['parking'],
    year_established: 2003,
    fees: 'Free',
    course_length_ft: 5200,
    pdga_course_id: '26010',
  },

  {
    name: 'NEDGC Spoonwood Ridge',
    city: 'Southwick',
    state: 'MA',
    holes: 18,
    par: 60,
    lat: 42.050127,
    lng: -72.803497,
    terrain: 'wooded',
    difficulty: 3,
    source: 'pdga',
    pdga_rating: 3.5,
    notable_features: 'Classic New England woods course with elevation changes, streams, and stone walls. Towering pines, oaks, and maples. Prodigy T1 targets; two layouts: 7494 ft (white) / 5548 ft (red). Annual membership available. Part of two-course New England Disc Golf Center facility. Designed by Chris Barden.',
    amenities: ['parking', 'restrooms', 'camping', 'tee signs'],
    year_established: 2017,
    fees: '$10/day or $100/year',
    designer: 'Chris Barden',
    course_length_ft: 7494,
    pdga_course_id: '237126',
  },

  {
    name: 'NEDGC Calico Creek',
    city: 'Southwick',
    state: 'MA',
    holes: 18,
    par: 54,
    lat: 42.050874,
    lng: -72.802741,
    terrain: 'mixed',
    difficulty: 2,
    source: 'pdga',
    pdga_rating: 5.0,
    notable_features: 'Beginner-friendly layout sharing the NEDGC property with Spoonwood Ridge. 12 woods holes, 4 woods-to-open transitions, 2 open holes. All holes under 300 ft — ideal for skill development. Prodigy T2 targets on artificial turf tees. 3925 ft / 3056 ft layouts. Designed by Chris Barden.',
    amenities: ['parking', 'restrooms', 'camping', 'tee signs'],
    year_established: 2018,
    fees: '$10/day or $100/year',
    designer: 'Chris Barden',
    course_length_ft: 3925,
    pdga_course_id: '241586',
  },

  {
    name: 'Mountainside Disc Golf at Flynt Park',
    city: 'Monson',
    state: 'MA',
    holes: 18,
    par: 54,
    lat: 42.091000,
    lng: -72.318000,
    terrain: 'wooded',
    difficulty: 4,
    source: 'pdga',
    pdga_rating: 4.0,
    dgcoursereview_rating: 4.25,
    notable_features: 'One of the more demanding elevation courses in western MA with very hilly terrain. DISCatcher targets with dual pin positions on turf tees. Pioneer Valley / Hampden County location. Free public park course.',
    amenities: ['parking', 'restrooms', 'camping nearby', 'tee signs'],
    year_established: 2017,
    fees: 'Free',
    pdga_course_id: '237104',
  },

  // ─── BERKSHIRES / FAR WESTERN MA ────────────────────────────────────────────

  {
    name: 'Windsor Lake Disc Golf Course',
    city: 'North Adams',
    state: 'MA',
    holes: 18,
    par: 54,
    lat: 42.700000,
    lng: -73.109000,
    terrain: 'wooded',
    difficulty: 3,
    source: 'pdga',
    pdga_rating: 4.0,
    notable_features: 'Berkshires course in North Adams city park at Windsor Lake. Heavily wooded with significant terrain changes. Expanded from 9 to 18 holes in 2019 by volunteers. Two layouts: 5064 ft / 3750 ft (DISCatcher targets). $5/car parking fee in summer. Designed by Chris Smitty Tolar.',
    amenities: ['parking', 'restrooms', 'camping', 'tee signs'],
    year_established: 2016,
    fees: '$5/car parking',
    designer: 'Chris Tolar',
    course_length_ft: 5064,
    pdga_course_id: '229007',
  },

  // ─── ADDITIONAL NOTABLE COURSES ─────────────────────────────────────────────

  {
    name: 'Oakholm Disc Golf',
    city: 'Brookfield',
    state: 'MA',
    holes: 18,
    par: 54,
    lat: 42.200000,
    lng: -72.087000,
    terrain: 'wooded',
    difficulty: 4,
    source: 'pdga',
    dgcoursereview_rating: 4.5,
    notable_features: 'Very hilly, heavily wooded private pay-to-play course. DISCatcher targets on concrete tees. 5044 ft layout. Features a short 6-hole Peanut\'s Putter Course (676 ft) for putting practice.',
    amenities: ['parking', 'restrooms', 'tee signs'],
    year_established: 2022,
    fees: 'Paid',
    course_length_ft: 5044,
  },

  {
    name: 'Sunnymede Disc Golf Course',
    city: 'Middleborough',
    state: 'MA',
    holes: 18,
    par: 54,
    lat: 41.891000,
    lng: -70.921000,
    terrain: 'wooded',
    difficulty: 3,
    source: 'pdga',
    pdga_rating: 4.0,
    dgcoursereview_rating: 3.6,
    notable_features: 'Private pay-to-play course on the South Shore. Moderately hilly wooded fairways. Prodigy targets on concrete tees; dual tees and dual baskets. 6870 ft layout. Pet-free facility.',
    amenities: ['parking', 'restrooms', 'camping nearby', 'tee signs'],
    year_established: 2017,
    fees: 'Paid',
    course_length_ft: 6870,
    pdga_course_id: '237139',
  },

  {
    name: 'Hazel Hill Disc Golf',
    city: 'Bellingham',
    state: 'MA',
    holes: 18,
    par: 54,
    lat: 42.084800,
    lng: -71.476200,
    terrain: 'wooded',
    difficulty: 3,
    source: 'pdga',
    pdga_rating: 4.5,
    dgcoursereview_rating: 4.3,
    notable_features: 'Highly rated private woods course south of Worcester. Tight fairways through mature New England forest. Well-maintained with excellent basket placement and creative hole designs.',
    amenities: ['parking', 'tee signs', 'restrooms'],
    year_established: 2015,
    fees: 'Paid',
    course_length_ft: 5800,
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
  console.log(`\n🥏 Massachusetts Disc Golf Course Import`);
  console.log(`📡 API: ${BASE_URL}`);
  console.log(`📋 Courses to add: ${MASSACHUSETTS_COURSES.length}\n`);

  // Check existing MA courses
  const existing = await makeRequest('GET', '/api/admin/courses?state=MA&limit=200');
  const existingNames = new Set(
    (existing.data.courses || []).map(c => c.name.toLowerCase().trim())
  );
  console.log(`ℹ️  Existing MA courses in DB: ${existingNames.size}`);
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

  for (const course of MASSACHUSETTS_COURSES) {
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
      console.log(`✅ ADDED: ${course.name} (${course.city}) - ${course.holes}h`);
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
