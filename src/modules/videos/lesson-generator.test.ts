// src/modules/videos/lesson-generator.test.ts
//
// This publishes lessons with no human review, so the guards here are about the
// two things that would be expensive to get wrong: touching the 134 curated
// lessons, and publishing the same video twice.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { __test } from './lesson-generator';

const { cleanTitle, lessonSlug, GENERATED_XP } = __test;
const SRC = readFileSync(join(__dirname, 'lesson-generator.ts'), 'utf8');

test('a leading "Part N" marker survives truncation', () => {
  // A long title that ends "(Part 3)" loses the marker if it is appended before
  // the cut -- and a three-part series then publishes three IDENTICAL titles.
  const long = 'Part %d of 3. If you struggle with getting enough power on putts, there are three things you must do.';
  const titles = [1, 2, 3].map((n) => cleanTitle(long.replace('%d', String(n))));
  assert.equal(new Set(titles).size, 3, `titles collide: ${titles.join(' / ')}`);
  for (const [i, t] of titles.entries()) assert.match(t, new RegExp(`\\(Part ${i + 1}\\)$`));
});

test('feed decoration is stripped but the words are not changed', () => {
  assert.equal(cleanTitle('🥏 Stop Rushing Your Plant Foot'), 'Stop Rushing Your Plant Foot');
  assert.equal(cleanTitle('Top 5 PDGA rules to know #shorts'), 'Top 5 PDGA rules to know');
  // An apostrophe is a word boundary, so a naive \b[A-Z]{4,}\b turned
  // SHOULDN'T into "Shouldn'T".
  assert.match(cleanTitle("Paul McBeth Form Breakdown! What you SHOULDN'T copy!"), /Shouldn't copy/);
  // Real acronyms are left alone.
  assert.match(cleanTitle('PDGA rules explained'), /^PDGA/);
});

test('a truncated title says so, and stays within the card', () => {
  const t = cleanTitle('A'.repeat(20) + ' ' + 'B'.repeat(20) + ' ' + 'C'.repeat(20) + ' ' + 'D'.repeat(20));
  assert.ok(t.length <= 73, `title is ${t.length} chars`);
  assert.match(t, /…$/, 'a cut title must be visibly cut, not silently broken');
});

test('a slug is unique by construction, so it can never clobber a curated lesson', () => {
  // Two videos can share a title; the id makes the slug unique without a retry
  // loop, and /learn/<slug> is an INDEXED url, so a collision would overwrite a
  // hand-written lesson's page.
  const a = lessonSlug('How To Putt', 'aaaaaaaaaaa');
  const b = lessonSlug('How To Putt', 'bbbbbbbbbbb');
  assert.notEqual(a, b);
  assert.ok(a.endsWith('-aaaaaaaaaaa'), a);
  assert.match(a, /^[a-z0-9-]+$/, 'slug must be url-safe');
  assert.doesNotMatch(lessonSlug('Part 1 of 3. ' + 'x'.repeat(200), 'ccccccccccc'), /…/);
});

test('every curated lesson slug stays reachable', async () => {
  // The generated slug always carries an 11-char video id, so it cannot equal
  // any of the 134 curated slugs. Proved against the real list rather than
  // argued, because this is what keeps the indexed pages working.
  const { LESSONS } = await import('../../db/data/lessons');
  const curated = new Set((LESSONS as ReadonlyArray<{ slug: string; title: string }>).map((l) => l.slug));
  for (const l of LESSONS as ReadonlyArray<{ slug: string; title: string }>) {
    assert.ok(!curated.has(lessonSlug(l.title, 'dQw4w9WgXcQ')), `collides with ${l.slug}`);
  }
});

test('the generator never writes a curated lesson', () => {
  // The whole safety argument is that a curated row (generated_from_video NULL)
  // is never written.
  //
  // This used to be enforced as "no UPDATE against training_lessons at all",
  // which was a proxy for the real invariant and did its job until a genuine
  // need for one arrived: rows published before the copy changed kept
  // describing themselves as "Coaching from <channel>", because the insert is
  // ON CONFLICT DO NOTHING and would never revisit them. Rather than loosen
  // the guard, it now checks the condition it was always standing in for --
  // EVERY update must be scoped to rows that are already generated.
  const updates = [...SRC.matchAll(/UPDATE\s+training_lessons[\s\S]*?(?=`\s*,|\n\s*\);)/gi)];
  for (const u of updates) {
    assert.match(u[0], /generated_from_video IS NOT NULL/,
      'an UPDATE against training_lessons is not scoped to generated rows — it can rewrite a curated lesson');
  }
  assert.doesNotMatch(SRC, /DELETE\s+FROM\s+training_lessons/i, 'must never delete a lesson');
  assert.match(SRC, /INSERT INTO training_lessons/);
  assert.match(SRC, /generated_from_video/, 'every inserted row must be marked');
  // Exactly-once is the database's job, not arithmetic: the refresh job runs
  // daily AND on boot, so a restart must not republish.
  assert.match(SRC, /ON CONFLICT \(generated_from_video\)[\s\S]{0,80}DO NOTHING/);
});

test('generated lessons pay the lowest of the three lesson rates', async () => {
  // Nothing here can grade difficulty from a title, and XP buys coupons now, so
  // guessing high would inflate the economy.
  const { LESSONS } = await import('../../db/data/lessons');
  const rates = [...new Set((LESSONS as ReadonlyArray<{ xp_reward: number }>).map((l) => l.xp_reward))];
  assert.equal(GENERATED_XP, Math.min(...rates), `generated pays ${GENERATED_XP}, rates are ${rates}`);
});

test('generated lessons stay OUT of the indexed marketing pages', () => {
  // /learn/<category> is rendered from src/db/data/lessons.ts -- the committed
  // file -- and deliberately not from the database. Two reasons, and both are
  // worth keeping:
  //
  //   * learn.ts argues at length against thin indexed content. A generated
  //     lesson is a title, a channel credit and a video: about 25 words, with
  //     none of the tips and articles a curated lesson carries. Feeding those to
  //     a crawler is the exact failure that file is written to avoid.
  //   * "134 coached lessons" on the promo site stays TRUE of the curated
  //     library. The app grows past it; the marketing claim describes what it
  //     has always described.
  //
  // So the guard is that learn.ts never reads the database.
  const learn = readFileSync(join(__dirname, '../../http/learn.ts'), 'utf8');
  assert.doesNotMatch(learn, /\bfrom '\.\.\/db\/pool'|\bpool\b|\.query\(/,
    'learn.ts must render from the committed library, not the database');
  assert.match(learn, /from '\.\.\/db\/data\/lessons'/);
});
