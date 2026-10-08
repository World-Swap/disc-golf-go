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
  const texts = [descriptionFor('Latitude 64'), bodyFor('Latitude 64').body];
  for (const t of texts) {
    const low = t.toLowerCase();
    for (const claim of ['coaching', 'coached', 'this lesson', 'lesson is']) {
      assert.ok(!low.includes(claim), `generated copy claims "${claim}": ${t}`);
    }
  }
});

test('the generated body says plainly that nobody watched it', () => {
  // The honest fact is the one most worth printing, and it is what stops the
  // row being mistaken for the written library beside it.
  const body = bodyFor('Latitude 64').body.toLowerCase();
  assert.ok(body.includes('watched'), 'the body must say nobody has watched it');
  assert.ok(body.includes('latitude 64'), 'the channel must be credited');
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
  // Its own heading and an explanation, not a silent reshuffle.
  assert.match(PAGE, /From the channels/);
  assert.match(PAGE, /not coached lessons/);
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

test('an upload opened directly still says what it is', () => {
  // Separating them in the list is no use if the page they lead to is dressed
  // as a lesson -- these are reachable from a share or a search.
  assert.match(PAGE, /var gen = !!l\.generated_from_video;/);
  assert.match(PAGE, /A channel upload, not a coached lesson/);
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
