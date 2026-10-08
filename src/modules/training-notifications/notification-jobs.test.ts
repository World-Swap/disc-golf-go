// src/modules/training-notifications/notification-jobs.test.ts
//
// The three scheduled notification jobs were ALL dead, and nothing said so.
//
//   training-daily-tip.js    required content_type = 'tip_card'. Every one of
//                            the 134 curated lessons is 'video_embed', so the
//                            filter matched nothing: the job logged "No tip
//                            cards found" and exited 0 every morning.
//   training-reminder.js     read training_completions.created_at. The column
//                            is completed_at, so it threw on its first query
//                            and exited 1. A second copy of the same typo sat
//                            behind `catch (_) {}`, where it could never be
//                            seen at all.
//   training-reengagement.js had both of those AND an INSERT naming five
//                            columns while supplying four values, which
//                            Postgres rejects outright.
//
// All three also filtered on players.deleted_at, which does not exist --
// account deletion is a hard DELETE FROM players.
//
// A job that exits 0 having done nothing is indistinguishable from a job with
// no work to do, which is why this went unnoticed. These guards are static
// because the jobs run in a forked child against production and nothing in CI
// executes them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const JOBS = [
  'scripts/training-daily-tip.js',
  'scripts/training-reminder.js',
  'scripts/training-reengagement.js',
];

/**
 * Strip JS line comments and SQL `--` comments.
 *
 * Load-bearing: the fix added comments that quote the very strings these
 * guards forbid ("tc.created_at", "deleted_at"). Without stripping, every
 * guard would fire on the prose explaining why the bug happened -- the same
 * trap that made a CSS comment fail the promo "key takeaways" rule and a
 * doc comment fail the wireVideo() assertion.
 */
function code(src: string): string {
  return src
    .split('\n')
    .map((line) => line.replace(/\s*(\/\/|--)\s.*$/, ''))
    .join('\n');
}

test('no job reads a column that does not exist', () => {
  // training_completions has completed_at; players has no deleted_at at all.
  for (const f of JOBS) {
    const src = code(readFileSync(f, 'utf8'));
    assert.ok(!/\bcreated_at\b[\s\S]{0,80}?FROM\s+training_completions/i.test(src),
      `${f} reads created_at from training_completions (it is completed_at)`);
    assert.ok(!/training_completions\s+tc\b[\s\S]{0,200}?tc\.created_at/i.test(src),
      `${f} reads tc.created_at (it is tc.completed_at)`);
    assert.ok(!/\bdeleted_at\b/.test(src),
      `${f} filters on players.deleted_at, which does not exist`);
  }
});

test('no job filters on a content_type the library does not use', () => {
  // All 134 curated lessons are video_embed. A filter that silently selects
  // nothing looks exactly like a job with nothing to do.
  for (const f of JOBS) {
    const src = code(readFileSync(f, 'utf8'));
    assert.ok(!/content_type\s*=\s*'tip_card'/.test(src),
      `${f} requires content_type = 'tip_card', which matches no lesson`);
  }
});

test('every INSERT supplies one value per column', () => {
  // The reengagement INSERT named (player_id, type, title, message, lesson_id)
  // and supplied four values, so Postgres rejected it every run. Counting is
  // the only way to catch this without executing the query.
  const countTop = (s: string): number => {
    let depth = 0, n = 1;
    for (const ch of s) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ',' && depth === 0) n++;
    }
    return n;
  };
  let checked = 0;
  for (const f of JOBS) {
    const src = readFileSync(f, 'utf8');
    const re = /INSERT\s+INTO\s+\w+\s*\(([^)]*)\)\s*VALUES\s*\(([\s\S]*?)\)\s*\n/gi;
    for (const m of src.matchAll(re)) {
      const cols = countTop(m[1].trim());
      const vals = countTop(m[2].trim());
      assert.equal(vals, cols,
        `${f}: INSERT names ${cols} columns but supplies ${vals} values -- ${m[1].trim()}`);
      checked++;
    }
  }
  assert.ok(checked >= 3, `expected to check at least 3 INSERTs, checked ${checked}`);
});

test('no job can push an unwatched channel upload as a coached tip', () => {
  // Same rule as the seven recommendation queries in training.repo.ts: a
  // generated row is an upload nobody here has watched, so it must never be
  // selected as "today's tip" or a lesson to come back to.
  for (const f of ['scripts/training-daily-tip.js', 'scripts/training-reengagement.js']) {
    const src = code(readFileSync(f, 'utf8'));
    assert.match(src, /generated_from_video IS NULL/,
      `${f} can select a generated upload as a coached tip`);
  }
});

test('every job supports --dry-run and guards each write with it', () => {
  for (const f of JOBS) {
    const src = code(readFileSync(f, 'utf8'));
    assert.match(src, /DRY_RUN\s*=\s*process\.argv\.includes\('--dry-run'\)/,
      `${f} has no --dry-run flag`);
    assert.match(src, /if \(DRY_RUN\)/, `${f} never checks DRY_RUN before writing`);
  }
});

test('no job substitutes filler copy for real lesson content', () => {
  // The re-engagement job fell back to "Master your form / Practice your form
  // daily for better results" whenever its query found nothing -- which was
  // always. Filler sent to a lapsed player is worse than sending nothing.
  // code() again: the comment explaining this bug quotes the filler verbatim,
  // and this guard fired on that prose the first time it ran.
  for (const f of JOBS) {
    const src = code(readFileSync(f, 'utf8'));
    assert.ok(!/Practice your form daily for better results/.test(src),
      `${f} still carries the hardcoded filler tip`);
  }
});
