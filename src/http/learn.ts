// src/http/learn.ts — the training library as indexable pages on discgolfgo.com.
//
// ── Why CATEGORY pages and not LESSON pages ────────────────────────────────
// The obvious move is one page per lesson: 134 URLs, each targeting a phrase
// somebody types into Google. Measured against the actual data, that is a bad
// idea. A lesson is a description plus two or three one-line tips -- a median
// of 28 words, a maximum of 47. The two guide pages already on this site run
// about 570 words each. 134 pages at 28 words is thin content: Google mostly
// declines to index it, and enough of it teaches a crawler that the whole
// domain is low quality.
//
// Aggregated by category the same material is a real page: 7 to 16 lessons,
// every tip, a credited pro video each, and genuine outbound links -- 178 to
// 464 words plus the video list. Below the guide benchmark, but the right order
// of magnitude rather than twenty times off. Thirteen pages worth reading beat
// 134 that are not.
//
// Rendered from src/db/data/lessons.ts on each request rather than generated
// into committed HTML, so a page can never drift from the library it describes.
// The file is already loaded at boot by the seed, so this costs nothing extra.
//
// Only served on the marketing host. The app domain is noindex (see robotsTxt).
import type { RequestHandler } from 'express';
import { LESSONS, CATEGORIES, type SeedLesson, type SeedCategory } from '../db/data/lessons';

const ORIGIN = 'https://discgolfgo.com';
const APP = 'https://discgolfgo.app';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** JSON for a <script type="application/ld+json">, with </script> neutralised. */
const jsonLd = (o: unknown): string => JSON.stringify(o, null, 2).replace(/</g, '\\u003c');

/**
 * Trim a run of hashtags off the END of a video title for display.
 *
 * The stored title is deliberately the exact one YouTube serves -- lessons.ts
 * treats a title as a fact and 95 of them were corrected wholesale to match --
 * so this does NOT touch the data. It only stops a marketing page reading
 * "... (With Gannon Buhr) #discgolf #tutorial #sports". Trailing only: a
 * hashtag in the middle of a title is part of the sentence.
 */
const displayTitle = (t: string): string => t.replace(/(?:\s+#[\w-]+)+\s*$/u, '').trim() || t;

const byCategory = (slug: string): SeedLesson[] =>
  LESSONS.filter((l) => l.category_slug === slug).sort((a, b) => a.sort_order - b.sort_order);

const sortedCategories = (): SeedCategory[] =>
  [...CATEGORIES].sort((a, b) => a.sort_order - b.sort_order);

/**
 * A page title that reads like what someone searched for. "Form & Technique"
 * alone is our internal label; "Disc Golf Form & Technique" is the phrase.
 */
function searchTitle(c: SeedCategory): string {
  return /disc golf/i.test(c.name) ? c.name : `Disc Golf ${c.name}`;
}

const NAV = `  <nav class="nav">
    <a class="logo" href="/">
      <span class="logo__glyph" aria-hidden="true"></span>
      Disc Golf Go
    </a>
    <div class="nav__cta">
      <a class="btn btn--sm" href="${APP}/register">Open App</a>
    </div>
  </nav>`;

const FOOT = `  <footer class="foot">
    <div class="foot__inner">
      <a href="/">Disc Golf Go</a> · <a href="/learn">Training library</a> ·
      <a href="${APP}/privacy">Privacy</a>
    </div>
  </footer>`;

/** The shared <head> + styles, matching the existing guide pages. */
function head(opts: {
  title: string; description: string; canonical: string; ld: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${esc(opts.title)}</title>
  <meta name="theme-color" content="#ffffff" />
  <link rel="icon" href="/favicon.ico?v=4" sizes="any" />
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=4" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=4" />
  <meta name="description" content="${esc(opts.description)}" />
  <link rel="canonical" href="${esc(opts.canonical)}" />
  <meta property="og:site_name" content="Disc Golf Go" />
  <meta property="og:title" content="${esc(opts.title)}" />
  <meta property="og:description" content="${esc(opts.description)}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${esc(opts.canonical)}" />
  <meta property="og:image" content="${ORIGIN}/img/og-cover.png?v=3" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${ORIGIN}/img/og-cover.png?v=3" />
  <script type="application/ld+json">
${opts.ld}
  </script>
  <link rel="stylesheet" href="/styles/tokens.css?v=w11" />
  <link rel="stylesheet" href="/styles/app.css?v=w11" />
  <style>
    .logo__mark-wrap{display:inline-flex;align-items:center;gap:10px;text-decoration:none;}
    .article{max-width:720px;margin:0 auto;padding:40px var(--edge-pad) 20px;}
    .article .kicker{color:var(--color-orange);font-family:var(--font-display);font-weight:700;letter-spacing:.14em;text-transform:uppercase;font-size:13px;}
    .article h1{font-family:var(--font-display);font-weight:800;letter-spacing:-.02em;color:var(--color-ink);font-size:clamp(30px,6vw,44px);line-height:1.05;margin:12px 0 10px;}
    .article .lede{font-size:19px;line-height:1.55;color:var(--color-ink);opacity:.82;margin:0 0 8px;}
    .article h2{font-family:var(--font-display);font-weight:700;color:var(--color-ink);font-size:24px;letter-spacing:-.01em;margin:34px 0 10px;}
    .article h3{font-family:var(--font-display);font-weight:700;color:var(--color-ink);font-size:19px;margin:26px 0 6px;}
    .article p{font-size:17px;line-height:1.7;color:var(--color-ink);opacity:.9;margin:0 0 16px;}
    .article ul{margin:0 0 16px;padding-left:22px;}
    .article li{font-size:17px;line-height:1.7;color:var(--color-ink);opacity:.9;margin-bottom:8px;}
    .article strong{font-weight:700;}
    .backlink{display:inline-block;margin-bottom:8px;color:var(--color-orange);font-weight:700;text-decoration:none;font-size:14px;}
    .cta-box{background:var(--color-ink);border-radius:20px;padding:30px;margin:36px 0 8px;text-align:center;}
    .cta-box h3{font-family:var(--font-display);font-weight:700;color:#fff;font-size:22px;margin:0 0 14px;}
    .cta-box .btn{margin:0 auto;}
    .relguide{border-top:1px solid var(--hair,#eadfce);margin-top:36px;padding-top:22px;}
    .relguide a{color:var(--color-orange);font-weight:700;text-decoration:none;}
    /* The video credit under each lesson. Who taught it is the point, so the
       channel is shown rather than hidden behind the link text. */
    .vid{font-size:15px;line-height:1.6;margin:0 0 18px;opacity:.78;}
    .vid a{color:var(--color-orange);font-weight:700;text-decoration:none;}
    .catlist{list-style:none;padding:0;margin:0;}
    .catlist li{margin-bottom:14px;}
    .catlist a{color:var(--color-ink);font-weight:700;text-decoration:none;font-size:18px;}
    .catlist span{display:block;font-size:15px;opacity:.72;font-weight:400;}
    .sharerow{margin:18px 0 0;text-align:center;}
    .sharebtn{font-family:var(--font-display);font-weight:700;font-size:15px;color:var(--color-orange);
      background:none;border:none;padding:10px 4px;cursor:pointer;}
  </style>
</head>
<body>
${NAV}`;
}

/**
 * The share button. Standalone rather than using DGG.share from the app's
 * app.js, because these pages are on the marketing domain and load none of the
 * app's JavaScript -- pulling it in for one button would be a worse trade.
 */
const SHARE_SCRIPT = `  <script>
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-share]'); if (!b) return;
      var url = b.getAttribute('data-share');
      var ok = function (label) {
        var original = b.textContent; b.textContent = label;
        setTimeout(function () { b.textContent = original; }, 1800);
      };
      if (navigator.share) {
        navigator.share({ title: document.title, url: url }).catch(function (err) {
          // A cancelled share sheet is not a failure; do not then copy a link
          // the person chose not to send.
          if (err && err.name === 'AbortError') return;
          navigator.clipboard.writeText(url).then(function () { ok('Link copied'); });
        });
        return;
      }
      navigator.clipboard.writeText(url)
        .then(function () { ok('Link copied'); })
        .catch(function () { window.prompt('Copy this link:', url); });
    });
  </script>`;

const CTA = `    <div class="cta-box">
      <h3>Every lesson here is free in the app</h3>
      <a class="btn btn--lg" href="${APP}/register">Start training</a>
    </div>`;

/** One category: the lessons, their tips, and who teaches each one. */
function categoryPage(c: SeedCategory): string {
  const lessons = byCategory(c.slug);
  const title = `${searchTitle(c)} — ${lessons.length} Coached Lessons | Disc Golf Go`;
  const description = `${c.description} ${lessons.length} free lessons with video from touring pros and the channels that coach them.`.slice(0, 300);

  const body = lessons.map((l) => {
    const tips = l.content_body.tips.map((t) => `        <li>${esc(t)}</li>`).join('\n');
    const video = l.youtube_url && l.youtube_title
      ? `      <p class="vid">Watch: <a href="${esc(l.youtube_url)}" rel="noopener">${esc(displayTitle(l.youtube_title))}</a>${l.youtube_channel ? ` — ${esc(l.youtube_channel)}` : ''}</p>`
      : '';
    // Anchored so a share from inside the app can land on the lesson somebody
    // meant, rather than the top of a 16-lesson page. There are deliberately no
    // per-lesson URLs (134 pages of ~28 words would be thin content), so the
    // anchor is how lesson-level sharing stays honest.
    return `      <h3 id="${esc(l.slug)}">${esc(l.title)}</h3>
      <p>${esc(l.description)}</p>
      <ul>
${tips}
      </ul>
${video}`;
  }).join('\n');

  // Every distinct article this category cites, credited to its author.
  const seen = new Set<string>();
  const links = lessons.flatMap((l) => l.resources)
    .filter((r) => r.url && !seen.has(r.url) && (seen.add(r.url), true))
    .map((r) => `        <li><a href="${esc(r.url)}" rel="noopener">${esc(r.title)}</a>${r.author ? ` — ${esc(r.author)}` : ''}</li>`);

  const others = sortedCategories().filter((x) => x.slug !== c.slug).slice(0, 4)
    .map((x) => `<a href="/learn/${esc(x.slug)}">${esc(searchTitle(x))}</a>`).join(' · ');

  const ld = jsonLd({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${searchTitle(c)} — ${lessons.length} Coached Lessons`,
    description: c.description,
    image: `${ORIGIN}/img/og-cover.png`,
    author: { '@type': 'Organization', name: 'Disc Golf Go' },
    publisher: {
      '@type': 'Organization', name: 'Disc Golf Go',
      logo: { '@type': 'ImageObject', url: `${ORIGIN}/icon-512.png` },
    },
    mainEntityOfPage: `${ORIGIN}/learn/${c.slug}`,
  });

  return `${head({ title, description, canonical: `${ORIGIN}/learn/${c.slug}`, ld })}
  <article class="article">
    <a class="backlink" href="/learn">← Training library</a>
    <p class="kicker">${esc(c.name)}</p>
    <h1>${esc(searchTitle(c))}</h1>
    <p class="lede">${esc(c.description)} Below are all ${lessons.length} lessons in this path, each with the video we teach it from.</p>

    <h2>The ${lessons.length} lessons</h2>
${body}
${links.length ? `\n    <h2>Further reading</h2>\n    <ul>\n${links.join('\n')}\n    </ul>` : ''}
${CTA}
    <p class="sharerow"><button class="sharebtn" type="button"
      data-share="${ORIGIN}/learn/${esc(c.slug)}">Share these lessons</button></p>
    <div class="relguide">
      <p>More paths: ${others}</p>
    </div>
  </article>
${FOOT}
${SHARE_SCRIPT}
</body>
</html>
`;
}

/** The hub: every path, with its lesson count. */
function indexPage(): string {
  const cats = sortedCategories();
  const total = LESSONS.length;
  const title = `Disc Golf Training Library — ${total} Free Coached Lessons | Disc Golf Go`;
  const description = `${total} free disc golf lessons across ${cats.length} skill paths, taught with video from touring pros and the channels that coach them.`;

  const items = cats.map((c) => {
    const n = byCategory(c.slug).length;
    return `        <li><a href="/learn/${esc(c.slug)}">${esc(searchTitle(c))}</a>
          <span>${n} lesson${n === 1 ? '' : 's'} — ${esc(c.description)}</span></li>`;
  }).join('\n');

  const ld = jsonLd({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Disc Golf Training Library',
    description,
    numberOfItems: cats.length,
    itemListElement: cats.map((c, i) => ({
      '@type': 'ListItem', position: i + 1,
      name: searchTitle(c), url: `${ORIGIN}/learn/${c.slug}`,
    })),
  });

  return `${head({ title, description, canonical: `${ORIGIN}/learn`, ld })}
  <article class="article">
    <a class="backlink" href="/">← Disc Golf Go</a>
    <p class="kicker">Training library</p>
    <h1>Disc Golf Training Library</h1>
    <p class="lede">${total} free lessons across ${cats.length} skill paths, each taught with a video from a touring pro or one of the channels that coach them.</p>

    <h2>Skill paths</h2>
    <ul class="catlist">
${items}
    </ul>
${CTA}
  </article>
${FOOT}
</body>
</html>
`;
}

/** The public paths this module owns, for the sitemap and for tests. */
export function learnUrls(): string[] {
  return ['/learn', ...sortedCategories().map((c) => `/learn/${c.slug}`)];
}

/**
 * Mounted BEFORE comHostSplit, which would otherwise redirect any extensionless
 * .com path it does not recognise off to the app domain.
 */
export function learnPages(promoHosts: Set<string>): RequestHandler {
  const cache = new Map<string, string>();
  return (req, res, next) => {
    if (!promoHosts.has((req.hostname || '').toLowerCase())) return next();
    const p = req.path.replace(/\/$/, '') || '/';
    if (p !== '/learn' && !p.startsWith('/learn/')) return next();

    let html = cache.get(p);
    if (!html) {
      if (p === '/learn') html = indexPage();
      else {
        const c = sortedCategories().find((x) => `/learn/${x.slug}` === p);
        if (!c) return next();          // unknown path falls through to the 404
        html = categoryPage(c);
      }
      cache.set(p, html);
    }
    res.type('html').send(html);
  };
}
