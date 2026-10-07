// src/db/data/lesson-bodies.test.ts — guards on the written lesson bodies.
//
// The failure these exist to prevent is the one the library already shipped
// for months: a lesson that LOOKS coached and is three one-line tips. A body
// that is present but thin, or a drill with no number in it, would read as
// written while teaching no more than the tips did.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LESSONS } from './lessons';
import { LESSON_BODIES } from './lesson-bodies';

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function bodyWords(slug: string): number {
  const b = LESSON_BODIES[slug];
  return words(b.why) + b.how.reduce((n, h) => n + words(h), 0) +
    b.wrong.reduce((n, w) => n + words(w.fault) + words(w.fix), 0) +
    words(b.drill.name) + words(b.drill.reps) + words(b.drill.body);
}

test('every written body names a real lesson', () => {
  const slugs = new Set(LESSONS.map((l) => l.slug));
  for (const slug of Object.keys(LESSON_BODIES)) {
    // A typo here would silently never render: the body would sit in this file
    // looking written while the lesson kept showing its tips.
    assert.ok(slugs.has(slug), `LESSON_BODIES has no such lesson: ${slug}`);
  }
});

test('every written body is complete -- no empty part', () => {
  for (const [slug, b] of Object.entries(LESSON_BODIES)) {
    assert.ok(b.why.trim().length > 0, `${slug}: empty why`);
    assert.ok(b.how.length >= 3, `${slug}: ${b.how.length} steps, want >= 3`);
    assert.ok(b.how.every((h) => h.trim().length > 0), `${slug}: empty step`);
    assert.ok(b.wrong.length >= 3, `${slug}: ${b.wrong.length} faults, want >= 3`);
    for (const w of b.wrong) {
      // Paired on purpose: a fault with no fix is a complaint.
      assert.ok(w.fault.trim().length > 0, `${slug}: empty fault`);
      assert.ok(w.fix.trim().length > 0, `${slug}: fault with no fix: ${w.fault}`);
    }
    assert.ok(b.drill.name.trim().length > 0, `${slug}: drill has no name`);
    assert.ok(b.drill.body.trim().length > 0, `${slug}: drill has no body`);
  }
});

test('every drill carries a number to hit', () => {
  for (const [slug, b] of Object.entries(LESSON_BODIES)) {
    // "practise regularly" is what the tips already said. A drill is a rep
    // count and a distance, so `reps` must contain a digit.
    assert.match(b.drill.reps, /\d/, `${slug}: drill reps has no number: "${b.drill.reps}"`);
  }
});

test('a written body is substantially more than the tips were', () => {
  // Measured before any of this was written: the 134 tips-only bodies ran a
  // median of 21 words and a max of 39. 150 is comfortably past that and
  // still reachable; the ceiling stops a lesson becoming an essay nobody
  // reads on a phone.
  for (const slug of Object.keys(LESSON_BODIES)) {
    const n = bodyWords(slug);
    assert.ok(n >= 150, `${slug}: ${n} words, want >= 150`);
    assert.ok(n <= 600, `${slug}: ${n} words, want <= 600`);
  }
});

test('no body uses a literal double hyphen', () => {
  // This file's comments use "--" as the repo does, but a body string is read
  // by a player, not a developer: it renders as two hyphens on the page. Caught
  // by looking at the screenshot rather than at the markup. The rest of the
  // library uses a real em dash, so these must too.
  for (const [slug, b] of Object.entries(LESSON_BODIES)) {
    const all = JSON.stringify(b);
    assert.ok(!all.includes(' -- '), `${slug}: prose contains " -- ", want an em dash`);
  }
});

// Rollout is one category at a time. This list tracks which are done AND stops
// a new lesson shipping into a finished category with no body beside the rest.
const WRITTEN_CATEGORIES = ['getting-started', 'form-technique', 'putting'];

test('every finished category is finished', () => {
  for (const slug of WRITTEN_CATEGORIES) {
    const ls = LESSONS.filter((l) => l.category_slug === slug);
    assert.ok(ls.length > 0, `no such category: ${slug}`);
    const missing = ls.filter((l) => !LESSON_BODIES[l.slug]).map((l) => l.slug);
    assert.deepEqual(missing, [], `${slug} lessons with no written body: ${missing.join(', ')}`);
  }
});

test('no written body sits outside a category claimed as finished', () => {
  // The other direction: a body written for a lesson in an unfinished category
  // is fine, but a category that is actually complete should be ON the list
  // rather than quietly finished and untracked.
  const byCat = new Map<string, { total: number; written: number }>();
  for (const l of LESSONS) {
    const e = byCat.get(l.category_slug) ?? { total: 0, written: 0 };
    e.total += 1;
    if (LESSON_BODIES[l.slug]) e.written += 1;
    byCat.set(l.category_slug, e);
  }
  for (const [slug, e] of byCat) {
    if (e.total === e.written && !WRITTEN_CATEGORIES.includes(slug)) {
      assert.fail(`${slug} is fully written but missing from WRITTEN_CATEGORIES`);
    }
  }
});

test('a written body reaches the lesson through LESSONS', () => {
  // The merge in lessons.ts is the only path from this file to the database.
  const l = LESSONS.find((x) => x.slug === 'putting-fundamentals')!;
  assert.ok(l.content_body.why, 'why did not merge onto the lesson');
  assert.ok(l.content_body.drill?.reps, 'drill did not merge onto the lesson');
  // The tips survive the merge -- they are the recap, not the casualty.
  assert.equal(l.content_body.tips.length, 3);
});

test('a lesson with no written body still has its tips', () => {
  const plain = LESSONS.find((l) => !LESSON_BODIES[l.slug])!;
  assert.ok(plain, 'expected at least one not-yet-written lesson');
  assert.ok(plain.content_body.tips.length > 0);
  assert.equal(plain.content_body.why, undefined);
});

test('push vs spin putt does not claim a wind advantage for either', () => {
  // The two tips used to contradict each other inside one three-line lesson:
  // the push putt was "steady in wind" and the spin putt "better into
  // headwinds". The sport has not settled this, so the lesson names the real
  // trade (spin holds an angle, low spin spits out less) and picks no side.
  const l = LESSONS.find((x) => x.slug === 'push-vs-spin-putt')!;
  const all = JSON.stringify(l.content_body).toLowerCase();
  for (const claim of ['steady in wind', 'better in wind', 'better into headwind', 'best in wind']) {
    assert.ok(!all.includes(claim), `push-vs-spin-putt claims "${claim}"`);
  }
});

test('the lesson page prefers the written body over the tips', () => {
  const page = readFileSync('web/training.html', 'utf8');
  // Without this branch a written lesson would fall through to the generic
  // shapes below and render as three bullets -- the bug this work fixes.
  assert.match(page, /if \(cb\.why \|\| cb\.drill \|\| Array\.isArray\(cb\.how\)\) return renderWritten\(cb\);/);
  const written = page.indexOf('return renderWritten(cb);');
  const tipsBranch = page.indexOf('Array.isArray(cb.tips || cb.points)');
  assert.ok(written > 0 && tipsBranch > written, 'renderWritten must be reached before the tips branch');
});

test('the /learn category pages render the written body', () => {
  const src = readFileSync('src/http/learn.ts', 'utf8');
  // These pages are the indexed ones; leaving them on tips alone would keep
  // the thin-content problem the file's own header is about.
  assert.match(src, /content_body\.why/);
  assert.match(src, /content_body\.drill/);
});
