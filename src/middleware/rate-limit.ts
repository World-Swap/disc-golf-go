// src/middleware/rate-limit.ts — a small fixed-window limiter for the public
// auth endpoints.
//
// Written rather than pulled in: express-rate-limit would be a new dependency
// installed on every `npm ci`, including both native builds, for about thirty
// lines of logic. The app also runs as a single Render instance by design
// (see RUN_SCHEDULER in CLAUDE.md), which is the case where an in-process
// counter is enough.
//
// Caveat worth knowing before scaling: the counter lives in this process, so
// two instances would each allow the full quota. If the web service is ever
// scaled out, this wants moving to Postgres or Redis.
import type { RequestHandler } from 'express';

interface Hit { count: number; resetAt: number; }

/** Keyed by IP + route. Entries are dropped lazily once their window passes. */
const buckets = new Map<string, Hit>();
let lastSweep = Date.now();

/** Drop expired buckets so a long-running process does not grow forever. */
function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, hit] of buckets) if (hit.resetAt <= now) buckets.delete(key);
}

/**
 * Behind Render the client address is in x-forwarded-for; req.ip alone is the
 * proxy. Take the first entry, which is the original client.
 */
function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0]!.trim();
  return req.ip || 'unknown';
}

export function rateLimit(opts: { windowMs: number; max: number; name: string }): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    sweep(now);

    const key = opts.name + ':' + clientIp(req);
    const hit = buckets.get(key);

    if (!hit || hit.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }

    hit.count += 1;
    if (hit.count > opts.max) {
      const retryAfter = Math.ceil((hit.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
      return;
    }
    return next();
  };
}

/** Exposed for tests, which would otherwise leak counts between cases. */
export function resetRateLimits(): void {
  buckets.clear();
}
