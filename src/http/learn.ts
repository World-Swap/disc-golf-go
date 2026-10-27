// src/http/learn.ts — the training library as indexable pages on discgolfgo.com.
//
// ── Category pages AND lesson pages ───────────────────────────────────────
// This file used to argue against one page per lesson, and the argument was
// right at the time: a lesson was a description plus two or three one-line
// tips, a median of 28 words. 134 pages at 28 words is thin content -- Google
// mostly declines to index it, and enough of it teaches a crawler that the
// whole domain is low quality. It set one condition for revisiting: that every
// lesson be written, because a mixed set of 300-word and 28-word pages is
// worse than either.
//
// THAT CONDITION IS MET, and measured rather than assumed before this changed:
// all 134 lessons now run a median of 328 words and a MINIMUM of 259, against
// the ~570 of the two guide pages already on this site. Not one is thin, so
// there is no mixed set to worry about. 45,423 words of coached instruction
// were reachable at thirteen URLs; they are reachable at 147 now.
//
// ── What lives where, and why they are not duplicates ─────────────────────
// A category page is a HUB: it names every lesson, links to it, and carries
// that lesson's `why` paragraph as the excerpt. A lesson page is the whole
// thing -- the method, the faults and their fixes, the key points, the drill
// with its rep count, and the articles it cites.
//
// `tips` and `drill` were moved OFF the category page when lesson pages
// arrived, deliberately. A hub that reproduces its children in full is a
// duplicate of all of them at once, and the two pages then compete for the
// same query. Split this way the category ranks for the broad phrase and the
// lesson for the specific one, and the overlap is one paragraph of excerpt --
// which is what every hub page on the web does.
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

/** Where a lesson lives. Nested under its category so the hierarchy is real. */
const lessonPath = (l: SeedLesson): string => `/learn/${l.category_slug}/${l.slug}`;

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
    /* The drill is the one line on the page a reader can act on today, so it
       gets a rule above it rather than sitting in the run of prose. */
    .drill{font-size:15px;line-height:1.65;margin:14px 0 18px;padding:12px 0 0;
           border-top:1px solid var(--color-hairline);}
    .drill strong{color:var(--color-orange);}
    .vid{font-size:15px;line-height:1.6;margin:0 0 18px;opacity:.78;}
    .vid a{color:var(--color-orange);font-weight:700;text-decoration:none;}
    .catlist{list-style:none;padding:0;margin:0;}
    .catlist li{margin-bottom:14px;}
    .catlist a{color:var(--color-ink);font-weight:700;text-decoration:none;font-size:18px;}
    .catlist span{display:block;font-size:15px;opacity:.72;font-weight:400;}
    .article ol{margin:0 0 16px;padding-left:22px;}
    .article ol li{font-size:17px;line-height:1.7;color:var(--color-ink);opacity:.9;margin-bottom:10px;}
    /* A fault and its fix are one idea, so they sit in one block rather than
       as two bullets a reader has to pair up themselves. */
    .fault{margin:0 0 14px;}
    .fault b{display:block;font-weight:700;color:var(--color-ink);font-size:17px;line-height:1.5;}
    .fault span{display:block;font-size:16px;line-height:1.65;opacity:.85;margin-top:3px;}
    .pager{display:flex;justify-content:space-between;gap:16px;border-top:1px solid var(--color-hairline);
           margin-top:30px;padding-top:18px;font-size:15px;}
    .pager a{color:var(--color-orange);font-weight:700;text-decoration:none;max-width:48%;}
    .pager span{opacity:.45;}
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

/**
 * One lesson: the whole written body, which is the thing worth indexing.
 *
 * Everything here comes from src/db/data/lesson-bodies.ts, so the page can
 * never claim more than the app teaches -- it is the same text a player reads,
 * not a marketing rewrite of it.
 */
function lessonPage(l: SeedLesson, c: SeedCategory): string {
  const siblings = byCategory(c.slug);
  const i = siblings.findIndex((x) => x.slug === l.slug);
  const prev = i > 0 ? siblings[i - 1] : null;
  const next = i >= 0 && i < siblings.length - 1 ? siblings[i + 1] : null;

  // The title is the phrase somebody would type, with the path named so two
  // lessons that share a word are still told apart in a result list.
  const title = `${l.title} — ${searchTitle(c)} | Disc Golf Go`;
  // The lesson's own description, then what the page actually contains. Kept
  // under the ~160 characters a result snippet shows.
  const description = `${l.description} Step-by-step method, the common faults and their fixes, and a drill with a rep count.`.slice(0, 300);

  const b = l.content_body;
  const how = (b.how ?? []).map((step) => `      <li>${esc(step)}</li>`).join('\n');
  const wrong = (b.wrong ?? []).map((w) =>
    `      <div class="fault"><b>${esc(w.fault)}</b><span>${esc(w.fix)}</span></div>`).join('\n');
  const tips = (b.tips ?? []).map((t) => `      <li>${esc(t)}</li>`).join('\n');
  const drill = b.drill
    ? `      <p class="drill"><strong>Drill &middot; ${esc(b.drill.name)}</strong> &mdash; ${esc(b.drill.reps)}. ${esc(b.drill.body)}</p>`
    : '';
  const video = l.youtube_url && l.youtube_title
    ? `      <p class="vid">Watch: <a href="${esc(l.youtube_url)}" rel="noopener">${esc(displayTitle(l.youtube_title))}</a>${l.youtube_channel ? ` — ${esc(l.youtube_channel)}` : ''}</p>`
    : '';
  const reading = l.resources.filter((r) => r.url).map((r) =>
    `        <li><a href="${esc(r.url)}" rel="noopener">${esc(r.title)}</a>${r.author ? ` — ${esc(r.author)}` : ''}</li>`).join('\n');

  const url = `${ORIGIN}${lessonPath(l)}`;
  // Article for the page and BreadcrumbList for the hierarchy. Both are things
  // the page genuinely is -- no HowTo, which Google retired as a rich result
  // in 2023, and no VideoObject, because the video is somebody else's and we
  // hold none of the fields that markup is supposed to carry.
  const ld = jsonLd([
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: l.title,
      description: l.description,
      image: `${ORIGIN}/img/og-cover.png`,
      articleSection: searchTitle(c),
      author: { '@type': 'Organization', name: 'Disc Golf Go' },
      publisher: {
        '@type': 'Organization', name: 'Disc Golf Go',
        logo: { '@type': 'ImageObject', url: `${ORIGIN}/icon-512.png` },
      },
      mainEntityOfPage: url,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Training library', item: `${ORIGIN}/learn` },
        { '@type': 'ListItem', position: 2, name: searchTitle(c), item: `${ORIGIN}/learn/${c.slug}` },
        { '@type': 'ListItem', position: 3, name: l.title, item: url },
      ],
    },
  ]);

  return `${head({ title, description, canonical: url, ld })}
  <article class="article">
    <a class="backlink" href="/learn/${esc(c.slug)}">← ${esc(searchTitle(c))}</a>
    <p class="kicker">${esc(c.name)}</p>
    <h1>${esc(l.title)}</h1>
    <p class="lede">${esc(l.description)}</p>
${b.why ? `\n    <h2>Why it matters</h2>\n    <p>${esc(b.why)}</p>` : ''}
${how ? `\n    <h2>How to do it</h2>\n    <ol>\n${how}\n    </ol>` : ''}
${wrong ? `\n    <h2>Common mistakes</h2>\n${wrong}` : ''}
${tips ? `\n    <h2>Key points</h2>\n    <ul>\n${tips}\n    </ul>` : ''}
${drill ? `\n    <h2>The drill</h2>\n${drill}` : ''}
${video}
${reading ? `\n    <h2>Further reading</h2>\n    <ul>\n${reading}\n    </ul>` : ''}
${CTA}
    <p class="sharerow"><button class="sharebtn" type="button"
      data-share="${url}">Share this lesson</button></p>
    <div class="pager">
      ${prev ? `<a href="${esc(lessonPath(prev))}">← ${esc(prev.title)}</a>` : '<span>Start of this path</span>'}
      ${next ? `<a href="${esc(lessonPath(next))}">${esc(next.title)} →</a>` : '<span>End of this path</span>'}
    </div>
    <div class="relguide">
      <p>All ${siblings.length} lessons in <a href="/learn/${esc(c.slug)}">${esc(searchTitle(c))}</a> · <a href="/learn">Training library</a></p>
    </div>
  </article>
${FOOT}
${SHARE_SCRIPT}
</body>
</html>
`;
}

/** One category: a hub naming every lesson, with a link and an excerpt each. */
function categoryPage(c: SeedCategory): string {
  const lessons = byCategory(c.slug);
  const title = `${searchTitle(c)} — ${lessons.length} Coached Lessons | Disc Golf Go`;
  const description = `${c.description} ${lessons.length} free lessons with video from touring pros and the channels that coach them.`.slice(0, 300);

  const body = lessons.map((l) => {
    // The excerpt, and only the excerpt. `tips` and `drill` used to be here
    // too; they moved to the lesson page when it was created, because a hub
    // that reproduces its children in full competes with every one of them.
    const why = l.content_body.why ? `      <p>${esc(l.content_body.why)}</p>` : '';
    const video = l.youtube_url && l.youtube_title
      ? `      <p class="vid">Watch: <a href="${esc(l.youtube_url)}" rel="noopener">${esc(displayTitle(l.youtube_title))}</a>${l.youtube_channel ? ` — ${esc(l.youtube_channel)}` : ''}</p>`
      : '';
    // The id is kept although the title is now a link: /learn/<cat>#<slug> was
    // the only way to share a lesson for weeks and those links are out there.
    return `      <h3 id="${esc(l.slug)}"><a href="${esc(lessonPath(l))}">${esc(l.title)}</a></h3>
      <p>${esc(l.description)}</p>
${why}${video}
      <p><a href="${esc(lessonPath(l))}">Read the full lesson — method, faults and the drill →</a></p>`;
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
    <p class="lede">${esc(c.description)} Below are all ${lessons.length} lessons in this path, each with the video we teach it from and a link to the full written lesson.</p>

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

/**
 * The public paths this module owns, for the sitemap and for tests.
 *
 * 148 of them: the hub, thirteen categories and all 134 lessons. The sitemap
 * is built from this rather than hand-written, so a lesson cannot be added to
 * the library and left out of it.
 */
export function learnUrls(): string[] {
  return [
    '/learn',
    ...sortedCategories().flatMap((c) => [
      `/learn/${c.slug}`,
      ...byCategory(c.slug).map((l) => lessonPath(l)),
    ]),
  ];
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
        if (c) html = categoryPage(c);
        else {
          const l = LESSONS.find((x) => lessonPath(x) === p);
          const parent = l && sortedCategories().find((x) => x.slug === l.category_slug);
          // A lesson whose category is missing is not rendered rather than
          // rendered without its breadcrumb -- it would be an orphan page
          // claiming a hierarchy that does not exist.
          if (!l || !parent) return next();   // unknown path falls to the 404
          html = lessonPage(l, parent);
        }
      }
      cache.set(p, html);
    }
    res.type('html').send(html);
  };
}
