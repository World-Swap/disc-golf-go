/**
 * seed-youtube-videos.js
 * Seeds YouTube video metadata for training lessons from research report data.
 * Expects a research-report JSON file with video data per lesson slug.
 * Run: node scripts/seed-youtube-videos.js
 */

const https = require('https');
const { Pool } = require('pg');

function checkOembed(url) {
  return new Promise((resolve) => {
    const oembedUrl = 'https://www.youtube.com/oembed?url=' + encodeURIComponent(url) + '&format=json';
    const req = https.get(oembedUrl, (res) => resolve(res.statusCode === 200));
    req.on('error', () => resolve(false));
    req.setTimeout(10000, () => { req.destroy(); resolve(false); });
  });
}

if (!process.env.DATABASE_URL) {
  console.error('[seed-youtube] DATABASE_URL not set — exiting');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  idleTimeoutMillis: 15000,
  connectionTimeoutMillis: 10000,
});

async function run() {
  // Load research report — expects research-youtube-videos.json in project root
  let report;
  try {
    report = require('../research-youtube-videos.json');
  } catch (e) {
    console.error('[seed-youtube] Could not load research-youtube-videos.json:', e.message);
    console.error('Expected file: research-youtube-videos.json with { lessons: [{ slug, youtube_url, youtube_title, youtube_channel }] }');
    process.exit(1);
  }

  const lessons = Array.isArray(report.lessons) ? report.lessons : [];
  if (!lessons.length) {
    console.error('[seed-youtube] No lessons found in research report');
    process.exit(1);
  }

  console.log('[seed-youtube] Loaded', lessons.length, 'video entries from research report');

  let seeded = 0;
  let skipped = 0;

  for (const entry of lessons) {
    if (!entry.slug || !entry.youtube_url) {
      console.warn('[seed-youtube] Skipping entry missing slug or youtube_url:', entry.slug || entry);
      skipped++;
      continue;
    }

    // Verify the URL is actually playable before writing
    const ok = await checkOembed(entry.youtube_url);
    if (!ok) {
      console.warn('  ✗ oEmbed check failed (skipping):', entry.slug, entry.youtube_url);
      skipped++;
      continue;
    }

    // Upsert based on lesson slug
    const result = await pool.query(`
      UPDATE training_lessons
      SET youtube_url = $2,
          youtube_title = $3,
          youtube_channel = $4
      WHERE slug = $1
      RETURNING id, title
    `, [entry.slug, entry.youtube_url, entry.youtube_title || null, entry.youtube_channel || null]);

    if (result.rows.length) {
      console.log('  ✓ Seeded:', result.rows[0].title, '|', entry.youtube_url);
      seeded++;
    } else {
      console.warn('  ✗ No lesson found for slug:', entry.slug);
      skipped++;
    }
  }

  console.log('\n[seed-youtube] Done — Seeded', seeded, '/', lessons.length, 'lessons | Skipped:', skipped);
  await pool.end();
}

run().catch(err => {
  console.error('[seed-youtube] Error:', err.message);
  pool.end();
  process.exit(1);
});