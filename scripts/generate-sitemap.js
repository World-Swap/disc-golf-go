#!/usr/bin/env node
/**
 * Write web/sitemap.xml from one list of URLs.
 *
 *   npm run sitemap
 *
 * It replaced a hand-maintained file, which is a thing that rots quietly: the
 * one it replaced carried a lastmod of 2026-09-23 for every entry, months after
 * the pages had changed, and adding a page meant remembering to edit XML.
 *
 * lastmod comes from the git commit that last touched each page's source file,
 * so it is the date the content actually changed rather than the date this
 * script happened to run. Google treats an lastmod it does not believe as noise,
 * and "everything changed today, every day" is the fastest way to earn that.
 *
 * ONLY discgolfgo.com URLs belong here. The app domain is noindex (see
 * robotsTxt in src/http/static.ts), so listing it would ask Google to index
 * pages we have explicitly told it to drop.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const ORIGIN = 'https://discgolfgo.com';
const OUT = path.join(REPO, 'web', 'sitemap.xml');

/** Each entry: the public path, the file whose git date dates it, a priority. */
const PAGES = [
  { url: '/', file: 'web/promo.html', priority: '1.0', changefreq: 'weekly' },
  { url: '/guides/how-to-putt-disc-golf', file: 'web/guide-putting.html', priority: '0.8', changefreq: 'monthly' },
  { url: '/guides/best-beginner-disc-golf-discs', file: 'web/guide-beginner-discs.html', priority: '0.8', changefreq: 'monthly' },
];

/** The date of the last commit touching a file, YYYY-MM-DD. */
function lastModified(file) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', file], {
      cwd: REPO, encoding: 'utf8',
    }).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(out)) return out;
  } catch { /* not a git checkout, or the file is untracked */ }
  return new Date().toISOString().slice(0, 10);
}

const xmlEscape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function build(pages) {
  const body = pages.map((p) => [
    '  <url>',
    `    <loc>${xmlEscape(ORIGIN + p.url)}</loc>`,
    `    <lastmod>${lastModified(p.file)}</lastmod>`,
    `    <changefreq>${p.changefreq}</changefreq>`,
    `    <priority>${p.priority}</priority>`,
    '  </url>',
  ].join('\n')).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

if (require.main === module) {
  const missing = PAGES.filter((p) => !fs.existsSync(path.join(REPO, p.file)));
  if (missing.length) {
    console.error('listed but not on disk:\n  ' + missing.map((m) => m.file).join('\n  '));
    process.exit(1);
  }
  fs.writeFileSync(OUT, build(PAGES));
  console.log(`${PAGES.length} URLs -> ${path.relative(REPO, OUT)}`);
  for (const p of PAGES) console.log(`  ${p.url.padEnd(42)} ${lastModified(p.file)}`);
}

module.exports = { PAGES, build, lastModified };
