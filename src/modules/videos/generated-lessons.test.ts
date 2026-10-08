// src/modules/videos/generated-lessons.test.ts — a generated row must not
// read as a coached lesson.
//
// WHAT WENT WRONG. The generator publishes a trusted channel's upload, filed
// by what its title names. Nobody watches it, nothing grades it, and no body
// is written for it -- the whole point of the generator is that it refuses to
// invent any of that. But it then described itself as "Coaching from
// <channel>. This lesson is the video itself…", carried a `beginner`
// difficulty badge, sat in the same list as the 134 hand-written lessons,
// counted inside the category's "3 / 17 lessons", and could be handed to a
// player as their next RECOMMENDED lesson.
//
// Once the curated lessons became ~331 words each, a 25-word row claiming the
// same thing stopped being a small inaccuracy.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { descriptionFor, bodyFor } from './lesson-generator';

const GEN_SRC = readFileSync('src/modules/videos/lesson-generator.ts', 'utf8');
const REPO_SRC = readFileSync('src/modules/training/training.repo.ts', 'utf8');
const PAGE = readFileSync('web/training.html', 'utf8');

test('a generated row never calls itself coaching or a lesson', () => {
  const desc = descriptionFor('Latitude 64');
  const low = desc.toLowerCase();
  for (const claim of ['coaching', 'coached', 'this lesson', 'lesson is']) {
    assert.ok(!low.includes(claim), `generated copy claims "${claim}": ${desc}`);
  }
  assert.ok(low.includes('latitude 64'), 'the channel must be credited');
});

test('a generated row states what it is instead of confessing what it is not', () => {
  // This guard replaces its own opposite, and the reversal is the point.
  //
  // The first version of this copy claimed coaching. The correction over-shot
  // into an apology -- a banner plus a paragraph saying nobody here had
  // watched the video and that it had been filed by what its title covers --
  // and a test was written REQUIRING the word "watched", which locked the
  // cheesiness in. Reported by the owner looking at the live page: "why are
  // you blatantly saying we haven't watched the videos".
  //
  // What keeps an upload from reading as a coached lesson is structural (its
  // own block, no XP, no difficulty, no body, `generated` on the row), so the
  // prose does not have to carry it. These words are now forbidden rather
  // than required.
  const desc = descriptionFor('Latitude 64').toLowerCase();
  for (const word of ['watched', 'nobody', 'no notes', 'no drills', 'title']) {
    assert.ok(!desc.includes(word),
      `generated copy apologises with "${word}": ${desc}`);
  }
  // Short enough to sit on one line under the heading.
  assert.ok(descriptionFor('Latitude 64').length <= 60,
    'the generated description has grown back into a paragraph');
});

test('a generated row carries no written body at all', () => {
  // The generator has not watched the video, so the honest amount of prose is
  // none. renderContent() draws no card for a body with no text key, so this
  // is what removes the second copy of the message from the page.
  const b = bodyFor('Latitude 64') as Record<string, unknown>;
  assert.equal(b.generated, true, 'the row must still mark itself generated');
  for (const key of ['body', 'text', 'sections', 'tips', 'points', 'why', 'how', 'drill']) {
    assert.ok(!(key in b), `generated content_body carries prose in "${key}"`);
  }
});

test('the lesson page shows no disclaimer banner and no pro-instruction credit', () => {
  assert.ok(!PAGE.includes('upbanner'),
    'the apology banner is back on the upload page');
  // The video pane credited every lesson as "Pro instruction", so a generated
  // row said "not a coached lesson" and "Pro instruction" in the same view.
  assert.ok(!/vpane__eyebrow">Pro instruction/.test(PAGE),
    'the video pane hardcodes "Pro instruction" again, which an upload is not');
  assert.ok(/eyebrow = gen \? /.test(PAGE),
    'the video pane no longer picks its credit by lesson kind');
});

test('generated rows carry no difficulty grade', () => {
  // 'beginner' is a claim, shown as a badge next to lessons whose difficulty a
  // person actually chose -- and it let an upload win topRecommendedLesson,
  // whose filter is `difficulty IN ('beginner','intermediate')`.
  const m = GEN_SRC.match(/const GENERATED_DIFFICULTY = '([^']+)'/);
  assert.ok(m, 'GENERATED_DIFFICULTY not found');
  assert.ok(!['beginner', 'intermediate', 'advanced'].includes(m![1]),
    `generated rows claim difficulty "${m![1]}"`);
});

test('every query that picks a lesson FOR the player picks a coached one', () => {
  // Offering an upload is fine. RECOMMENDING one is the claim. These are the
  // queries behind "Continue training", "Next lesson →", the recommended
  // lesson, and the Home slideshow that is sold as pro coaching.
  for (const fn of [
    'nextLesson',
    'nextIncompleteInCategory',
    'topRecommendedLesson',
    'advancedLesson',
    'nextIncompleteLesson',
    'featuredVideos',
  ]) {
    const at = REPO_SRC.indexOf(`async ${fn}(`);
    assert.ok(at > 0, `${fn} not found`);
    const body = REPO_SRC.slice(at, REPO_SRC.indexOf('\n    },', at));
    assert.match(body, /generated_from_video IS NULL/,
      `${fn} can hand a player an upload nobody has watched`);
  }
});

test('the category list tells the client which rows are generated', () => {
  // Without this the page cannot separate them, which is how they came to sit
  // in the lesson list in the first place.
  const at = REPO_SRC.indexOf('async lessonsInCategory(');
  const body = REPO_SRC.slice(at, REPO_SRC.indexOf('\n    },', at));
  assert.match(body, /\(l\.generated_from_video IS NOT NULL\) AS is_generated/);
  // Both the filtered and unfiltered branch, or a level filter hides the flag.
  assert.equal((body.match(/AS is_generated/g) || []).length, 2);
});

test('a category counts coached lessons and uploads separately', () => {
  // "3 / 17 lessons" for a category holding 10 coached lessons overstated the
  // library and left every category permanently unfinished, because uploads
  // keep arriving.
  const at = REPO_SRC.indexOf('async categories(');
  const body = REPO_SRC.slice(at, REPO_SRC.indexOf('\n    },', at));
  assert.match(body, /FILTER \(WHERE l\.generated_from_video IS NULL\) AS lesson_count/);
  assert.match(body, /FILTER \(WHERE l\.generated_from_video IS NOT NULL\) AS video_count/);
});

test('completed counts match the denominator they are shown over', () => {
  // completed_count is the numerator over lesson_count. Counting a watched
  // upload against a coached-only denominator can print "12 / 10 lessons".
  const at = REPO_SRC.indexOf('async categoryCompletionCounts(');
  const body = REPO_SRC.slice(at, REPO_SRC.indexOf('\n    },', at));
  assert.match(body, /tl\.generated_from_video IS NULL/);
});

test('the category page keeps uploads out of the lesson list', () => {
  assert.match(PAGE, /var lessons = all\.filter\(function \(l\) \{ return !l\.is_generated; \}\);/);
  assert.match(PAGE, /var uploads = all\.filter\(function \(l\) \{ return l\.is_generated; \}\);/);
  // Its own heading, not a silent reshuffle. The heading is the label; the
  // paragraph under it that used to spell out "they are not coached lessons"
  // is gone on purpose, so this asserts the separation rather than the wording.
  assert.match(PAGE, /From the channels/);
});

test('an upload row shows no XP and no difficulty', () => {
  // Leading with the reward frames an upload as a thing to tick off, and the
  // difficulty is a grade nothing assigned.
  const at = PAGE.indexOf('var ups = uploads.map');
  const fn = PAGE.slice(at, PAGE.indexOf('}).join(\'\');', at));
  assert.ok(at > 0, 'upload row renderer not found');
  assert.ok(!fn.includes('xp_reward'), 'the upload row prints XP');
  assert.ok(!fn.includes('difficulty'), 'the upload row prints a difficulty');
  assert.ok(fn.includes('youtube_channel'), 'the upload row must credit the channel');
});

test('an upload opened directly still reads as an upload', () => {
  // Separating them in the list is no use if the page they lead to is dressed
  // as a lesson -- these are reachable from a share or a search. What says so
  // is the eyebrow and the missing XP, not a paragraph.
  assert.match(PAGE, /var gen = !!l\.generated_from_video;/);
  assert.match(PAGE, /gen \? ' \u00b7 from the channels'/);
  // The XP figure is in the branch a coached lesson takes, never both.
  assert.match(PAGE, /gen \? ' \u00b7 from the channels' : ' \u00b7 \+' \+ \(l\.xp_reward/);
});

test('older generated rows are brought to the current wording', () => {
  // The insert is ON CONFLICT DO NOTHING, so without a relabel pass every row
  // written before today keeps claiming to be coaching forever.
  assert.match(GEN_SRC, /export async function relabelGeneratedLessons/);
  const job = readFileSync('scripts/videos-refresh.js', 'utf8');
  // Both indexes must be FOUND before they are compared. Matching the name
  // alone passed on the import line, and -1 < anything made the ordering
  // assertion pass for a call that had been deleted -- caught by removing the
  // call and watching this test stay green.
  const relabelAt = job.indexOf('await relabelGeneratedLessons(pool)');
  const generateAt = job.indexOf('await generateLessonsFromVideos(pool)');
  assert.ok(relabelAt > 0, 'the relabel is never called in the job');
  assert.ok(generateAt > 0, 'the generator is never called in the job');
  assert.ok(relabelAt < generateAt,
    'relabel must run before generating, so one pass settles everything');
});

test('the generator still refuses to invent anything', () => {
  // The standing rule this whole feature rests on, restated as a guard: no
  // tips, no takeaways, no difficulty judgement from a title.
  assert.ok(!/tips:/.test(GEN_SRC), 'the generator writes tips');
  assert.ok(!/\bdrill\b/i.test(GEN_SRC.replace(/no notes or drills/g, '')),
    'the generator writes a drill');
});
