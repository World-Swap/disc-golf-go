// scripts/audit-lessons.js
// Checks the training library against the sources it cites, rather than
// against what we stored about them.
//
// This exists because of what a full sweep found on 2026-09-29: every one of
// the 204 videos still played and every article link was live, yet THREE
// lessons were leading with BALL golf -- a USGA penalty-area ruling filed
// under "Water Hazards", and two golf mental-game channels. A fourth led with
// a channel whose other uploads are wedge shots and a 4th-grade social studies
// lesson. All four rank for "disc golf <topic>" searches, which is how they
// got in. So the thing worth automating is not "does the link work" but "is
// this actually a disc golf video about this lesson".
//
// READ-ONLY. It reports; it never edits lessons.ts. Choosing a replacement
// video needs judgement -- the top search hit for a mental-game lesson is
// routinely a putting video by a famous pro, which scores well and teaches
// the wrong thing.
//
// Usage:
//   node scripts/audit-lessons.js                    # whole library
//   node scripts/audit-lessons.js --slugs a,b,c      # just these lessons
//   node scripts/audit-lessons.js --category mental-game
//   node scripts/audit-lessons.js --videos-only      # skip the article fetch
//   node scripts/audit-lessons.js --json             # machine-readable
//
// Exit status: 1 if anything BLOCKING was found (a dead video, a dead link, or
// a wrong-sport channel), else 0 -- so a content batch can be gated on it.
'use strict';

const https = require('https');

// The library is TypeScript and is the single source of truth, so read it
// through ts-node rather than keeping a parallel copy that could drift.
require('ts-node/register/transpile-only');
const { LESSONS } = require('../src/db/data/lessons');

const TIMEOUT_MS = 25000;
const VIDEO_GAP_MS = 250;      // oEmbed is generous; this is politeness
const FEED_GAP_MS = 300;
const CONCURRENCY = 6;

// ── what counts as disc golf ────────────────────────────────────────────────
// Deliberately broad on DISC and narrow on BALL: a false "ball golf" alarm
// costs a human thirty seconds, a missed one ships a golf video to a player.
const DISC = /disc ?golf|discgolf|putter|midrange|mid-range|hyzer|anhyzer|forehand|backhand|basket|dgpt|pdga|upshot|teepad|tee ?pad/i;
const BALL = /\b(handicap|clubfit\w*|wedge|iron play|tee box|pga tour|golf swing|puttview|ball golf|fairway wood|green ?keeper)\b/i;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function get(url) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body, url: res.headers.location || url }));
    });
    req.setTimeout(TIMEOUT_MS, () => { req.destroy(); resolve({ status: 0, body: '', url }); });
    req.on('error', () => resolve({ status: 0, body: '', url }));
  });
}

/** A YouTube id out of any of the shapes the library uses. */
function videoId(url) {
  const m = String(url || '').match(/[?&]v=([\w-]{11})|youtu\.be\/([\w-]{11})|embed\/([\w-]{11})/);
  return m ? m.slice(1).find(Boolean) : null;
}

/**
 * Ask YouTube about a video. oEmbed answers three questions at once: does it
 * still play, what is it really called, and WHOSE channel is it on. The last
 * one matters -- resolving a channel from a video page gives whoever HOSTED
 * it, which is how "Paul McBeth" once resolved to JomezPro.
 */
async function probeVideo(id) {
  const u = 'https://www.youtube.com/oembed?url='
    + encodeURIComponent('https://www.youtube.com/watch?v=' + id) + '&format=json';
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await get(u);
    if (r.status === 404) return { ok: false, reason: 'removed or private' };
    if (r.status === 401) return { ok: false, reason: 'embedding disabled' };
    if (r.status === 200) {
      try {
        const j = JSON.parse(r.body);
        return { ok: true, title: j.title, channel: (j.author_name || '').trim(), channelUrl: j.author_url };
      } catch { /* fall through to a retry */ }
    }
    await wait(700 * (attempt + 1));
  }
  return { ok: false, reason: 'unreachable' };
}

/**
 * What does a channel actually publish? Judged on its own RSS feed rather than
 * on its name -- "Coach Reese" sounds like a disc golf coach and is a
 * schoolteacher who plays ball golf.
 */
const feedCache = new Map();
async function probeChannel(channelUrl) {
  if (!channelUrl) return { verdict: 'unknown' };
  if (feedCache.has(channelUrl)) return feedCache.get(channelUrl);

  // Both hops are rate-limit sensitive: a throttled channel page comes back as
  // a ~700-byte stub with no externalId, and a throttled feed as zero entries.
  // Both look exactly like "channel has no disc golf", so retry before
  // believing either, and report an unverified channel rather than passing it.
  let out = { verdict: 'unreadable' };
  for (let attempt = 0; attempt < 3; attempt++) {
    const page = await get(channelUrl);
    const id = (page.body.match(/"externalId":"(UC[\w-]{22})"/) || [])[1];
    if (id) {
      const xml = await get('https://www.youtube.com/feeds/videos.xml?channel_id=' + id);
      const titles = [...xml.body.matchAll(/<media:title>([^<]*)<\/media:title>/g)].map((m) => m[1]);
      if (titles.length) {
        const joined = titles.join(' | ');
        const disc = (joined.match(new RegExp(DISC.source, 'gi')) || []).length;
        const ball = (joined.match(new RegExp(BALL.source, 'gi')) || []).length;
        out = {
          verdict: disc === 0 && ball > 0 ? 'ball golf'
            : disc === 0 ? 'no disc golf in recent uploads'
              : ball > disc ? 'mostly ball golf'
                // Some disc golf AND some ball golf. Not blocking -- but this
                // is exactly the shape of "Coach Reese", which posts disc golf
                // rounds, wedge shots and 4th-grade social studies lessons in
                // the same feed and passed every automated check last time.
                : ball > 0 ? 'mixed: posts ball golf too'
                  : 'disc golf',
          disc, ball, recent: titles.slice(0, 3),
        };
        break;
      }
    }
    await wait(1500 * (attempt + 1));
  }
  feedCache.set(channelUrl, out);
  await wait(FEED_GAP_MS);
  return out;
}

// ── topic fit ───────────────────────────────────────────────────────────────
const STOP = new Set(('the a an and or of to for your you in on is it how what why with vs do does '
  + 'not into all this that at be by from disc golf').split(/\s+/));
const keywords = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/)
  .filter((w) => w.length > 2 && !STOP.has(w));

/**
 * How much of the lesson's own vocabulary shows up in the video's real title.
 * A blunt instrument on purpose: it ranks, it does not judge. "Distance
 * Mechanics" scoring 0 against "How to Actually Throw Far" is a false alarm,
 * which is why low scores are reported for review rather than failed.
 */
function topicFit(lesson, videoTitle) {
  const want = new Set([...keywords(lesson.title), ...keywords(lesson.slug)]);
  if (!want.size) return 1;
  const have = keywords(videoTitle);
  let hit = 0;
  for (const w of want) if (have.some((h) => h.includes(w) || w.includes(h))) hit++;
  return hit / want.size;
}

async function mapLimit(items, limit, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...await Promise.all(items.slice(i, i + limit).map(fn)));
    await wait(VIDEO_GAP_MS);
  }
  return out;
}

// ── the audit ───────────────────────────────────────────────────────────────
async function run(lessons, opts) {
  const findings = { dead: [], wrongSport: [], mixedSport: [], unverified: [], titleDrift: [], credit: [], lowFit: [], deadLink: [] };

  // Every video reference: the lesson's primary, plus any resource videos.
  const refs = [];
  for (const l of lessons) {
    if (l.youtube_url) {
      refs.push({ kind: 'primary', lesson: l, url: l.youtube_url, title: l.youtube_title, author: l.youtube_channel });
    }
    for (const r of l.resources || []) {
      if (r.resource_type === 'video') refs.push({ kind: 'resource', lesson: l, url: r.url, title: r.title, author: r.author });
    }
  }

  const ids = [...new Set(refs.map((r) => videoId(r.url)).filter(Boolean))];
  process.stderr.write(`checking ${ids.length} videos across ${lessons.length} lessons\n`);
  const probes = new Map();
  let done = 0;
  await mapLimit(ids, CONCURRENCY, async (id) => {
    probes.set(id, await probeVideo(id));
    if (++done % 40 === 0) process.stderr.write(`  ...${done}/${ids.length}\n`);
  });

  // Channel verdicts, one per distinct channel rather than per video.
  const channels = [...new Set([...probes.values()].filter((p) => p.ok).map((p) => p.channelUrl))];
  process.stderr.write(`checking ${channels.length} channels\n`);
  const verdicts = new Map();
  for (const c of channels) verdicts.set(c, await probeChannel(c));

  for (const ref of refs) {
    const id = videoId(ref.url);
    const p = probes.get(id);
    const where = { lesson: ref.lesson.slug, category: ref.lesson.category_slug, kind: ref.kind, url: ref.url };

    if (!p || !p.ok) { findings.dead.push({ ...where, reason: p ? p.reason : 'unparseable url', stored: ref.title }); continue; }

    // Blocking requires POSITIVE evidence of the wrong sport, never merely the
    // absence of evidence for the right one. A channel's RSS feed carries only
    // its recent uploads, and for real disc golf channels that can be thin or
    // empty -- Scott Stokely posts almost nothing but Shorts, and the PDGA's
    // feed returns no entries at all. Failing those would be worse than useless.
    const v = verdicts.get(p.channelUrl) || { verdict: 'unknown' };
    if (v.verdict === 'ball golf' || v.verdict === 'mostly ball golf') {
      findings.wrongSport.push({ ...where, channel: p.channel, title: p.title, verdict: v.verdict, recent: v.recent });
    } else if (v.verdict === 'mixed: posts ball golf too') {
      findings.mixedSport.push({ ...where, channel: p.channel, title: p.title, disc: v.disc, ball: v.ball, recent: v.recent });
    } else if (v.verdict !== 'disc golf' && !DISC.test(p.title)) {
      // Nothing confirms this is disc golf -- not the channel, not the title.
      // Usually a thin feed; occasionally a USGA video. Worth a human minute.
      findings.unverified.push({
        ...where, channel: p.channel, title: p.title,
        why: v.verdict === 'unreadable' || v.verdict === 'unknown'
          ? 'channel lookup was throttled or returned nothing'
          : 'no disc golf in the channel\'s recent uploads or in the title',
        recent: v.recent,
      });
    }

    if (ref.title && norm(ref.title) !== norm(p.title)) {
      findings.titleDrift.push({ ...where, stored: ref.title, real: p.title });
    }

    // A credit is fine when the named person IS the channel, or is named in
    // the real title -- a pro's clinic hosted on a manufacturer's channel is
    // still that pro teaching. Anything else, nobody can justify.
    if (ref.author && norm(ref.author) !== norm(p.channel)) {
      const named = keywords(ref.author).some((w) => p.title.toLowerCase().includes(w));
      const spelling = norm(p.channel).includes(norm(ref.author)) || norm(ref.author).includes(norm(p.channel));
      if (!named && !spelling) findings.credit.push({ ...where, claimed: ref.author, real: p.channel, title: p.title });
    }

    if (ref.kind === 'primary') {
      const fit = topicFit(ref.lesson, p.title);
      if (fit < opts.fit) findings.lowFit.push({ ...where, fit: Number(fit.toFixed(2)), lessonTitle: ref.lesson.title, video: p.title, channel: p.channel });
    }
  }

  if (!opts.videosOnly) {
    const links = [...new Set(lessons.flatMap((l) => (l.resources || [])
      .filter((r) => r.resource_type !== 'video').map((r) => r.url)))];
    process.stderr.write(`checking ${links.length} article links\n`);
    await mapLimit(links, CONCURRENCY, async (url) => {
      const r = await get(url);
      if (r.status === 0 || r.status >= 400) {
        const used = lessons.filter((l) => (l.resources || []).some((x) => x.url === url)).map((l) => l.slug);
        findings.deadLink.push({ url, status: r.status || 'no response', lessons: used });
      }
    });
  }

  findings.lowFit.sort((a, b) => a.fit - b.fit);
  return findings;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function report(f, opts) {
  const line = (s) => process.stdout.write(s + '\n');
  const blocking = f.dead.length + f.wrongSport.length + f.deadLink.length;

  line('');
  if (f.dead.length) {
    line(`✗ VIDEOS THAT NO LONGER PLAY (${f.dead.length})`);
    for (const d of f.dead) line(`    ${d.lesson} [${d.kind}] — ${d.reason}\n      "${d.stored || ''}"  ${d.url}`);
    line('');
  }
  if (f.wrongSport.length) {
    line(`✗ WRONG SPORT (${f.wrongSport.length}) — the reason this script exists`);
    for (const w of f.wrongSport) {
      line(`    ${w.lesson} [${w.kind}] — ${w.channel}: ${w.verdict}`);
      line(`      "${w.title}"`);
      if (w.recent) line(`      that channel's recent uploads: ${w.recent.join(' / ').slice(0, 120)}`);
    }
    line('');
  }
  if (f.deadLink.length) {
    line(`✗ DEAD ARTICLE LINKS (${f.deadLink.length})`);
    for (const d of f.deadLink) line(`    ${d.status}  ${d.url}\n      used by: ${d.lessons.join(', ')}`);
    line('');
  }
  if (f.mixedSport.length) {
    line(`· CHANNELS THAT ALSO POST BALL GOLF (${f.mixedSport.length}) — READ THESE`);
    line('  A channel can post disc golf rounds AND wedge shots. That is the shape');
    line('  "Coach Reese" had, and it passed every automated check last time.');
    for (const m of f.mixedSport) {
      line(`    ${m.lesson} [${m.kind}] — ${m.channel} (disc ${m.disc}, ball ${m.ball})`);
      line(`      "${m.title}"`);
      if (m.recent) line(`      recent: ${m.recent.join(' / ').slice(0, 120)}`);
    }
    line('');
  }
  if (f.unverified.length) {
    line(`· NOT CONFIRMED AS DISC GOLF (${f.unverified.length}) — not a verdict, a gap`);
    line('  A real channel can look like this: Scott Stokely posts almost only Shorts');
    line("  so his feed is nearly empty, and the PDGA's returns nothing at all.");
    line('  But a USGA video looks like this too. Open the ones you do not recognise.');
    for (const u of f.unverified) {
      line(`    ${u.lesson} [${u.kind}] — ${u.channel}: ${u.why}`);
      line(`      "${u.title}"`);
      if (u.recent && u.recent.length) line(`      recent: ${u.recent.join(' / ').slice(0, 120)}`);
    }
    line('');
  }
  if (f.credit.length) {
    line(`· CREDITS NOBODY CAN JUSTIFY (${f.credit.length}) — named person is neither the channel nor in the title`);
    for (const c of f.credit) line(`    ${c.lesson} [${c.kind}]  we say ${c.claimed} → really ${c.real}\n      "${c.title}"`);
    line('');
  }
  if (f.titleDrift.length) {
    line(`· TITLES THAT HAVE DRIFTED (${f.titleDrift.length}) — a title is a fact, not a label`);
    for (const t of f.titleDrift.slice(0, opts.verbose ? Infinity : 10)) {
      line(`    ${t.lesson} [${t.kind}]\n      ours: ${t.stored}\n      real: ${t.real}`);
    }
    if (!opts.verbose && f.titleDrift.length > 10) line(`    ... and ${f.titleDrift.length - 10} more (--verbose to see all)`);
    line('');
  }
  if (f.lowFit.length) {
    line(`? PRIMARY VIDEO MAY BE OFF TOPIC (${f.lowFit.length}, fit < ${opts.fit}) — REVIEW BY HAND`);
    line('  Keyword overlap is blunt: "Distance Mechanics" vs "How to Throw Far" scores 0 and is fine.');
    line('  Read each one; the real failures look like a disc advert under a mental-game lesson.');
    for (const r of f.lowFit) {
      line(`    ${r.fit.toFixed(2)}  ${r.lesson}  [${r.category}]`);
      line(`      lesson: ${r.lessonTitle}`);
      line(`      video : ${r.video}  [${r.channel}]`);
    }
    line('');
  }

  line('─'.repeat(72));
  line(`blocking: ${blocking}  (dead ${f.dead.length}, wrong sport ${f.wrongSport.length}, dead links ${f.deadLink.length})`);
  line(`advisory: mixed sport ${f.mixedSport.length}, unverified ${f.unverified.length}, credits ${f.credit.length}, `
    + `title drift ${f.titleDrift.length}, low topic fit ${f.lowFit.length}`);
  if (!blocking && !f.lowFit.length && !f.mixedSport.length && !f.unverified.length) line('nothing to fix.');
  return blocking;
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name) => argv.includes('--' + name);
  const value = (name, dflt) => {
    const i = argv.indexOf('--' + name);
    return i === -1 ? dflt : argv[i + 1];
  };
  const opts = {
    json: flag('json'),
    verbose: flag('verbose'),
    videosOnly: flag('videos-only'),
    fit: Number(value('fit', '0.2')),
  };

  let lessons = LESSONS;
  const slugs = value('slugs', null);
  const category = value('category', null);
  if (slugs) {
    const want = new Set(slugs.split(',').map((s) => s.trim()));
    lessons = lessons.filter((l) => want.has(l.slug));
    const missing = [...want].filter((s) => !LESSONS.some((l) => l.slug === s));
    if (missing.length) { console.error('no such lesson: ' + missing.join(', ')); process.exit(2); }
  }
  if (category) lessons = lessons.filter((l) => l.category_slug === category);
  if (!lessons.length) { console.error('no lessons matched'); process.exit(2); }

  const findings = await run(lessons, opts);
  if (opts.json) {
    process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
    const blocking = findings.dead.length + findings.wrongSport.length + findings.deadLink.length;
    process.exit(blocking ? 1 : 0);
  }
  process.exit(report(findings, opts) ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
