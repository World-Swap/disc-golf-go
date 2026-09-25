// src/http/static.ts — serve the web/ frontend: static assets + clean page
// routes (one path per HTML file, mirroring the old public/ page routing).

import path from 'node:path';
import express, { type Express, type RequestHandler } from 'express';

const WEB_DIR = path.join(__dirname, '..', '..', 'web');

// The marketing domain. discgolfgo.app is the app; discgolfgo.com is the promo
// site. Both currently resolve to this same service, so we split by host.
const PROMO_HOSTS = new Set(['discgolfgo.com', 'www.discgolfgo.com']);

// On the .com marketing domain: serve the promo page at '/', let static assets
// (files with an extension) fall through so the promo's CSS/images load, and
// send every app route + /api to the app on discgolfgo.app. .app is untouched.
// Mount this BEFORE /api and the frontend so it can intercept.
// Clean marketing URLs that live on the .com promo site (extensionless → served
// here instead of being redirected to the app).
const PROMO_PAGES: Record<string, string> = {
  '/guides/how-to-putt-disc-golf': 'guide-putting.html',
  '/guides/best-beginner-disc-golf-discs': 'guide-beginner-discs.html',
};

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
  '/missions': 'missions.html',
  '/ranks': 'ranks.html',
  '/vault': 'vault.html',
  '/shop': 'shop.html',
  '/profile': 'profile.html',
  '/settings': 'settings.html',
  '/checkin': 'checkin.html',
  '/game': 'game.html',
  '/courses': 'courses.html',
  '/delete-account': 'delete-account.html',
  '/privacy': 'privacy.html',
  '/privacy-policy': 'privacy.html',
};

export function mountFrontend(app: Express): void {
  // Static assets (styles/, js/, images). index:false so page routes own '/'.
  app.use(
    express.static(WEB_DIR, {
      index: false,
      setHeaders: (res, filePath) => {
        if (/\.(png|jpe?g|gif|ico|svg|webp|woff2?)$/i.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
        }
      },
    })
  );

  for (const [route, file] of Object.entries(PAGES)) {
    app.get(route, (_req, res) => res.sendFile(path.join(WEB_DIR, file)));
  }
}
