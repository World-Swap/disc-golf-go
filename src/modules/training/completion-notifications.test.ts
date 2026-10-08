// src/modules/training/completion-notifications.test.ts
//
// Notifications written when a lesson is completed.
//
// The bell had nothing to show but the three daily jobs, which only reach
// players who explicitly saved the notification form. These are the in-app
// events that actually happen: a completion, a milestone, a finished
// category, a streak threshold.
//
// The ordering rules below are the whole safety story. completeLesson awards
// XP, gold and milestones inside one transaction, with the milestone and
// category blocks each wrapped in their own savepoint so a failure there
// cannot cost the player their completion. Notifications are the least
// important thing in that transaction and must never be what rolls a reward
// back -- nor may one survive a reward that did roll back.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTrainingRepo } from './training.repo';

const SVC = readFileSync('src/modules/training/training.service.ts', 'utf8');
const REPO = readFileSync('src/modules/training/training.repo.ts', 'utf8');

test('notifications are written inside the transaction, in their own savepoint', () => {
  // Inside, so a notification cannot outlive a rolled-back reward. Its own
  // savepoint, so the reverse cannot happen either.
  const open = SVC.indexOf("SAVEPOINT notify");
  const insert = SVC.indexOf('repo.insertNotifications(');
  const release = SVC.indexOf("RELEASE SAVEPOINT notify");
  const rollback = SVC.indexOf("ROLLBACK TO SAVEPOINT notify");
  for (const [n, i] of [['SAVEPOINT notify', open], ['insertNotifications', insert], ['RELEASE', release], ['ROLLBACK', rollback]] as const) {
    assert.ok(i > 0, `${n} not found — the notify block has been restructured`);
  }
  assert.ok(open < insert && insert < release, 'the insert is not inside SAVEPOINT notify');
  assert.ok(rollback > release, 'no rollback path for a failed notification write');

  // And it must come AFTER the milestone savepoint is released, or a failing
  // notification would take the milestone gold down with it.
  const milestoneRelease = SVC.indexOf("RELEASE SAVEPOINT milestone_check");
  assert.ok(milestoneRelease > 0 && milestoneRelease < open,
    'notifications are written before milestone_check is released');
});

test('a milestone notification fires only when the milestone row was really inserted', () => {
  // insertMilestone is ON CONFLICT DO NOTHING RETURNING, so a row comes back
  // exactly once. Re-counting completions instead would fire again on the
  // next completion at the same total.
  const at = SVC.indexOf('for (const def of MILESTONE_DEFS)');
  const block = SVC.slice(at, SVC.indexOf('categoryCompletionRows', at));
  assert.match(block, /const inserted = await repo\.insertMilestone\(/);

  // Brace-balance the `if (inserted) { ... }` body and require the push to be
  // INSIDE it. Comparing indexes instead only proves the push comes after the
  // word "inserted", which stays true when the push is moved out of the block
  // entirely -- proved by making exactly that change and watching this pass.
  const guard = block.indexOf('if (inserted) {');
  assert.ok(guard > 0, 'the `if (inserted)` guard is gone');
  let depth = 0, end = -1;
  for (let i = block.indexOf('{', guard); i < block.length; i++) {
    if (block[i] === '{') depth++;
    else if (block[i] === '}' && --depth === 0) { end = i; break; }
  }
  assert.ok(end > 0, 'could not balance the `if (inserted)` block');
  assert.ok(block.slice(guard, end).includes('notes.push('),
    'the milestone notification is not inside `if (inserted)`, so it can fire twice');
});

test('every notification is written unread, so the badge counts them all', () => {
  // This guard replaces its own opposite. Completions were first written
  // `read` -- the argument being that a completion is something the player
  // just did in the foreground with "+100 XP · Done ✓" on screen, so five
  // lessons would badge five things already seen. The owner saw that shipped
  // and chose the other way: the bell reflects everything that happened, and
  // the player clears the count themselves.
  //
  // Pinned because the flip is a single word and could be undone by accident
  // while editing the drafts around it.
  const drafts = [...SVC.matchAll(/notes\.push\(\{[\s\S]{0,520}?isRead: (true|false)/g)];
  assert.ok(drafts.length >= 4,
    `expected the completion plus three achievement drafts, found ${drafts.length}`);
  for (const d of drafts) {
    assert.equal(d[1], 'false', `a notification is written pre-read: ${d[0].slice(0, 80)}`);
  }

  // The completion draft specifically, since it is the one that was flipped.
  const at = SVC.indexOf("type: 'lesson_complete'");
  assert.ok(at > 0, 'the lesson_complete draft is gone');
  assert.match(SVC.slice(at, at + 400), /isRead: false/,
    'the lesson completion no longer badges the bell');
});
test('the streak notification fires at thresholds, not every day past three', () => {
  // The streak BONUS is paid every day from day 3 onward. Notifying on each
  // would be a daily "well done" for the same fact.
  assert.match(SVC, /const STREAK_NOTIFY_AT = \[3, 7, 14, 30, 50, 100\]/);
  assert.match(SVC, /STREAK_NOTIFY_AT\.includes\(streakDays\)/,
    'the streak notification is not gated on the threshold list');
});

test('no settings row means achievement alerts are ON', async () => {
  // A row is written only when someone explicitly saves the notification
  // form, so most accounts have none. The column DEFAULTS TO TRUE; reading a
  // missing row as "off" would silently withhold every achievement from
  // almost the whole player base and make the bell look broken.
  const repo = createTrainingRepo({ query: async () => ({ rows: [] }) } as never);
  const noRow = { query: async () => ({ rows: [] }) } as never;
  assert.equal(await repo.achievementAlertsEnabled(noRow, 1), true, 'missing row read as opted out');

  const off = { query: async () => ({ rows: [{ achievement_alerts_enabled: false }] }) } as never;
  assert.equal(await repo.achievementAlertsEnabled(off, 1), false, 'an explicit opt-out is ignored');
});

test('notification text is parameterised, never interpolated into the SQL', () => {
  // Titles carry lesson and category names straight from the database. They
  // go in as bind parameters; only the generated $n placeholders are built by
  // string concatenation.
  const at = REPO.indexOf('async insertNotifications(');
  const fn = REPO.slice(at, REPO.indexOf('\n    },', at));
  assert.ok(at > 0, 'insertNotifications not found');
  assert.match(fn, /vals\.push\(n\.type, n\.title, n\.message, n\.lessonId, n\.isRead\)/,
    'the values are not passed as bind parameters');
  assert.ok(!/\$\{n\.(title|message|type)\}/.test(fn),
    'notification text is interpolated into the SQL string');
  assert.match(fn, /if \(!rows\.length\) return 0/,
    'an empty batch would build "VALUES " and throw');
});
