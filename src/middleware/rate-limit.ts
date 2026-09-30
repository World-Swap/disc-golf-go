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
 * req.ip, resolved by Express from the `trust proxy` hop count set in app.ts.
 *
 * This used to read x-forwarded-for and take the first entry. A proxy APPENDS
 * to that header rather than replacing it, so the first entry is whatever the
 * client sent -- every limit here could be sidestepped by putting a different
 * value in one header on each request. Express, given a hop count, counts from
 * the trusted end instead, which is the whole reason app.ts no longer passes
 * `true`. Never go back to reading the header directly.
 */
function clientIp(req: { ip?: string }): string {
  const ip = req.ip || 'unknown';
  warnIfInternal(ip);
  return ip;
}

/**
 * Make a wrong hop count announce itself.
 *
 * TRUST_PROXY_HOPS says how many proxies to skip. Set it too high and req.ip
 * resolves to a proxy's own address instead of the caller's -- which is not an
 * error anywhere, it just quietly puts EVERY user in one bucket and starts
 * handing real people 429s on signup. A private or loopback address arriving
 * here in production is the signature of exactly that, so say so once rather
 * than leaving someone to infer it from support mail.
 */
const PRIVATE_IP = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc|fd)/i;
let warnedInternal = false;
function warnIfInternal(ip: string): void {
  if (warnedInternal || process.env.NODE_ENV !== 'production') return;
  if (!PRIVATE_IP.test(ip)) return;
  warnedInternal = true;
  console.warn(
    `[rate-limit] client IP resolved to ${ip}, which is internal. TRUST_PROXY_HOPS ` +
    `(currently ${process.env.TRUST_PROXY_HOPS || 1}) is probably too high, so every ` +
    `caller is sharing one rate-limit bucket. Lower it until this stops.`
  );
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
  gates.clear();
}

// ── A second bound that does not depend on who is asking ────────────────────
//
// Per-IP limiting assumes the IP means something. For the admin login it does
// not: there is exactly ONE legitimate admin, and an attacker willing to come
// from many addresses (or to keep guessing the hop count wrong for us) gets a
// fresh per-IP budget each time. So admin login also carries a global cap on
// FAILED attempts, which no amount of address rotation can widen.
//
// Only FAILURES are counted, and a success clears the gate. But be clear about
// what that does and does not buy, because a first draft of this comment got
// it wrong and a live run caught it: once the gate has tripped, the cooldown
// refuses EVERYONE, the owner with the right password included. It cannot work
// any other way -- checking the password to decide whether to apply the limit
// is exactly the unlimited guessing the limit exists to stop.
//
// So this is the classic lockout trade, and the numbers are chosen for it
// rather than for the tightest possible bound:
//
//   - The per-IP limit is the everyday control, and it is a real one now that
//     the address cannot be forged. An attacker needs genuinely distinct
//     sources to get more than `max` attempts per window out of it.
//   - This global gate is the backstop for the distributed case only. It is
//     deliberately LOOSE (see the route) and its cooldown deliberately SHORT,
//     because a tight one hands anybody a way to keep the owner out of their
//     own dashboard indefinitely for the price of a few bad passwords.
//
// It buys orders of magnitude against guessing, not immunity, and it does not
// make a weak password safe. The password remains the control that matters.

interface GlobalGate { failures: number; lockedUntil: number; windowEnd: number; }
const gates = new Map<string, GlobalGate>();

export interface GlobalLimitOpts {
  name: string;
  /** Failures tolerated inside one window before the cooldown starts. */
  max: number;
  /** How long failures are counted over. */
  windowMs: number;
  /**
   * How long the refusal lasts once tripped. Kept well below windowMs on
   * purpose: this is the span for which a live attack also shuts the owner
   * out, so it is the cost of the trade and wants to be small.
   */
  cooldownMs: number;
}

/** Read the gate, clearing it if its window or cooldown has passed. */
function gateFor(opts: GlobalLimitOpts, now: number): GlobalGate {
  const g = gates.get(opts.name);
  if (!g || (g.lockedUntil <= now && g.windowEnd <= now)) {
    const fresh = { failures: 0, lockedUntil: 0, windowEnd: now + opts.windowMs };
    gates.set(opts.name, fresh);
    return fresh;
  }
  return g;
}

/**
 * Refuse while the cooldown is running, and count the failures that start it.
 * A response is a failure when it is a 4xx, which for this route means the
 * password did not match; a 200 resets the counter outright.
 */
export function globalFailureLimit(opts: GlobalLimitOpts): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    const gate = gateFor(opts, now);

    if (gate.lockedUntil > now) {
      const retryAfter = Math.ceil((gate.lockedUntil - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ error: 'Too many failed attempts. Try again in a few minutes.' });
      return;
    }

    res.on('finish', () => {
      if (res.statusCode === 200) {
        gates.delete(opts.name);
        return;
      }
      if (res.statusCode < 400) return;
      gate.failures += 1;
      if (gate.failures >= opts.max) gate.lockedUntil = Date.now() + opts.cooldownMs;
    });
    return next();
  };
}
