// src/db/ssl.test.ts — TLS must never be disabled for a remote database.
//
// The old rule was `databaseUrl.includes('localhost')`, a substring match over
// the whole url. The dangerous half is the false POSITIVE: a remote url with
// "localhost" in the password disabled TLS and sent credentials in the clear.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sslConfigFor } from './ssl';

const on = (s: ReturnType<typeof sslConfigFor>) => s !== false;

test('production Neon keeps exactly the TLS setting it has always had', () => {
  // Guards against quietly tightening something that could fail a deploy.
  const s = sslConfigFor('postgresql://u:p@ep-x-pooler.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require');
  assert.deepEqual(s, { rejectUnauthorized: false });
});

test('loopback databases do not get TLS forced on them', () => {
  for (const url of [
    'postgres://u:p@localhost:5432/db',
    'postgres://u:p@127.0.0.1:5432/db',   // the case that broke the test harness
    'postgres://u:p@127.1.2.3:5432/db',   // the rest of 127.0.0.0/8
    'postgres://u:p@[::1]:5432/db',
    'postgres://u:p@db.localhost:5432/db',
    'postgres:///db',                      // unix socket, no host at all
  ]) {
    assert.equal(sslConfigFor(url), false, `${url} should not use TLS`);
  }
});

test('a REMOTE host is never downgraded by the word localhost appearing elsewhere', () => {
  // Each of these contains "localhost" and would have disabled TLS before.
  for (const url of [
    'postgresql://user:localhost@db.example.com/app',          // in the password
    'postgresql://user:p@db.example.com/app?opt=localhost',     // in a query param
    'postgresql://user:p@localhost.example.com/app',            // in a longer hostname
    'postgresql://user:p@notlocalhost.neon.tech/app',           // as a substring
  ]) {
    assert.ok(on(sslConfigFor(url)), `${url} MUST keep TLS`);
  }
});

test('an explicit sslmode wins over the hostname guess', () => {
  assert.equal(sslConfigFor('postgres://u:p@db.example.com/app?sslmode=disable'), false,
    'disable means the operator chose plaintext deliberately');
  assert.deepEqual(sslConfigFor('postgres://u:p@db.example.com/app?sslmode=verify-full'), { rejectUnauthorized: true },
    'verify-full is the opt-in to real certificate verification');
  assert.deepEqual(sslConfigFor('postgres://u:p@localhost/app?sslmode=require'), { rejectUnauthorized: false },
    'an explicit require beats the loopback guess');
});

test('an unparseable connection string fails CLOSED', () => {
  // A connection that fails loudly beats one that ships credentials in the clear.
  assert.ok(on(sslConfigFor('host=db.example.com user=u password=p')), 'libpq DSN must keep TLS');
  assert.ok(on(sslConfigFor('')), 'empty string must keep TLS');
});
