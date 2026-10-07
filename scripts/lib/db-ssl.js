// scripts/lib/db-ssl.js — the ONE place a standalone script decides TLS.
//
// Every script here used to carry its own copy of
// `process.env.DATABASE_URL.includes('localhost') ? false : {...}`, which is a
// substring match over the whole connection string and is wrong in both
// directions (src/db/ssl.ts documents it at length). The dangerous direction is
// that a REMOTE url with "localhost" anywhere in it -- in the password, in a
// query parameter, in a hostname like localhost.example.com -- silently
// disables TLS and sends credentials over the open internet.
//
// The rule lives in TypeScript because the server uses it too, and two copies
// of a security decision is how the first one came to be wrong in nine files.
require('ts-node/register/transpile-only');
const { sslConfigFor } = require('../../src/db/ssl');

module.exports = {
  /** TLS setting for a connection string, defaulting to DATABASE_URL. */
  dbSsl(connectionString) {
    return sslConfigFor(connectionString || process.env.DATABASE_URL || '');
  },
};
