// src/server.ts — process entry point. Builds the app and starts listening.

import { createApp } from './http/app';
import { pool } from './db/pool';
import { config } from './config';

const app = createApp(pool);

app.listen(config.port, () => {
  console.log(`[startup] listening on port ${config.port} (${config.nodeEnv})`);
});

process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandled rejection:', reason);
});
