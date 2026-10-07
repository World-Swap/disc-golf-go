// src/db/probe.test.ts — the startup gate that stops a broken deploy going live.
//
// The bug this guards: a deploy whose database was unreachable opened its port,
// passed Render's health check and went live green, serving 500s. Reproduced in
// production on 2026-10-07.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { probeDatabase, DatabaseUnreachableError } from './probe';
import type { Database } from './types';

const noSleep = async () => {};
const silent = () => {};

/** A Database whose query() fails `failures` times, then succeeds. */
function flaky(failures: number, err: unknown): Database & { calls: number } {
  const db = {
    calls: 0,
    async query() {
      db.calls++;
      if (db.calls <= failures) throw err;
      return { rows: [{ '?column?': 1 }] } as never;
    },
    async connect() {
      throw new Error('not used');
    },
  };
  return db as Database & { calls: number };
}

const pgError = (code: string, message = 'boom') => Object.assign(new Error(message), { code });

test('a reachable database passes on the first try', async () => {
  const db = flaky(0, null);
  await probeDatabase(db, { sleep: noSleep, log: silent });
  assert.equal(db.calls, 1, 'should not retry a healthy database');
});

test('a transient failure is retried, not fatal', async () => {
  // A cold Neon endpoint can take seconds to wake. Failing the deploy over that
  // would be its own flapping, so transient errors get retries.
  const db = flaky(3, pgError('ECONNREFUSED'));
  await probeDatabase(db, { attempts: 5, sleep: noSleep, log: silent });
  assert.equal(db.calls, 4, 'should retry until it succeeds');
});

test('a bad password fails IMMEDIATELY without burning retries', async () => {
  // 28P01 is the exact code from the 2026-10-07 outage. A wrong password will
  // not become right on attempt four, so retrying only delays the real signal.
  const db = flaky(99, pgError('28P01', 'password authentication failed'));
  await assert.rejects(
    () => probeDatabase(db, { attempts: 5, sleep: noSleep, log: silent }),
    (e: unknown) => e instanceof DatabaseUnreachableError && e.permanent
  );
  assert.equal(db.calls, 1, 'a permanent auth error must not be retried');
});

test('exhausted retries throw, so the caller can fail the deploy', async () => {
  const db = flaky(99, pgError('ETIMEDOUT'));
  await assert.rejects(
    () => probeDatabase(db, { attempts: 3, sleep: noSleep, log: silent }),
    (e: unknown) => e instanceof DatabaseUnreachableError && !e.permanent
  );
  assert.equal(db.calls, 3, 'should use exactly the attempts it was given');
});

test('server.ts exits non-zero when the probe fails, and only then', () => {
  // Source-level, because the invariant is about process exit: the whole fix is
  // that unreachability is fatal while a migration failure is not.
  const src = readFileSync(join(__dirname, '../server.ts'), 'utf8');

  // Anchor on the CALL SITES, not the names: both are also imported at the top,
  // and the first draft of this test compared import order while claiming to
  // compare call order -- it failed against correct code for the wrong reason.
  const probeIdx = src.indexOf('await probeDatabase(');
  const migrateIdx = src.indexOf('await runMigrations(');
  assert.ok(probeIdx > -1, 'server.ts must actually call probeDatabase');
  assert.ok(migrateIdx > -1, 'server.ts must actually call runMigrations');
  assert.ok(probeIdx < migrateIdx, 'the probe must gate BEFORE migrations run');

  assert.match(src, /process\.exit\(1\)/, 'an unreachable database must fail the deploy');

  // The listen() call must come after the exit path, never before it.
  assert.ok(src.indexOf('process.exit(1)') < src.indexOf('app.listen'),
    'the process must be able to exit before it ever opens its port');

  // A migration failure must NOT exit -- that was the original, correct intent.
  const migrationCatch = src.slice(src.indexOf('await runMigrations'));
  const nextListen = migrationCatch.indexOf('app.listen');
  assert.ok(!migrationCatch.slice(0, nextListen).includes('process.exit'),
    'a migration failure must stay non-fatal when the database is reachable');
});
