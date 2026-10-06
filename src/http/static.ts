// src/http/static.ts — serve the web/ frontend: static assets + clean page
// routes (one path per HTML file, mirroring the old public/ page routing).

import path from 'node:path';
import express, { type Express, type RequestHandler } from 'express';
import { learnUrls } from './learn';

const WEB_DIR = path.join(__dirname, '..', '..', 'web');

// The marketing domain. discgolfgo.app is the app; discgolfgo.com is the promo
// site. Both currently resolve to this same service, so we split by host.
export const PROMO_HOSTS = new Set(['discgolfgo.com', 'www.discgolfgo.com']);

// On the .com marketing domain: serve the promo page at '/', let static assets
// (files with an extension) fall through so the promo's CSS/images load, and
// send every app route + /api to the app on discgolfgo.app. .app is untouched.
// Mount this BEFORE /api and the frontend so it can intercept.
// Clean marketing URLs that live on the .com promo site (extensionless → served
// here instead of being redirected to the app).
const PROMO_PAGES: Record<string, string> = {
  '/events': 'events.html',
  '/guides/how-to-putt-disc-golf': 'guide-putting.html',
  '/guides/best-beginner-disc-golf-discs': 'guide-beginner-discs.html',
};

// The training library used to live at /training/<category> on .com, and Google
// still holds those URLs with real crawl history -- five of the thirteen were
// visible in Search Console, split across "Not found (404)" and "Page with
// redirect". Without this, the catch-all below sends them to the app, where
// /training/<category> 404s: a dead end pointing AWAY from the pages that
// replaced them, which are live, indexable and the ones we want ranked.
//
// Derived from learnUrls() rather than written out, so adding a category cannot
// silently leave its old URL stranded.
const LEARN_SLUGS = new Set(
  learnUrls()
    .map((u) => u.slice('/learn/'.length))
    .filter((slug) => slug && !slug.includes('/'))
);

/**
 * robots.txt, which has to differ by host because the two domains want opposite
 * things from a crawler.
 *
 * It used to be one static file served on BOTH, saying `Allow: /` and pointing
 * at the .com sitemap -- so discgolfgo.app was inviting Google to crawl ~20
 * client-rendered app pages that answer a crawler with an empty shell, under a
 * sitemap that does not describe them.
 *
 * .app also gets `Allow: /` rather than `Disallow: /`, which looks backwards
 * until you want something REMOVED: a disallowed URL cannot be re-crawled, so
 * Google never sees the noindex that would drop it and a stale entry can sit in
 * the index indefinitely. The app pages carry `noindex, follow` instead, and
 * crawling stays open so that tag is readable. Only /api and /admin, which are
 * not pages at all, are closed outright.
 *
 * Mounted before comHostSplit and the static middleware, both of which would
 * otherwise answer first.
 */
export function robotsTxt(): RequestHandler {
  const promo = [
    'User-agent: *',
    'Allow: /',
    '',
    'Sitemap: https://discgolfgo.com/sitemap.xml',
    '',
  ].join('\n');

  const appDomain = [
    '# discgolfgo.app is the application. The marketing site is discgolfgo.com,',
    '# and its pages are the ones meant to be found. Everything here carries a',
    '# noindex meta tag; crawling stays open so crawlers can read it.',
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /admin',
    '',
  ].join('\n');

  return (req, res, next) => {
    if (req.path !== '/robots.txt') return next();
    res.type('text/plain').send(
      PROMO_HOSTS.has((req.hostname || '').toLowerCase()) ? promo : appDomain
    );
  };
}

export function comHostSplit(): RequestHandler {
  const promoFile = path.join(WEB_DIR, 'promo.html');
  return (req, res, next) => {
    if (!PROMO_HOSTS.has((req.hostname || '').toLowerCase())) return next();
    const p = req.path;
    if (p === '/') return res.sendFile(promoFile);
    if (p === '/health' || p.startsWith('/health/')) return next(); // platform health checks
    const promoPage = PROMO_PAGES[p.replace(/\/$/, '')];
    if (promoPage) return res.sendFile(path.join(WEB_DIR, promoPage)); // marketing content page
    if (/\.[a-z0-9]{2,5}$/i.test(p)) return next(); // static asset — serve for the promo page
    // Old category URL → the page that replaced it, on this same domain. Must come
    // BEFORE the catch-all, which would otherwise hand it to the app and a 404.
    const oldCategory = /^\/training\/([a-z0-9-]+)\/?$/.exec(p);
    if (oldCategory && LEARN_SLUGS.has(oldCategory[1]!)) {
      return res.redirect(301, 'https://discgolfgo.com/learn/' + oldCategory[1]);
    }
    // App page or API on .com → same path on the app domain (308 keeps method for /api).
    return res.redirect(p.startsWith('/api/') ? 308 : 301, 'https://discgolfgo.app' + req.originalUrl);
  };
}

// Clean route -> HTML file. Extensionless URLs so links stay tidy.
const PAGES: Record<string, string> = {
  '/': 'index.html',
  '/login': 'login.html',
  '/register': 'register.html',
  '/forgot-password': 'forgot-password.html',
  '/reset-password': 'reset-password.html',
  '/onboard': 'onboard.html',
  '/home': 'home.html',
  '/training': 'training.html',
  '/assessment': 'assessment.html',
  '/missions': 'missions.html',
  '/ranks': 'ranks.html',
  '/vault': 'vault.html',
  '/lounge': 'lounge.html',
  // The 16 admin endpoints had no UI at all, so every one of them meant
  // hand-written curl. Registering it here is the step that was missed for
  // /lounge, which 404'd until someone noticed this table is explicit.
  '/admin': 'admin.html',
  '/shop': 'shop.html',
  '/profile': 'profile.html',
  '/settings': 'settings.html',
  '/checkin': 'checkin.html',
  '/game': 'game.html',
  '/scorecard': 'scorecard.html',
  '/courses': 'courses.html',
  '/stats': 'stats.html',
  '/feedback': 'feedback.html',
  '/delete-account': 'delete-account.html',
  '/privacy': 'privacy.html',
  '/privacy-policy': 'privacy.html',
};

/** A year. The longest value anything should be cached for. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

export function mountFrontend(app: Express): void {
  // A versioned asset can be cached forever, and that is the whole navigation
  // cost on a phone.
  //
  // express.static defaults to max-age=0, which does NOT mean "do not cache" —
  // it means "revalidate every time". Only images carried an override, so every
  // tab tap re-checked tokens.css, app.css, app-ui.css and app.js: four
  // blocking round trips that return 304 and transfer nothing, before the page
  // could start rendering. At a phone's 100-300ms RTT that is 0.4-1.2s of dead
  // wait per navigation.
  //
  // The pages already request these with `?v=w13`, and the repo bumps that
  // buster whenever the file changes — which is exactly the precondition
  // `immutable` needs. So the long cache is keyed on the version being PRESENT:
  // a request without one is still revalidated, so an asset referenced without
  // a buster can never be pinned to a stale copy for a year.
  app.use((req, res, next) => {
    if (/^\/(styles|js|img)\//.test(req.path) && typeof req.query.v === 'string' && req.query.v) {
      res.setHeader('Cache-Control', IMMUTABLE);
    }
    next();
  });

  app.use(
    express.static(WEB_DIR, {
      index: false,
      setHeaders: (res, filePath) => {
        // Unversioned media: the artcard art is referenced from CSS without a
        // buster, so it keeps the shorter, revalidating cache it always had.
        if (!res.getHeader('Cache-Control') && /\.(png|jpe?g|gif|ico|svg|webp|woff2?)$/i.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
        }
      },
    })
  );

  for (const [route, file] of Object.entries(PAGES)) {
    app.get(route, (_req, res) => res.sendFile(path.join(WEB_DIR, file)));
  }
}
