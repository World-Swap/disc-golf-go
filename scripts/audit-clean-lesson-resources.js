/**
 * audit-clean-lesson-resources.js
 *
 * Audits and cleans dead Further Reading links from lesson_resources table.
 *
 * 1. Count baseline entries
 * 2. Remove Will Schusterick entry (known dead YouTube URL)
 * 3. Audit remaining URLs — HTTP HEAD check with redirects
 * 4. Delete rows with dead/broken URLs (404, 410, timeout, YouTube unavailable)
 * 5. Report before/removed/remaining counts
 *
 * Run: node scripts/audit-clean-lesson-resources.js
 */

// Load .env manually — dotenv may not be installed in all environments
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  });
}

const https = require('https');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('[audit] DATABASE_URL not set — exiting');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  idleTimeoutMillis: 15000,
  connectionTimeoutMillis: 15000,
});

const KNOWN_BAD_YOUTUBE_URL = 'https://www.youtube.com/watch?v=7EwDeWqR-7o';
const REQUEST_TIMEOUT_MS = 10000;
const BATCH_SIZE = 10;

function httpHead(url) {
  return new Promise((resolve) => {
    const isHttps = url.startsWith('https://');
    const module = isHttps ? https : require('http');
    let hostname, pathname;

    try {
      const parsed = new URL(url);
      hostname = parsed.hostname;
      pathname = parsed.pathname + parsed.search;
    } catch {
      resolve({ dead: true, reason: 'invalid-url' });
      return;
    }

    const options = {
      hostname,
      path: pathname,
      method: 'HEAD',
      timeout: REQUEST_TIMEOUT_MS,
    };

    const req = module.request(options, (res) => {
      // YouTube returns 200 but may have "video unavailable" in body for some URLs
      // We treat YouTube as dead if status >= 400 OR location is a known-bad pattern
      if (res.statusCode >= 400) {
        resolve({ dead: true, reason: `http-${res.statusCode}` });
        return;
      }

      // Check for YouTube unavailable video redirect
      const location = res.headers.location || '';
      if (location.includes('youtube.com/error') || location.includes('google.com/sorry')) {
        resolve({ dead: true, reason: 'youtube-unavailable' });
        return;
      }

      resolve({ dead: false, status: res.statusCode });
    });

    req.on('error', (err) => {
      resolve({ dead: true, reason: `network-error: ${err.message}` });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ dead: true, reason: 'timeout' });
    });

    req.end();
  });
}

async function checkUrlBatch(urls) {
  const results = [];
  for (const url of urls) {
    results.push(await httpHead(url));
  }
  return results;
}

async function run() {
  const client = await pool.connect();
  try {
    // ── Step 1: Count baseline ─────────────────────────────────────────────
    const baselineResult = await client.query('SELECT COUNT(*) FROM lesson_resources');
    const baseline = parseInt(baselineResult.rows[0].count, 10);
    console.log(`\n[audit] Baseline: ${baseline} lesson_resources entries\n`);
    console.log('─'.repeat(60));

    // ── Step 2: Remove Will Schusterick entry ──────────────────────────────
    const willDeleteResult = await client.query(
      `DELETE FROM lesson_resources WHERE url = $1 RETURNING id, title`,
      [KNOWN_BAD_YOUTUBE_URL]
    );
    const willRemoved = willDeleteResult.rowCount;
    if (willRemoved > 0) {
      console.log(`[audit] Removed Will Schusterick entry (${willRemoved} row(s)):`);
      willDeleteResult.rows.forEach(r => console.log(`  - "${r.title}" | ${KNOWN_BAD_YOUTUBE_URL}`));
    } else {
      console.log('[audit] No Will Schusterick entry found (already removed or different URL)');
    }
    console.log('─'.repeat(60));

    // ── Step 3: Fetch remaining URLs ───────────────────────────────────────
    const urlsResult = await client.query(
      `SELECT id, title, url FROM lesson_resources WHERE url IS NOT NULL AND url != '' ORDER BY id`
    );
    const rows = urlsResult.rows;
    console.log(`[audit] Checking ${rows.length} remaining URLs...`);

    const deadRows = [];
    let checked = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const batchResults = await checkUrlBatch(batch.map(r => r.url));

      batch.forEach((row, idx) => {
        checked++;
        const result = batchResults[idx];
        if (result.dead) {
          deadRows.push({ id: row.id, title: row.title, url: row.url, reason: result.reason });
          console.log(`[dead] ${row.url}\n         reason: ${result.reason}\n         title: "${row.title}"`);
        }
      });

      // Progress indicator for batches
      process.stdout.write(`\r[audit] Checked ${checked}/${rows.length} URLs...`);
    }
    console.log(`\n[audit] URL audit complete.\n`);

    // ── Step 4: Delete dead rows ───────────────────────────────────────────
    let deadRemoved = 0;
    if (deadRows.length > 0) {
      const deadIds = deadRows.map(r => r.id);
      const deleteResult = await client.query(
        `DELETE FROM lesson_resources WHERE id = ANY($1) RETURNING id, title`,
        [deadIds]
      );
      deadRemoved = deleteResult.rowCount;
      console.log(`[audit] Deleted ${deadRemoved} dead URL row(s):`);
      deleteResult.rows.forEach(r => console.log(`  - "${r.title}" (id=${r.id})`));
    } else {
      console.log('[audit] No dead URLs found — none deleted.');
    }
    console.log('─'.repeat(60));

    // ── Step 5: Count remaining ────────────────────────────────────────────
    const remainingResult = await client.query('SELECT COUNT(*) FROM lesson_resources');
    const remaining = parseInt(remainingResult.rows[0].count, 10);
    console.log('─'.repeat(60));
    console.log('\n[audit] SUMMARY');
    console.log('─'.repeat(60));
    console.log(`  Entries before cleanup : ${baseline}`);
    console.log(`  Removed (Will Schusterick): ${willRemoved}`);
    console.log(`  Removed (dead URLs)     : ${deadRemoved}`);
    console.log(`  Total removed           : ${willRemoved + deadRemoved}`);
    console.log(`  Entries remaining       : ${remaining}`);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('[audit] Fatal error:', err.message);
  process.exit(1);
});