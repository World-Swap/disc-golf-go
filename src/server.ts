// src/server.ts — process entry point. Builds the app and starts listening.

import { createApp } from './http/app';
import { pool } from './db/pool';
import { config } from './config';
import { runMigrations } from './db/migrate';

const app = createApp(pool);

async function start(): Promise<void> {
  try {
    await runMigrations(pool);
  } catch (err) {
    // Don't wedge the process on a migration hiccup — log and serve anyway so
    // /health stays reachable and the next deploy can retry.
    console.error('[startup] migration failed:', err);
  }
  app.listen(config.port, () => {
    console.log(`[startup] listening on port ${config.port} (${config.nodeEnv})`);
  });
}

void start();

process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandled rejection:', reason);
});
