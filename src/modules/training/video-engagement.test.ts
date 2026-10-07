// src/modules/training/video-engagement.test.ts — watching the video has to count.
//
// Reported from a phone: the video was playing, and the page said "Watch the
// video or open one of the links first." It was right that no signal had
// arrived, and wrong that none should have.
//
// wireEngagement's delegated listener matches `a[href],button`. The video pane
// is a DIV carrying role="button" -- so closest() returned null, the handler
// bailed, and tapping play reported nothing. The listener also tested
// `a.id === 'playvid'`, an element that does not exist anywhere in the page:
// markup renamed, listener not updated, nothing failed loudly.
//
// The gate requires `opened` AND `resource_opened`, so this stranded anyone who
// watched the video instead of opening an article link -- which is the action
// the page puts first and the refusal names first.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync('web/training.html', 'utf8');

test('playing the embedded video reports engagement', () => {
  const start = page.indexOf('function wireVideo(');
  assert.ok(start > -1, 'wireVideo must exist');
  const body = page.slice(start, start + 1400);
  assert.match(body, /engage\(lessonId, 'resource_opened', 'video'\)/,
    'the play action itself must report, not rely on a click listener matching the markup');
  assert.match(body, /function play\(\)[\s\S]{0,200}reported/,
    'and it must report inside play(), where the video actually starts');
});

test('the lesson id reaches wireVideo, or it has nothing to report against', () => {
  assert.match(page, /wireVideo\(id\)/, 'the call site must pass the lesson id');
  assert.ok(!/\bwireVideo\(\)/.test(page), 'the no-argument call must be gone');
});

test('it reports once, however many times the pane is tapped', () => {
  // Re-tapping a playing video must not spray duplicate signals at the server.
  const start = page.indexOf('function wireVideo(');
  const body = page.slice(start, start + 1400);
  assert.match(body, /var reported = false/);
  assert.match(body, /if \(!reported\) \{ reported = true;/);
});

test('the dead #playvid check is gone', () => {
  // It matched nothing, so it read as coverage that did not exist. The href test
  // stays: it covers the fallback card rendered when a URL has no embeddable id.
  assert.ok(!/a\.id === 'playvid'/.test(page), 'the dead id check must be removed');
  assert.match(page, /isVideo = \/youtube\\\.com\|youtu\\\.be\/\.test\(href\)/,
    'the fallback <a> out to YouTube must still count');
});

test('the gate still wants both signals, so this fix does not weaken it', async () => {
  const gate = readFileSync('src/modules/training/engagement.ts', 'utf8');
  assert.match(gate, /MIN_DWELL_SECONDS = 45/);
  assert.match(gate, /MAX_COMPLETIONS_PER_HOUR = 20/);
  // Reporting the video does not skip the clock -- the server keeps that.
  assert.ok(!/resource_opened[\s\S]{0,200}skip/i.test(gate));
});
