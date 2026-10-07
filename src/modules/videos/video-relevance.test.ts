// src/modules/videos/video-relevance.test.ts — is each lesson's video actually
// about that lesson's subject?
//
// WHY THIS EXISTS AND WHY audit-lessons.js WAS NOT ENOUGH.
// That script already checks a video plays, that its title is the one YouTube
// serves, that its channel publishes disc golf, and it scores `topicFit` --
// how many of the lesson's words appear in the video's title. All four passed
// a lesson called "Know Your Lines -- See the shot before you throw it" whose
// video was "Find Your Line for Linear Pull-Throughs", a FORM drill about the
// pull-through being linear rather than rounded. topicFit scored it 0.50
// against a 0.2 threshold, on the word "line" alone.
//
// That is the structural limit of word overlap: it cannot tell that two uses
// of the same word mean different things. The classifier can, because it reads
// the title for phrases that NAME a discipline -- and "pull-through" and
// "drill" name different ones from "see the shot before you throw it".
//
// This runs offline against the stored titles, so unlike the audit script it
// runs on every commit rather than when somebody remembers.
//
// IT IS A FLAG, NOT A VERDICT. Plenty of correct videos legitimately sit
// across two categories: a lesson on performance anxiety whose video is
// "Conquering Putting Nerves and Anxiety" is exactly right. Those are recorded
// below WITH A REASON, so a new mismatch stands out instead of drowning in
// known-good noise.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS } from '../../db/data/lessons';
import { classifyVideo } from './classify';

/**
 * Cross-category pairs that have been looked at and are correct. The key is
 * the lesson slug; the value is why the disagreement is fine. Adding an entry
 * is a decision somebody made, which is the point -- an empty reason is not
 * a review.
 */
const REVIEWED_CROSS_CATEGORY: Record<string, string> = {
  'throwing-tight-fairways':
    'Lesson is control in the woods; video is "Control Drivers: Mastering Fairway Techniques". Same subject, classifier reads "driver" as driving.',
  'tournament-course-management':
    'Lesson is course management in a tournament; video is "Tournament Advice for Disc Golfers". Correct video, sits across both categories by nature.',
  'dealing-with-performance-anxiety':
    'Lesson is nerves; video is "Conquering Putting Nerves and Anxiety". Nerves are most acute putting, so this is the right video.',
  'focus-when-partner-struggling':
    'Lesson is keeping your head in a group; video is Stokely on a difficult card-mate during a tournament. Deliberately chosen in the 2026-09-29 audit.',
  'official-vs-casual-play':
    'Lesson is when full rules apply; video is "Top 5 PDGA rules before your first tournament". Rules content, tournament framing.',
  'drop-zone-rules':
    'Lesson is drop zones; video is "Rules School: The Putting Area", which is where drop-zone and circle rules live.',
  'run-vs-lay-up':
    'Lesson is the run-or-lay-up decision; video is "Putting Strategy: When To Lay Up or Go For It". Same decision, putting framing.',
  'pressure-practice':
    'Lesson is practising under pressure; video is putting practice games. Putting is where pressure practice is done.',
};

interface Mismatch {
  slug: string;
  category: string;
  lesson: string;
  video: string;
  reads: string;
  score: number;
  matched: string[];
}

function findMismatches(): Mismatch[] {
  const out: Mismatch[] = [];
  for (const l of LESSONS) {
    if (!l.youtube_title) continue;
    const v = classifyVideo(l.youtube_title);
    if (!v) continue; // the classifier refuses rather than guesses
    // What does the lesson itself say it is about? Its own title and
    // description are the nearest thing to a statement of subject, and they
    // are a better comparison than the category -- a putting-form lesson
    // filed under Form & Technique SHOULD cite a putting video.
    const self = classifyVideo(`${l.title} ${l.description}`);
    if (v.categorySlug === l.category_slug) continue;
    if (self && v.categorySlug === self.categorySlug) continue;
    out.push({
      slug: l.slug,
      category: l.category_slug,
      lesson: `${l.title} — ${l.description}`,
      video: l.youtube_title,
      reads: v.categorySlug,
      score: v.score,
      matched: v.matched,
    });
  }
  return out;
}

test('no lesson cites a video about a different discipline', () => {
  const unreviewed = findMismatches().filter((m) => !REVIEWED_CROSS_CATEGORY[m.slug]);
  const detail = unreviewed
    .map((m) => `\n  ${m.slug} [${m.category}]\n    lesson: ${m.lesson}\n    video : ${m.video}\n    reads as ${m.reads} (${m.score}) via ${m.matched.join(', ')}`)
    .join('');
  assert.deepEqual(
    unreviewed.map((m) => m.slug),
    [],
    `video may be about a different subject than its lesson. Either fix the video, `
      + `or add the slug to REVIEWED_CROSS_CATEGORY with a reason:${detail}`
  );
});

test('every reviewed exception still refers to a real lesson', () => {
  // An exception left behind after its lesson or video changed is a guard that
  // has quietly stopped guarding.
  const slugs = new Set(LESSONS.map((l) => l.slug));
  for (const slug of Object.keys(REVIEWED_CROSS_CATEGORY)) {
    assert.ok(slugs.has(slug), `REVIEWED_CROSS_CATEGORY has no such lesson: ${slug}`);
  }
});

test('every reviewed exception is still actually a mismatch', () => {
  // The other direction: once a video is swapped, its exception should go, or
  // the list grows into a collection of stale claims nobody rechecks.
  const live = new Set(findMismatches().map((m) => m.slug));
  for (const slug of Object.keys(REVIEWED_CROSS_CATEGORY)) {
    assert.ok(live.has(slug), `${slug} no longer mismatches — remove it from REVIEWED_CROSS_CATEGORY`);
  }
});

test('every reviewed exception carries a real reason', () => {
  for (const [slug, reason] of Object.entries(REVIEWED_CROSS_CATEGORY)) {
    assert.ok(reason.trim().length > 40, `${slug}: reason is too short to be a review`);
  }
});

test('the pull-through video is no longer the Know Your Lines primary', () => {
  // The case this whole file was written for. "Line" meaning the flight path
  // you pick on a hole, and "line" meaning a linear pull-through, are not the
  // same subject, and word overlap scored the pun 0.50.
  const l = LESSONS.find((x) => x.slug === 'know-your-lines')!;
  assert.ok(l.youtube_title, 'know-your-lines lost its video');
  assert.ok(
    !/pull.?through/i.test(l.youtube_title!),
    'know-your-lines is citing a pull-through form drill again'
  );
});
