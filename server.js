// server.js — production entry point (v2 cutover).
// Render's start command runs this file. It boots the TypeScript rebuild in
// src/, preferring the compiled dist/ build and falling back to ts-node when
// dist isn't present — so it launches the new app regardless of whether the
// build step compiled it.
//
// The legacy Express app that previously lived here is preserved in git history
// (the commit before the v2 cutover) for rollback.

'use strict';
const fs = require('fs');
const path = require('path');

const distEntry = path.join(__dirname, 'dist', 'server.js');

if (fs.existsSync(distEntry)) {
  require(distEntry);
} else {
  // No compiled build present — run the TypeScript source directly.
  require('ts-node/register/transpile-only');
  require(path.join(__dirname, 'src', 'server.ts'));
}
