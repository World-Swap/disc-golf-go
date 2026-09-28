// scripts/videos-refresh.js
// Pulls each instructional channel's recent uploads from YouTube's own per-
// channel RSS feed and records them in channel_videos.
//
// RSS rather than the YouTube Data API on purpose: no API key to hold, no
// quota to run out of, and the feed already carries exactly what the section
// needs -- the id, title and publish date of the latest ~15 uploads.
//
// Runs on a schedule (src/lib/scheduler.ts). Safe to run as often as you
// like: every write is an upsert keyed on the video id.
'use strict';

try { require('dotenv').config({ path: require('path').join(__dirname, '../.env') }); } catch { /* Render injects env directly */ }
const { Pool } = require('pg');
const { VIDEO_CHANNELS } = require('./video-channels.json');
// One rule, one place. The classifier is TypeScript because the API and its
// tests use it too; this job runs it through ts-node rather than keeping a
// second copy of the patterns that could drift from the first.
require('ts-node/register/transpile-only');
const { teaches } = require('../src/modules/videos/teaches');

const FEED = 'https://www.youtube.com/feeds/videos.xml?channel_id=';
const TIMEOUT_MS = 15000;
const GAP_MS = 250;            // be a polite neighbour to a free endpoint

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** XML text nodes arrive escaped; the five predefined entities are all Atom uses. */
function unescapeXml(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');           // last, so "&amp;lt;" does not become "<"
}

function firstMatch(text, re) {
  const m = text.match(re);
  return m ? unescapeXml(m[1]).trim() : null;
}

/**
 * Pull the entries out of one Atom feed.
 * The channel's own <title> is used as its name rather than whatever we had
 * on file: resolving a channel from a video page gives the channel that
 * HOSTED the video, which for a pro's name is often a coverage or brand
 * channel. The feed is the only authority on what a channel is called.
 */
function parseFeed(xml) {
  // The feed's own title is the one before the first <entry>.
  const head = xml.split('<entry>')[0];
  const channelName = firstMatch(head, /<title>([\s\S]*?)<\/title>/);
  const channelId = firstMatch(head, /<yt:channelId>([\s\S]*?)<\/yt:channelId>/);

  const videos = [];
  const re = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const e = m[1];
    const videoId = firstMatch(e, /<yt:videoId>([\s\S]*?)<\/yt:videoId>/);
    const title = firstMatch(e, /<title>([\s\S]*?)<\/title>/);
    const published = firstMatch(e, /<published>([\s\S]*?)<\/published>/);
    // The feed says which kind of upload this is: the alternate link is
    // /shorts/<id> for a Short and /watch?v=<id> for everything else. That is
    // the only free signal there is, and it is a reliable one.
    const link = firstMatch(e, /<link rel="alternate" href="([^"]*)"/) || '';
    const isShort = link.includes('/shorts/');
    // A row is only worth having if all three are present and sane.
    if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) continue;
    if (!title || !published || Number.isNaN(Date.parse(published))) continue;
    videos.push({ videoId, title, published, isShort });
  }
  return { channelName, channelId, videos };
}

async function fetchFeed(channelId) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(FEED + channelId, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'disc-golf-go/1.0 (+https://discgolfgo.app)' },
    });
    if (!r.ok) return { error: 'HTTP ' + r.status };
    return { xml: await r.text() };
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'timed out' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

async function run() {
  const client = await pool.connect();
  let added = 0, updated = 0, failed = 0;
  try {
    for (const ch of VIDEO_CHANNELS) {
      const { xml, error } = await fetchFeed(ch.channel_id);
      if (error) {
        // One unreachable channel must not cost the other twenty-four.
        failed++;
        console.log('[videos] ' + ch.name + ': ' + error);
        await wait(GAP_MS);
        continue;
      }
      const feed = parseFeed(xml);
      const name = feed.channelName || ch.name;
      if (!feed.videos.length) {
        failed++;
        console.log('[videos] ' + name + ': feed had no entries');
        await wait(GAP_MS);
        continue;
      }
      for (const v of feed.videos) {
        const r = await client.query(
          `INSERT INTO channel_videos (video_id, channel_id, channel_name, title, published_at, is_short, feed_hidden, teaches)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (video_id) DO UPDATE
              SET title = EXCLUDED.title,
                  channel_name = EXCLUDED.channel_name,
                  is_short = EXCLUDED.is_short,
                  feed_hidden = EXCLUDED.feed_hidden,
                  teaches = EXCLUDED.teaches,
                  fetched_at = NOW()
           RETURNING (xmax = 0) AS inserted`,
          // A Short is hidden unless this channel teaches in Shorts. The
          // training feed additionally needs the channel to be one we trust to
          // teach at all -- `ch.teaches === false` keeps a channel in the
          // lounge while keeping it out of the training list.
          [v.videoId, ch.channel_id, name, v.title, v.published, v.isShort,
           v.isShort && !ch.shorts, ch.teaches !== false && teaches(v.title)]
        );
        if (r.rows[0] && r.rows[0].inserted) added++; else updated++;
      }
      // The feed only carries the latest ~15, so flipping a channel's shorts
      // setting would otherwise leave its older rows on the old decision
      // forever. Reconcile the whole channel, not just what came back today.
      await client.query(
        'UPDATE channel_videos SET feed_hidden = ($2::boolean AND is_short) ' +
        'WHERE channel_id = $1 AND feed_hidden IS DISTINCT FROM ($2::boolean AND is_short)',
        [ch.channel_id, !ch.shorts]
      );
      // A channel dropped from the training allowlist must lose its old rows
      // there too, not just stop adding new ones.
      if (ch.teaches === false) {
        await client.query(
          'UPDATE channel_videos SET teaches = FALSE WHERE channel_id = $1 AND teaches',
          [ch.channel_id]
        );
      }
      await wait(GAP_MS);
    }
    const total = await client.query(
      `SELECT COUNT(*) FILTER (WHERE NOT feed_hidden)::text AS shown,
              COUNT(*) FILTER (WHERE feed_hidden)::text AS hidden,
              COUNT(*) FILTER (WHERE teaches AND NOT feed_hidden)::text AS teaching
         FROM channel_videos`);
    console.log('[videos] ' + added + ' new, ' + updated + ' refreshed, ' + failed +
                ' channel(s) unavailable; showing ' + total.rows[0].shown + ' videos (' +
                total.rows[0].hidden + ' shorts hidden), of which ' +
                total.rows[0].teaching + ' teach');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((e) => { console.error('[videos] failed:', e); process.exit(1); });
