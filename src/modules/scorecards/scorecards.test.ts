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
      if (/INSERT INTO scorecards/.test(sql)) return { rows: [{ id: 5, course_id: 7, holes: 9, par: params?.[3], strokes: 0, completed: false }] };
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

  server.close();
});
