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

// HTML page routes
app.get('/register', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/login', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/forgot-password', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'forgot-password.html'));
});

app.get('/reset-password', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

app.get('/profile', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

app.get('/checkin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'checkin.html'));
});

app.get('/challenges', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'challenges.html'));
});

app.get('/scorecard', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'scorecard.html'));
});

app.get('/leaderboard', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'leaderboard.html'));
});

app.get('/battles', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'battles.html'));
});

app.get('/vault', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'vault.html'));
});

app.get('/privacy', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

app.get('/contact', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

app.get('/investor', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'investor.html'));
});

app.get('/delete-account', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'delete-account.html'));
});

app.get('/course/:id', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'course.html'));
});

app.get('/map', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'map.html'));
});

app.get('/progress', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'progress.html'));
});

app.get('/rounds', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'rounds.html'));
});

app.get('/crews', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'crews.html'));
});

app.get('/crew/me', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'crew-me.html'));
});

app.get('/crew/join', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'crew-join.html'));
});

app.get('/crew/create', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'crew-create.html'));
});

app.get('/crew/rounds', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'crew-rounds.html'));
});

app.get('/crew/wars', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'crew-wars.html'));
});

app.get('/story', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'story.html'));
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
app.use('/api/feedback', feedbackRouter);

app.get('/', (_req, res) => {
  const slug = process.env.POLSIA_ANALYTICS_SLUG || '';
  const htmlPath = path.join(__dirname, 'public', 'index.html');

  if (fs.existsSync(htmlPath)) {
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace('__POLSIA_SLUG__', slug);
    res.type('html').send(html);
  } else {
    res.json({ message: 'Hello from Polsia Instance!' });
  }
});

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
