#!/usr/bin/env node
// scripts/fetch-article-previews.js — fetch each cited article's own title and
// description once, and commit them.
//
//   npm run articles:previews          # refresh every article
//   npm run articles:previews -- --check   # read-only: is anything missing?
//
// WHY FETCH ONCE AND COMMIT, rather than at render time.
// Three reasons, in order of how much they matter.
//   1. A lesson page must not depend on udisc.com being up. Rendering a card
//      from a live fetch means a slow or down publisher is a slow or broken
//      lesson.
//   2. A player's browser should not make a request to a third party just to
//      read a lesson. That is their traffic being handed to somebody else.
//   3. It is 58 URLs that change about never. Fetching them on every page view
//      is work done over and over for an answer that is already known.
//
// WHY NO IMAGE IS STORED. These pages all publish an `og:image`, and the
// obvious "proper preview card" uses it. It is deliberately not used:
// hotlinking serves the publisher's bandwidth from our page and breaks when
// they move the file, and copying the image into this repo is republishing
// their artwork rather than linking to it. The card is built from the
// publisher's TITLE and DESCRIPTION -- which is what a link preview is, and
// what Slack or a search result shows -- plus our own visual treatment. If
// that decision is ever revisited, self-hosting with permission is the route,
// not hotlinking.
//
// IT REFUSES RATHER THAN GUESSES. A URL that does not answer, or that has no
// usable description, gets NO entry, and the card degrades to the plain row
// the page used before. A made-up summary of somebody else's article is worse
// than no card at all.

require('ts-node/register/transpile-only');
const { LESSONS } = require('../src/db/data/lessons');
const { writeFileSync, readFileSync, existsSync } = require('fs');
const { join } = require('path');

const OUT = join(__dirname, '..', 'src', 'db', 'data', 'article-previews.ts');
const UA = 'Mozilla/5.0 (compatible; DiscGolfGo/1.0; +https://discgolfgo.com)';
const TIMEOUT_MS = 20000;
const GAP_MS = 900;          // polite: these are small publishers
const RETRIES = 2;           // a throttle is not the publisher's fault
const HOST_CONCURRENCY = 6;  // different hosts at once; see byHost() for why
const DESC_MAX = 180;        // a card, not an excerpt

const args = process.argv.slice(2);
const CHECK_ONLY = args.includes('--check');

/** Every distinct article URL the library cites, with how often. */
function citedArticles() {
  const seen = new Map();
  for (const l of LESSONS) {
    for (const r of l.resources || []) {
      if (r.resource_type !== 'article') continue;
      const e = seen.get(r.url) || { url: r.url, refs: 0, ourTitle: r.title, author: r.author };
      e.refs += 1;
      seen.set(r.url, e);
    }
  }
  return [...seen.values()].sort((a, b) => a.url.localeCompare(b.url));
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * A 307 or 429 from a small publisher means we asked too fast, not that the
 * page is broken. The first run of this script reported two infinitediscs
 * urls as HTTP 307 that fetched perfectly in isolation seconds later, and
 * then reported FOUR once the requests were serialised per host and arrived
 * closer together. Reporting our own throttling as somebody else's outage is
 * exactly the kind of wrong answer that gets written into a file and believed.
 */
const RETRYABLE = new Set([307, 408, 425, 429, 500, 502, 503, 504]);

async function get(url, attempt = 0) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctl.signal,
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok) {
      if (RETRYABLE.has(res.status) && attempt < RETRIES) {
        await wait(2000 * (attempt + 1));
        return get(url, attempt + 1);
      }
      return { ok: false, reason: `HTTP ${res.status}${attempt ? ` after ${attempt + 1} tries` : ''}` };
    }
    const type = res.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml/i.test(type)) return { ok: false, reason: `not html (${type.split(';')[0]})` };
    return { ok: true, html: await res.text(), finalUrl: res.url };
  } catch (e) {
    if (attempt < RETRIES) {
      await wait(2000 * (attempt + 1));
      return get(url, attempt + 1);
    }
    return { ok: false, reason: e.name === 'AbortError' ? 'timeout' : String(e.message || e) };
  } finally {
    clearTimeout(t);
  }
}

function decode(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A meta tag by property or name, in either attribute order. */
function meta(html, key) {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pats = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`, 'i'),
  ];
  for (const p of pats) {
    const m = html.match(p);
    if (m && m[1].trim()) return decode(m[1]);
  }
  return null;
}

function docTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decode(m[1].replace(/<[^>]+>/g, '')) : null;
}

/**
 * Publishers append their own name to the title ("... | Release Point - The
 * UDisc Blog"). The card shows the site separately, so carrying it in the
 * title too is noise that pushes the useful words off a phone screen.
 */
function stripSiteSuffix(title, site) {
  if (!title) return title;
  let t = title;
  const parts = [site, site && site.split(/[-|–—]/)[0].trim()].filter(Boolean);
  for (const p of parts) {
    if (!p) continue;
    const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`\\s*[|\\-–—:]\\s*${esc}\\s*$`, 'i'), '').trim();
  }
  return t || title;
}

/** Cut to a word boundary and add an ellipsis only if something was lost. */
function clamp(s, max) {
  if (!s || s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return (at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,.;:–—-]+$/, '') + '…';
}

function siteFromHost(host) {
  return host.replace(/^www\./, '');
}

async function preview(entry) {
  const res = await get(entry.url);
  if (!res.ok) return { ...entry, ok: false, reason: res.reason };
  const html = res.html;
  const site = meta(html, 'og:site_name');
  const rawTitle = meta(html, 'og:title') || meta(html, 'twitter:title') || docTitle(html);
  const desc = meta(html, 'og:description') || meta(html, 'twitter:description') || meta(html, 'description');
  const finalUrl = res.finalUrl || entry.url;
  const host = new URL(finalUrl).hostname;
  const title = stripSiteSuffix(rawTitle, site);
  // No description is the one thing that makes a card pointless, so that is
  // what disqualifies it rather than a missing title or site name.
  if (!desc) return { ...entry, ok: false, reason: 'no description published' };
  return {
    ...entry,
    ok: true,
    title: clamp(title || entry.ourTitle, 110),
    description: clamp(desc, DESC_MAX),
    site: site ? clamp(site, 50) : siteFromHost(host),
    domain: siteFromHost(host),
    // Reported, never silently written: if the cited url redirects, the
    // LIBRARY should be corrected so a player does not pay for the hop.
    movedTo: finalUrl !== entry.url ? finalUrl : null,
  };
}

/**
 * ONE REQUEST AT A TIME PER HOST, several hosts in parallel.
 *
 * A flat concurrency limit looks polite and is not: udisc.com accounts for 20
 * of these 58 urls and infinitediscs for 13, so four "concurrent requests"
 * meant four simultaneous requests at ONE small publisher. That is what it
 * looked like from their end, and two infinitediscs urls came back 307 on the
 * first run and fetched perfectly in isolation afterwards -- a throttle I
 * caused, reported by my own script as the publisher's fault.
 */
async function byHost(items, fn) {
  const hosts = new Map();
  for (const it of items) {
    const h = new URL(it.url).hostname;
    if (!hosts.has(h)) hosts.set(h, []);
    hosts.get(h).push(it);
  }
  const queues = [...hosts.values()];
  const out = [];
  for (let i = 0; i < queues.length; i += HOST_CONCURRENCY) {
    const batch = queues.slice(i, i + HOST_CONCURRENCY).map(async (queue) => {
      const got = [];
      for (const it of queue) {
        got.push(await fn(it));
        await wait(GAP_MS);   // between requests to the SAME host
      }
      return got;
    });
    for (const got of await Promise.all(batch)) out.push(...got);
  }
  return out;
}

function render(rows, skipped) {
  // Urls that WERE fetched and have no usable preview, with the reason. This
  // is what makes `--check` worth running: without it the check fails forever
  // on a page that simply publishes no description, and a check that always
  // fails is one nobody looks at.
  const noPreview = skipped.map((r) =>
    `  ${JSON.stringify(r.url)}: ${JSON.stringify(r.reason)},`).join('\n');
  const body = rows.map((r) =>   // movedTo is deliberately not written: it is a report
    `  ${JSON.stringify(r.url)}: {\n`
    + `    title: ${JSON.stringify(r.title)},\n`
    + `    description: ${JSON.stringify(r.description)},\n`
    + `    site: ${JSON.stringify(r.site)},\n`
    + `    domain: ${JSON.stringify(r.domain)},\n`
    + `  },`).join('\n');
  return `// src/db/data/article-previews.ts — GENERATED by scripts/fetch-article-previews.js
//
// The publisher's OWN title and description for each article the library
// cites, fetched once and committed. Do not edit by hand: run
// \`npm run articles:previews\` instead, which is idempotent.
//
// These are somebody else's words, shown as a link preview and attributed to
// them by site name and domain, with the link going to their page. That is
// what the card is for -- the article stays a link and the traffic goes to
// them. No image is stored; see the script header for why.
//
// A URL with no entry here is not a failure: its card degrades to the plain
// row, which is what the page did before previews existed.

export interface ArticlePreview {
  /** The publisher's own title, with their site name trimmed off the end. */
  title: string;
  /** The publisher's own description, clamped to ${DESC_MAX} characters. */
  description: string;
  /** How the publisher names itself, for the credit line. */
  site: string;
  /** Bare hostname, shown so a reader can see where the link goes. */
  domain: string;
}

export const ARTICLE_PREVIEWS: Record<string, ArticlePreview> = {
${body}
};

/**
 * Urls checked and found to publish nothing usable, with the reason. Their
 * cards degrade to the plain row, which is the designed behaviour rather than
 * a gap to be filled by writing a summary of somebody else's article.
 */
export const NO_PREVIEW: Record<string, string> = {
${noPreview}
};

/** The publisher's preview for a url, or undefined when none was fetched. */
export function articlePreview(url: string): ArticlePreview | undefined {
  return ARTICLE_PREVIEWS[url];
}
`;
}

async function main() {
  const cited = citedArticles();
  console.log(`${cited.length} distinct article urls cited by the library\n`);

  if (CHECK_ONLY) {
    if (!existsSync(OUT)) { console.error('no article-previews.ts yet — run without --check'); process.exit(1); }
    const src = readFileSync(OUT, 'utf8');
    // On the list at all — previewed, or recorded as having none to publish.
    const missing = cited.filter((c) => !src.includes(JSON.stringify(c.url)));
    const stale = [...src.matchAll(/^  "(https?:[^"]+)": \{/gm)].map((m) => m[1])
      .filter((u) => !cited.some((c) => c.url === u));
    for (const m of missing) console.log(`MISSING  ${m.url}`);
    for (const u of stale) console.log(`STALE    ${u}  (no lesson cites this any more)`);
    console.log(`\nmissing ${missing.length}, stale ${stale.length}`);
    process.exit(missing.length || stale.length ? 1 : 0);
  }

  const results = await byHost(cited, preview);
  const ok = results.filter((r) => r.ok);
  const bad = results.filter((r) => !r.ok);

  for (const r of bad) console.log(`SKIPPED  ${r.url}\n         ${r.reason}`);
  if (bad.length) console.log('');

  const moved = ok.filter((r) => r.movedTo);
  for (const r of moved) console.log(`MOVED    ${r.url}\n      -> ${r.movedTo}  (update lessons.ts)`);
  if (moved.length) console.log('');

  writeFileSync(OUT, render(ok.sort((a, b) => a.url.localeCompare(b.url)), bad.sort((a, b) => a.url.localeCompare(b.url))));
  console.log(`wrote ${ok.length} previews to src/db/data/article-previews.ts`);
  if (bad.length) console.log(`${bad.length} url(s) have no preview and will render as a plain row.`);

  // A sample, so a run is reviewable rather than just a count.
  for (const r of ok.slice(0, 3)) {
    console.log(`\n  ${r.site} · ${r.domain}`);
    console.log(`  ${r.title}`);
    console.log(`  ${r.description}`);
  }
}

main().catch((e) => { console.error(e); process.exit(2); });
