// src/modules/admin/user-paging.test.ts — the Players list must show everyone.
//
// Reported from the live console: "100 shown of 142 total" with nothing to
// press. The API has always returned page/pages/total and accepted a `page`
// parameter; the console simply never asked for the second page, so 42 real
// accounts were unreachable from the admin tools.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync('web/admin.html', 'utf8');

test('the console asks for every page, not just the first', () => {
  assert.match(page, /page=1/, 'the first request must name its page');
  assert.match(page, /for \(var pg = 2; pg <= pages; pg\+\+\)/,
    'it must loop over the remaining pages');
  assert.match(page, /page=' \+ pg/, 'and request each one');
});

test('the walk is bounded, so a huge table cannot hang the console', () => {
  assert.match(page, /MAX_PAGES\s*=\s*\d+/);
  assert.match(page, /pg > MAX_PAGES/, 'the cap must actually break the loop');
  // And when it bites, the operator is told rather than silently shown a
  // truncated list -- which is exactly the bug being fixed here.
  assert.match(page, /capped/, 'a capped load must be reported');
  assert.match(page, /search to narrow the list/);
});

test('an empty page breaks the loop, so a server quirk cannot spin forever', () => {
  // `pages` comes from the server. If it ever over-reports, the loop must stop
  // on the first empty response rather than issuing MAX_PAGES requests.
  assert.match(page, /if \(!next\.users \|\| !next\.users\.length\) break/);
});

test('filters and the bot sweep run over everything loaded', () => {
  // The reason for loading every page rather than adding Prev/Next: "Delete all
  // shown" and the bot filter operate on what was fetched, so paging would have
  // scoped the sweep to one page while the button still said "all shown".
  assert.match(page, /lastPayload = \{ users: users, total: total, capped: capped \}/,
    'the merged set is what render() and the filters see');
  assert.ok(!/limit=100&search=/.test(page),
    'the old single-page fetch must be gone');
});
