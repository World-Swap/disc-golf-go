// middleware/security.js — owns security headers, rate limiting, input sanitization,
// and numeric param validation. Does NOT own auth/JWT (see auth.js).

const crypto = require('crypto');

// ── Security Headers (replaces helmet) ───────────────────────────────────────
// Sets standard security headers on every response.
function securityHeaders() {
  return (_req, res, next) => {
    // Prevent MIME sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    // XSS protection for older browsers
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // Referrer policy — leak origin only
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Don't expose server tech
    res.removeHeader('X-Powered-By');
    // Permissions policy — restrict dangerous APIs
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    // Strict transport security (HTTPS only)
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}

// ── Rate Limiter (in-memory, replaces express-rate-limit) ────────────────────
// Sliding-window counter per IP. Suitable for single-instance deployments.
// WHY in-memory: the app runs on a single Render instance, no Redis needed.
const rateLimitStores = new Map();

function rateLimit({ windowMs = 15 * 60 * 1000, max = 100, message = 'Too many requests, please try again later' } = {}) {
  const storeName = `rl_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const store = new Map();
  rateLimitStores.set(storeName, store);

  // Cleanup expired entries every windowMs
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now - entry.start > windowMs) store.delete(key);
    }
  }, windowMs);
  cleanup.unref(); // Don't block process exit

  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = store.get(key);

    if (!entry || now - entry.start > windowMs) {
      entry = { start: now, count: 0 };
      store.set(key, entry);
    }

    entry.count++;

    // Set standard rate limit headers
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil((entry.start + windowMs) / 1000));

    if (entry.count > max) {
      return res.status(429).json({ error: message });
    }

    next();
  };
}

// ── Input Sanitization ───────────────────────────────────────────────────────
// Escapes HTML entities to prevent XSS in stored user content.
// WHY not a library: we only need to neutralize 5 dangerous chars.
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Middleware that sanitizes specified body fields before they reach route handlers.
// Usage: sanitizeFields('display_name', 'username', 'name', 'description')
function sanitizeFields(...fields) {
  return (req, _res, next) => {
    if (req.body && typeof req.body === 'object') {
      for (const field of fields) {
        if (typeof req.body[field] === 'string') {
          req.body[field] = sanitizeString(req.body[field]);
        }
      }
    }
    next();
  };
}

// ── Numeric Param Validation ─────────────────────────────────────────────────
// Middleware that validates all route params matching common ID patterns are
// valid positive integers. Prevents injection via route params like `:id`.
function validateNumericParams() {
  return (req, res, next) => {
    for (const [key, value] of Object.entries(req.params)) {
      // Only validate params that look like IDs or numeric values
      if (/^(id|.*Id|.*_id|page|limit|offset)$/i.test(key)) {
        const num = parseInt(value, 10);
        if (isNaN(num) || num < 0 || String(num) !== value) {
          return res.status(400).json({ error: `Invalid parameter: ${key} must be a positive integer` });
        }
      }
    }
    next();
  };
}

// ── Admin Auth via JWT (replaces plain-text x-admin-token) ───────────────────
// Admin login now compares against the env var using timing-safe comparison,
// then issues a short-lived JWT. Subsequent requests verify the JWT.
const jwt = require('jsonwebtoken');

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'dggo-admin-secret-change-in-prod';
const ADMIN_TOKEN_EXPIRY = '8h';

function createAdminToken() {
  return jwt.sign({ role: 'admin', iat: Math.floor(Date.now() / 1000) }, ADMIN_JWT_SECRET, { expiresIn: ADMIN_TOKEN_EXPIRY });
}

function verifyAdminPassword(provided) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  if (!provided || typeof provided !== 'string') return false;

  // Timing-safe comparison to prevent timing attacks
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }

  // Verify JWT issued by admin login endpoint
  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    if (decoded.role === 'admin') {
      return next();
    }
  } catch (err) {
    console.warn('[admin-auth] Token verification failed:', err.message);
  }

  return res.status(401).json({ error: 'Invalid or expired admin token' });
}

module.exports = {
  securityHeaders,
  rateLimit,
  sanitizeString,
  sanitizeFields,
  validateNumericParams,
  createAdminToken,
  verifyAdminPassword,
  requireAdmin,
};
