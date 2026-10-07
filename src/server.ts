// src/server.ts — process entry point. Builds the app and starts listening.

import { createApp } from './http/app';
import { pool } from './db/pool';
import { config } from './config';
import { runMigrations } from './db/migrate';
import { probeDatabase, DatabaseUnreachableError } from './db/probe';
import { startScheduler } from './lib/scheduler';

const app = createApp(pool);

async function start(): Promise<void> {
  // GATE THE DEPLOY on the database being reachable. Without this the process
  // used to open its port regardless, Render's health check passed, and a
  // deploy that could not serve a single query went live under a green banner
  // (2026-10-07: a rotated password pasted with a leading space). Exiting
  // non-zero instead means the deploy fails and the PREVIOUS version keeps
  // serving, which is the whole point.
  try {
    await probeDatabase(pool);
  } catch (err) {
    const detail = err instanceof DatabaseUnreachableError ? err.message : String(err);
    console.error(`[startup] FATAL: ${detail}`);
    console.error('[startup] refusing to start without a database — failing the deploy so the previous version keeps serving');
    await pool.end().catch(() => {});
    process.exit(1);
  }

  // A migration failure is NOT fatal, and that distinction is the point. The
  // database answers, so most of the app works and the next deploy retries;
  // wedging the process here would turn a partial schema problem into an
  // outage. Only unreachability (above) is worth failing the deploy over.
  try {
    await runMigrations(pool);
  } catch (err) {
    console.error('[startup] migration failed (database IS reachable; serving anyway):', err);
  }

  app.listen(config.port, () => {
    console.log(`[startup] listening on port ${config.port} (${config.nodeEnv})`);
    startScheduler();
  });
}

void start();

process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandled rejection:', reason);
});
