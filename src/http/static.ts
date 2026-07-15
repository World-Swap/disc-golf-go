// src/http/static.ts — serve the web/ frontend: static assets + clean page
// routes (one path per HTML file, mirroring the old public/ page routing).

import path from 'node:path';
import express, { type Express } from 'express';

const WEB_DIR = path.join(__dirname, '..', '..', 'web');

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
  '/courses': 'courses.html',
  '/delete-account': 'delete-account.html',
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
