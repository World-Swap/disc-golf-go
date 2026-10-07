// src/db/probe.ts — "can this process reach its database at all?"
//
// This exists because a deploy with an unreachable database used to go LIVE.
// runMigrations() threw, server.ts caught and logged it, the port opened anyway,
// Render's health check passed, and the green banner appeared over a site that
// could not serve a single query. On 2026-10-07 that happened for real: a
// rotated Neon password was pasted with a leading space, every request 500'd,
// and nothing in the deploy said so.
//
// The fix is to separate two failures the old code lumped together:
//
//   * The database is UNREACHABLE  -> the process is useless. Exit non-zero so
//     the deploy fails and the previous version keeps serving.
//   * The database is reachable but a MIGRATION STATEMENT failed -> most of the
//     app still works and the next deploy retries, so serve anyway. That was
//     the original intent of the catch in server.ts, and it is still right --
//     it was only ever wrong about the first case.
//
// Deliberately NOT wired into /health: that stays database-free so a transient
// Neon blip cannot make Render restart-loop a container that is otherwise fine.
// This is a startup gate, not a liveness probe.

import type { Database } from './types';

/** Postgres SQLSTATEs that retrying cannot fix -- fail the deploy immediately. */
const PERMANENT = new Set([
  '28P01', // invalid_password          -- the 2026-10-07 outage
  '28000', // invalid_authorization_specification
  '3D000', // invalid_catalog_name      -- database does not exist
  '42501', // insufficient_privilege
]);

export interface ProbeOptions {
  /** Total attempts before giving up. */
  attempts?: number;
  /** Base delay between attempts; doubles each time. */
  delayMs?: number;
  /** Injectable for tests so they need no timers. */
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}

export class DatabaseUnreachableError extends Error {
  override readonly cause: unknown;
  readonly permanent: boolean;
  constructor(message: string, cause: unknown, permanent: boolean) {
    super(message);
    this.name = 'DatabaseUnreachableError';
    this.cause = cause;
    this.permanent = permanent;
  }
}

const codeOf = (e: unknown): string | undefined =>
  typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : undefined;

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Run `SELECT 1` until it succeeds or the attempts run out.
 *
 * Retries exist because a cold Neon endpoint can take seconds to wake, and
 * failing a deploy over that would be its own kind of flapping. But a wrong
 * password is not going to become right on attempt four, so PERMANENT codes
 * abort immediately -- the useful signal arrives in ~1s instead of ~15s.
 */
export async function probeDatabase(db: Database, opts: ProbeOptions = {}): Promise<void> {
  const attempts = opts.attempts ?? 5;
  const baseDelay = opts.delayMs ?? 1_000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = opts.log ?? ((m: string) => console.error(m));

  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await db.query('SELECT 1');
      if (attempt > 1) log(`[startup] database reachable on attempt ${attempt}`);
      return;
    } catch (err) {
      last = err;
      const code = codeOf(err);
      if (code && PERMANENT.has(code)) {
        throw new DatabaseUnreachableError(
          `database rejected this process's credentials (SQLSTATE ${code}): ${messageOf(err)}`,
          err,
          true
        );
      }
      if (attempt < attempts) {
        const wait = baseDelay * 2 ** (attempt - 1);
        log(`[startup] database unreachable (attempt ${attempt}/${attempts}): ${messageOf(err)} — retrying in ${wait}ms`);
        await sleep(wait);
      }
    }
  }
  throw new DatabaseUnreachableError(
    `database unreachable after ${attempts} attempts: ${messageOf(last)}`,
    last,
    false
  );
}
