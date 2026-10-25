import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../http/app';
import { createToken } from '../../middleware/auth';
import type { Database } from '../../db/types';

let handler: (sql: string, params?: unknown[]) => { rows: unknown[]; rowCount?: number } = () => ({ rows: [] });
const db = {
  query: async (sql: string, params?: unknown[]) => handler(sql, params) as never,
  connect: async () => ({}) as never,
} as unknown as Database;

test('scorecards endpoints', async (t) => {
  const app = createApp(db);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const token = createToken({ id: 42, player_uuid: 'u42' });
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  await t.test('auth is required', async () => {
    const r = await fetch(base + '/api/scorecards');
    assert.equal(r.status, 401);
  });

  await t.test('start: unknown course -> 404', async () => {
    handler = () => ({ rows: [] });
    const r = await fetch(base + '/api/scorecards', {
      method: 'POST', headers: auth, body: JSON.stringify({ course_id: 9, holes: 9 }),
    });
    assert.equal(r.status, 404);
  });

  await t.test('start: rejects a silly hole count', async () => {
    const r = await fetch(base + '/api/scorecards', {
      method: 'POST', headers: auth, body: JSON.stringify({ course_id: 7, holes: 99 }),
    });
    assert.equal(r.status, 400);
  });

  await t.test('start: defaults every hole to par 3 and sums the card par', async () => {
    let insertedPars: unknown[] = [];
    handler = (sql, params) => {
      if (/SELECT id FROM courses/.test(sql)) return { rows: [{ id: 7 }] };
      // (player_id, course_id, course_name, holes, par) -- course_name was added
      // when the card stopped requiring a course, so par is params[4].
      if (/INSERT INTO scorecards/.test(sql)) return { rows: [{ id: 5, course_id: 7, holes: 9, par: params?.[4], strokes: 0, completed: false }] };
      if (/INSERT INTO scorecard_holes/.test(sql)) { insertedPars = params?.[2] as unknown[]; return { rows: [] }; }
      if (/SELECT hole_number, par, strokes/.test(sql)) return { rows: [] };
      return { rows: [] };
    };
    const r = await fetch(base + '/api/scorecards', {
      method: 'POST', headers: auth, body: JSON.stringify({ course_id: 7, holes: 9 }),
    });
    const j = (await r.json()) as { par: number };
    assert.equal(r.status, 201);
    assert.equal(j.par, 27);                       // 9 holes x par 3
    assert.equal(insertedPars.length, 9);
  });

  await t.test('start: per-hole pars must match the hole count', async () => {
    handler = (sql) => (/SELECT id FROM courses/.test(sql) ? { rows: [{ id: 7 }] } : { rows: [] });
    const r = await fetch(base + '/api/scorecards', {
      method: 'POST', headers: auth, body: JSON.stringify({ course_id: 7, holes: 3, pars: [3, 4] }),
    });
    assert.equal(r.status, 400);
  });

  await t.test('score a hole: out-of-range strokes rejected, valid accepted', async () => {
    handler = (sql) => {
      if (/FROM scorecards s LEFT JOIN courses/.test(sql)) return { rows: [{ id: 5, course_id: 7, holes: 9, par: 27, strokes: 0, completed: false }] };
      if (/UPDATE scorecard_holes SET strokes/.test(sql)) return { rows: [] };
      if (/UPDATE scorecards SET strokes/.test(sql)) return { rows: [{ strokes: '4' }] };
      return { rows: [] };
    };
    let r = await fetch(base + '/api/scorecards/5/holes', {
      method: 'POST', headers: auth, body: JSON.stringify({ hole_number: 1, strokes: 44 }),
    });
    assert.equal(r.status, 400);

    r = await fetch(base + '/api/scorecards/5/holes', {
      method: 'POST', headers: auth, body: JSON.stringify({ hole_number: 1, strokes: 4 }),
    });
    const j = (await r.json()) as { strokes: number; total_strokes: number };
    assert.equal(r.status, 200);
    assert.equal(j.strokes, 4);
    assert.equal(j.total_strokes, 4);
  });

  await t.test('score a hole that is not on the card -> 400', async () => {
    const r = await fetch(base + '/api/scorecards/5/holes', {
      method: 'POST', headers: auth, body: JSON.stringify({ hole_number: 30, strokes: 3 }),
    });
    assert.equal(r.status, 400);
  });

  await t.test("another player's card is invisible -> 404", async () => {
    handler = () => ({ rows: [] });
    const r = await fetch(base + '/api/scorecards/999', { headers: auth });
    assert.equal(r.status, 404);
  });

  await t.test('finish: par counts only the holes actually played', async () => {
    handler = (sql) => {
      if (/FROM scorecards s LEFT JOIN courses/.test(sql)) return { rows: [{ id: 5, course_id: 7, holes: 18, par: 54, strokes: 24, completed: false }] };
      if (/SELECT hole_number, par, strokes/.test(sql)) {
        return { rows: Array.from({ length: 18 }, (_, i) => ({ hole_number: i + 1, par: 3, strokes: i < 7 ? 4 : null })) };
      }
      if (/UPDATE scorecards SET completed/.test(sql)) return { rows: [{ id: 5, course_id: 7, holes: 18, par: 54, strokes: 28, completed: true }] };
      return { rows: [] };
    };
    const r = await fetch(base + '/api/scorecards/5/finish', { method: 'POST', headers: auth });
    const j = (await r.json()) as { holes_played: number; par_played: number; vs_par: number };
    assert.equal(j.holes_played, 7);
    assert.equal(j.par_played, 21);      // 7 holes x par 3, not the full 54
    assert.equal(j.vs_par, 7);           // 28 strokes over 21 par
  });

  await t.test('finish with nothing scored -> 400', async () => {
    handler = (sql) => {
      if (/FROM scorecards s LEFT JOIN courses/.test(sql)) return { rows: [{ id: 6, course_id: 7, holes: 9, par: 27, strokes: 0, completed: false }] };
      if (/SELECT hole_number, par, strokes/.test(sql)) return { rows: [{ hole_number: 1, par: 3, strokes: null }] };
      return { rows: [] };
    };
    const r = await fetch(base + '/api/scorecards/6/finish', { method: 'POST', headers: auth });
    assert.equal(r.status, 400);
  });

  await t.test('best at a course reports strokes against the par played', async () => {
    handler = (sql) => {
      if (/FROM scorecards s\s+WHERE s.player_id/.test(sql)) {
        return { rows: [{ strokes: 55, par: 54, par_played: 54, holes_played: 18, completed_at: '2026-01-01' }] };
      }
      return { rows: [] };
    };
    const r = await fetch(base + '/api/scorecards/best/7', { headers: auth });
    const j = (await r.json()) as { vs_par: number };
    assert.equal(j.vs_par, 1);
  });

  await t.test('a 3-hole round is judged against 3 holes of par, not the card', async () => {
    handler = (sql) => {
      if (/FROM scorecards s\s+WHERE s.player_id/.test(sql)) {
        // 9-hole card (par 27) but only 3 holes played, at par.
        return { rows: [{ strokes: 9, par: 27, par_played: 9, holes_played: 3, completed_at: '2026-01-02' }] };
      }
      return { rows: [] };
    };
    const r = await fetch(base + '/api/scorecards/best/7', { headers: auth });
    const j = (await r.json()) as { vs_par: number };
    assert.equal(j.vs_par, 0, 'even par, not 18 under');
  });

  // A card started and never scored is the one state the player cannot score
  // their way out of: finishing is refused, so deleting is the only exit. It
  // shipped with the route in place and nothing calling it.
  await t.test('an unscored card cannot be finished', async () => {
    handler = (sql) => {
      if (/FROM scorecards s LEFT JOIN courses/.test(sql)) {
        return { rows: [{ id: 5, player_id: 42, holes: 9, par: 27, strokes: 0, completed: false }] };
      }
      if (/FROM scorecard_holes/.test(sql)) {
        // Every hole present, none played -- exactly what start() writes.
        return { rows: Array.from({ length: 9 }, (_, i) => ({ hole_number: i + 1, par: 3, strokes: null })) };
      }
      return { rows: [] };
    };
    const r = await fetch(base + '/api/scorecards/5/finish', { method: 'POST', headers: auth });
    assert.equal(r.status, 400);
    assert.match(((await r.json()) as { error: string }).error, /at least one hole/i);
  });

  await t.test('discarding one deletes it, and only for its owner', async () => {
    let sawParams: unknown[] = [];
    handler = (sql, params) => {
      if (/DELETE FROM scorecards/.test(sql)) {
        sawParams = params ?? [];
        return { rows: [{ id: 5 }], rowCount: 1 };
      }
      return { rows: [] };
    };
    const r = await fetch(base + '/api/scorecards/5', { method: 'DELETE', headers: auth });
    assert.equal(r.status, 200);
    assert.deepEqual((await r.json()) as unknown, { success: true });
    // The player id is part of the WHERE, so one player cannot delete another's.
    assert.deepEqual(sawParams, [5, 42]);
  });

  await t.test('discarding a card that is not yours -> 404', async () => {
    handler = () => ({ rows: [], rowCount: 0 });
    const r = await fetch(base + '/api/scorecards/5', { method: 'DELETE', headers: auth });
    assert.equal(r.status, 404);
  });

  server.close();
});

// ── The blank card ────────────────────────────────────────────────────────
// The pivot made a course OPTIONAL. These pin the three things that would
// otherwise regress quietly: that a card can exist with no course at all,
// that a course id which IS given is still checked, and that par stays
// editable while the round is open.

import { readFileSync as _readFileSync } from 'node:fs';
const SC_SERVICE = _readFileSync('src/modules/scorecards/scorecards.service.ts', 'utf8');
const SC_SCHEMA = _readFileSync('src/db/schema.ts', 'utf8');
const SC_PAGE = _readFileSync('web/scorecard.html', 'utf8');

test('a scorecard no longer requires a course', () => {
  // The column has to be nullable or the blank card cannot be written at all.
  assert.match(
    SC_SCHEMA,
    /ALTER TABLE scorecards ALTER COLUMN course_id DROP NOT NULL/,
    'course_id is still NOT NULL, so a blank card cannot be saved'
  );
  assert.match(
    SC_SCHEMA,
    /ALTER TABLE scorecards ADD COLUMN IF NOT EXISTS course_name TEXT/,
    'there is nowhere to keep the name of a course we have no row for'
  );
  // And the service must not demand one back.
  assert.ok(
    !/if \(!\(await repo\.courseExists\(input\.courseId\)\)\)/.test(SC_SERVICE),
    'start() went back to requiring a course id'
  );
});

test('a course id that IS given is still verified', () => {
  // Optional must not mean unchecked: a caller naming a specific course and
  // getting a blank card instead has filed the round against nothing.
  assert.match(SC_SERVICE, /courseExists\(id\)/, 'a supplied course id is no longer checked');
  assert.match(SC_SERVICE, /notFound\('Course not found'\)/, 'an unknown course id is silently accepted');
});

test('every hole starts at par 3 and par stays editable while playing', () => {
  assert.match(
    SC_SERVICE,
    /Array\.from\(\{ length: holes \}, \(\) => 3\)/,
    'holes no longer default to par 3'
  );
  assert.match(SC_SERVICE, /async setPar\(/, 'par cannot be changed once the card exists');
  assert.match(SC_SERVICE, /value < 2 \|\| value > 6/, 'par is no longer range-checked');
  assert.match(SC_SERVICE, /already finished/, 'par can be edited on a finished round');
});

test("the card's par is re-summed from its holes, never adjusted by a delta", () => {
  // A delta drifts the moment anything else writes a par; the holes are the
  // truth, so the total is recomputed from them.
  const repo = _readFileSync('src/modules/scorecards/scorecards.repo.ts', 'utf8');
  assert.match(
    repo,
    /SET par =\s*\n?\s*\(SELECT COALESCE\(SUM\(h\.par\), 0\) FROM scorecard_holes/,
    'the card par is no longer recomputed from the holes'
  );
});

test('the blank card page carries the logo and asks for nothing it does not need', () => {
  assert.match(SC_PAGE, /sc-blank/, 'the blank masthead is gone');
  assert.match(SC_PAGE, /img\/logo-mark\.png/, 'the logo is gone from the blank card');
  // The course name must be optional on the page too, or the page re-imposes
  // what the server stopped requiring.
  assert.match(SC_PAGE, /placeholder="Course name \(optional\)"/, 'the course name became mandatory again');
  // And the hole count must accept a number the buttons do not offer.
  assert.match(SC_PAGE, /id="custom"/, 'a custom hole count is no longer offered');
});
