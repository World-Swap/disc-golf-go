const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const { createPageviewTracker } = require('./middleware/pageview-tracker');
const { securityHeaders, validateNumericParams } = require('./middleware/security');
// Compression removed — Render handles gzip at load balancer level.
// The custom compression middleware caused ERR_HTTP_HEADERS_SENT crashes
// that brought down the entire server.

const app = express();
const port = process.env.PORT || 3000;

// App base URL — used by /api/config to tell the frontend where to point API calls
// Updated 2026-05-23: migrated from discgolfgo.com → discgolfgo.app
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://discgolfgo.app';
console.log('[startup] APP_BASE_URL:', APP_BASE_URL);

// ── CORS ───────────────────────────────────────────────────────────────────────
// Allows cross-origin API calls between marketing (discgolfgo.com) and app
// (discgolfgo.app). Configured per-service via ALLOWED_ORIGINS env var.
// Multiple origins separated by commas. Defaults to the app's own domain.
function setupCors() {
  const allowed = process.env.ALLOWED_ORIGINS;
  if (!allowed) return (_req, _res, next) => next();

  const origins = allowed.split(',').map(o => o.trim()).filter(Boolean);

  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && origins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Player-Id, X-Admin-Token');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  };
}

app.use(setupCors());

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
  // Kill idle connections after 30s to prevent PostgreSQL idle-in-transaction timeouts
  idleTimeoutMillis: 30000,
  // Reap connections in use for > 2 min to handle long-running queries
  connectionTimeoutMillis: 10000,
});

// Prevent idle-in-transaction crashes from killing the entire Node process.
// Without this handler, pg throws an unhandled 'error' event when PostgreSQL
// terminates a connection mid-transaction (e.g., "terminating connection due
// to idle-in-transaction timeout"), crashing the whole process → 502 for all users.
pool.on('error', (err) => {
  console.error('[Pool] Unexpected client error:', err.message);
});

// Security headers on every response (replaces helmet)
app.use(securityHeaders());

// Compression removed — Render handles gzip at load balancer level

// Body size limit — prevents payload-based DoS
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy' });
});

// Pageview tracking — records page navigations server-side
app.use(createPageviewTracker(pool));

// Root: serve landing page for unauthenticated visitors.
// Authenticated users land on /home which handles its own client-side auth check.
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    // Images: short cache with must-revalidate so cache-busting query params work
    if (/\.(png|jpg|jpeg|gif|ico|svg|webp)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    }
  }
}));

// Admin dashboard — not linked in public nav, access directly via /admin
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin/notifications', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-notifications.html'));
});

// Referral link landing — fire click event then redirect to /register
// Must come before pageRoutes to catch /referral before it falls through.
app.get('/referral', (req, res) => {
  const code = req.query.code;
  if (!code || code.length < 4 || code.length > 12) {
    return res.redirect('/');
  }
  // Serve landing page that fires click API and auto-redirects
  res.sendFile(path.join(__dirname, 'public', 'referral.html'));
});

// HTML page routes — one-to-one mapping, keeps server.js clean
const pageRoutes = [
  ['/register',        'register.html'],
  ['/login',          'login.html'],
  ['/forgot-password','forgot-password.html'],
  ['/reset-password', 'reset-password.html'],
  ['/onboard',        'onboard.html'],
  ['/profile',        'profile.html'],
  ['/checkin',        'checkin.html'],
  ['/challenges',     'challenges.html'],
  ['/scorecard',      'scorecard.html'],
  ['/leaderboard',    'leaderboard.html'],
  ['/battles',        'battles.html'],
  ['/vault',          'vault.html'],
  ['/privacy',        'privacy.html'],
  ['/contact',        'contact.html'],
  ['/investor',       'investor.html'],
  ['/delete-account', 'delete-account.html'],
  ['/map',            'map.html'],
  ['/progress',       'progress.html'],
  ['/rounds',         'rounds.html'],
  ['/crews',          'crews.html'],
  ['/crew/me',        'crew-me.html'],
  ['/crew/join',      'crew-join.html'],
  ['/crew/create',    'crew-create.html'],
  ['/crew/rounds',    'crew-rounds.html'],
  ['/crew/wars',      'crew-wars.html'],
  ['/missions',       'missions.html'],
  ['/referrals',      'referrals.html'],
  ['/training',      'training.html'],
  ['/home',           'home.html'],
];
pageRoutes.forEach(([route, file]) => {
  app.get(route, (_req, res) => res.sendFile(path.join(__dirname, 'public', file)));
});

// Training pages — must precede /course/:id (Express matches in order)
app.get('/training/:catSlug/:lessonSlug', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'training.html'));
});
app.get('/training/:catSlug', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'training.html'));
});

app.get('/course/:id', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'course.html'));
});

// Global param validation — reject non-numeric :id params early
app.param('id', (req, res, next, value) => {
  if (!/^\d+$/.test(value)) {
    return res.status(400).json({ error: 'Invalid ID parameter' });
  }
  next();
});

// Validate all numeric route params (IDs, page, limit, offset) across API routes
app.use('/api', validateNumericParams());

// Public config — tells frontend its own base URL (used by app service)
app.get('/api/config', (_req, res) => {
  res.json({
    appBaseUrl: process.env.APP_BASE_URL || null,
    env: process.env.NODE_ENV || 'development',
  });
});

// API routes
const authRouter = require('./routes/auth')({ pool });
const playersRouter = require('./routes/players')({ pool });
const coursesRouter = require('./routes/courses')({ pool });
const checkinsRouter = require('./routes/checkins')({ pool });
const uploadRouter = require('./routes/upload')({ pool });
const battlesModule = require('./routes/battles');
const battlesRouter = battlesModule({ pool });
const challengesRouter = require('./routes/challenges')({ pool });
const roundsRouter = require('./routes/rounds')({ pool });
const adminRouter = require('./routes/admin')({ pool });
const leaderboardRouter = require('./routes/leaderboard')({ pool });
const vaultRouter = require('./routes/vault')({ pool });
const deleteAccountRouter = require('./routes/delete-account')({ pool });
const notificationsRouter = require('./routes/notifications')({ pool });
const layoutsRouter = require('./routes/layouts')({ pool });
const crewsRouter = require('./routes/crews')({ pool });
const crewWarsModule = require('./routes/crew-wars');
const crewWarsRouter = crewWarsModule({ pool });
const storyRouter = require('./routes/story')({ pool });
const feedbackRouter = require('./routes/feedback')({ pool });
const reviewsRouter = require('./routes/reviews')({ pool });
const referralsRouter = require('./routes/referrals')({ pool });
const onboardingRouter = require('./routes/onboarding')({ pool });
const campaignRouter = require('./routes/campaign')({ pool });
const trainingRouter = require('./routes/training')({ pool });
const trainingNotificationsRouter = require('./routes/training-notifications')({ pool });

app.use('/api', authRouter);
app.use('/api', playersRouter);
app.use('/api', coursesRouter);
app.use('/api', reviewsRouter);
app.use('/api', checkinsRouter);
app.use('/api', uploadRouter);
app.use('/api', battlesRouter);
app.use('/api', challengesRouter);
app.use('/api', roundsRouter);
app.use('/api', adminRouter);
app.use('/api', leaderboardRouter);
app.use('/api', vaultRouter);
app.use('/api', deleteAccountRouter);
app.use('/api', notificationsRouter);
app.use('/api', layoutsRouter);
app.use('/api', crewsRouter);
app.use('/api', crewWarsRouter);
app.use('/api', storyRouter);
app.use('/api', referralsRouter);
app.use('/api', onboardingRouter);
app.use('/api', campaignRouter);
app.use('/api', trainingRouter);
app.use('/api', trainingNotificationsRouter);
app.use('/api/feedback', feedbackRouter);


// Global error handler — catches unhandled route errors so they don't crash the process
app.use((err, _req, res, _next) => {
  console.error('[global] Unhandled route error:', err.stack || err.message);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Log unhandled rejections instead of crashing
process.on('unhandledRejection', (reason) => {
  console.error('[process] Unhandled promise rejection:', reason);
});

app.listen(port, () => {
  console.log('Server running on port ' + port);
});
