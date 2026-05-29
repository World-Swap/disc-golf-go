const crypto = require('crypto');

// Static asset extensions to skip
const SKIP_EXTENSIONS = /\.(css|js|png|jpg|jpeg|ico|svg|webmanifest|map|woff|woff2|ttf|gif|webp)$/i;

function createPageviewTracker(pool) {
  return function pageviewTracker(req, res, next) {
    // Skip API calls, health check, admin routes, static assets
    const path = req.path;
    if (
      path.startsWith('/api') ||
      path === '/health' ||
      path.startsWith('/admin') ||
      SKIP_EXTENSIONS.test(path)
    ) {
      return next();
    }

    // Only track GET requests (page navigations)
    if (req.method !== 'GET') return next();

    const ip =
      req.headers['x-forwarded-for']
        ? req.headers['x-forwarded-for'].split(',')[0].trim()
        : req.ip || 'unknown';

    const userAgent = req.headers['user-agent'] || '';

    // Day-scoped session fingerprint: IP + User-Agent + UTC date
    const today = new Date().toISOString().split('T')[0];
    const sessionHash = crypto
      .createHash('sha256')
      .update(`${ip}:${userAgent}:${today}`)
      .digest('hex');

    // Non-blocking — never delays the response
    pool
      .query(
        'INSERT INTO pageviews (path, ip, user_agent, session_hash) VALUES ($1, $2, $3, $4)',
        [path, ip.substring(0, 100), userAgent.substring(0, 500), sessionHash]
      )
      .catch(() => {});

    next();
  };
}

module.exports = { createPageviewTracker };
