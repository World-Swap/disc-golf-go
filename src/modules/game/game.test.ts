import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../http/app';
import { createToken } from '../../middleware/auth';
import type { Database } from '../../db/types';
import { periodKey, periodStart, GAME_CHALLENGES } from './game.catalog';
import { VALID_HOLES } from './game.service';

let handler: (sql: string, params?: unknown[]) => { rows: unknown[]; rowCount?: number } = () => ({ rows: [] });
const client = {
  query: async (sql: string, params?: unknown[]) => handler(sql, params) as never,
  release: () => {},
};
const db = {
  query: async (sql: string, params?: unknown[]) => handler(sql, params) as never,
  connect: async () => client as never,
} as unknown as Database;

test('game period maths', async (t) => {
  await t.test('daily key is the UTC date; window starts at midnight UTC', () => {
    const d = new Date('2026-09-25T23:30:00Z');
    assert.equal(periodKey('daily', d), '2026-09-25');
    assert.equal(periodStart('daily', d)!.toISOString(), '2026-09-25T00:00:00.000Z');
  });

  await t.test('weekly window starts Monday', () => {
    const thursday = new Date('2026-09-24T12:00:00Z');   // a Thursday
    const start = periodStart('weekly', thursday)!;
    assert.equal(start.getUTCDay(), 1, 'week starts on a Monday');
    assert.equal(start.toISOString(), '2026-09-21T00:00:00.000Z');
  });

  await t.test('every day of one week shares a week key', () => {
    const keys = new Set<string>();
    for (let d = 21; d <= 27; d++) keys.add(periodKey('weekly', new Date(`2026-09-${d}T12:00:00Z`)));
    assert.equal(keys.size, 1, 'Mon-Sun of the same week is one key');
    // ...and the next Monday rolls over.
    assert.notEqual([...keys][0], periodKey('weekly', new Date('2026-09-28T12:00:00Z')));
  });

  await t.test('monthly and lifetime keys', () => {
    assert.equal(periodKey('monthly', new Date('2026-09-25T00:00:00Z')), '2026-09');
    assert.equal(periodKey('lifetime', new Date()), 'all');
    assert.equal(periodStart('lifetime', new Date()), null, 'lifetime has no window');
  });

  await t.test('the catalog covers all four periods and has unique keys', () => {
    const keys = GAME_CHALLENGES.map((c) => c.key);
    assert.equal(new Set(keys).size, keys.length, 'no duplicate challenge keys');
    for (const p of ['daily', 'weekly', 'monthly', 'lifetime']) {
      assert.ok(GAME_CHALLENGES.some((c) => c.period === p), p + ' has at least one challenge');
    }
  });
});

test('game endpoints', async (t) => {
  const app = createApp(db);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const token = createToken({ id: 42, player_uuid: 'u42' });
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const hole = (par: number, strokes: number) => ({ par, strokes });
  const round = (n: number, strokes = 3) => Array.from({ length: n }, () => hole(3, strokes));

  await t.test('submitting needs auth', async () => {
    const r = await fetch(base + '/api/game/rounds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 401);
  });

  await t.test('only 3, 6, 9 or 18 holes are accepted', async () => {
    for (const n of [1, 4, 12, 27]) {
      const r = await fetch(base + '/api/game/rounds', { method: 'POST', headers: auth, body: JSON.stringify({ holes: round(n) }) });
      assert.equal(r.status, 400, n + ' holes should be rejected');
    }
    assert.deepEqual(VALID_HOLES, [3, 6, 9, 18]);
  });

  await t.test('impossible hole scores are rejected', async () => {
    const cases = [
      [{ par: 3, strokes: 0 }, 'zero throws'],
      [{ par: 3, strokes: 99 }, 'ninety-nine throws'],
      [{ par: 9, strokes: 3 }, 'par 9'],
    ] as const;
    for (const [bad, label] of cases) {
      const holes = [bad, hole(3, 3), hole(3, 3)];
      const r = await fetch(base + '/api/game/rounds', { method: 'POST', headers: auth, body: JSON.stringify({ holes }) });
      assert.equal(r.status, 400, label + ' should be rejected');
    }
  });

  await t.test('a course round must name its course', async () => {
    const r = await fetch(base + '/api/game/rounds', {
      method: 'POST', headers: auth, body: JSON.stringify({ mode: 'course', holes: round(3) }),
    });
    assert.equal(r.status, 400);
  });

  await t.test('a clean round is scored by the server, not the client', async () => {
    const inserted: Record<string, unknown> = {};
    handler = (sql, params) => {
      if (/COUNT\(\*\) AS cnt FROM game_rounds/.test(sql)) return { rows: [{ cnt: '0' }] };       // xp rounds today
      if (/INSERT INTO game_rounds/.test(sql)) {
        inserted.holes = params?.[3]; inserted.par = params?.[4]; inserted.strokes = params?.[5];
        inserted.vsPar = params?.[6]; inserted.birdies = params?.[7]; inserted.aces = params?.[9];
        inserted.xp = params?.[10];
        return { rows: [{ id: 1, created_at: '2026-09-25T00:00:00Z' }] };
      }
      if (/SELECT COUNT\(\*\) AS rounds/.test(sql)) {
        return { rows: [{ rounds: '1', holes: '3', birdies: '1', aces: '1', under_par: '1', courses: '0', best_round: '-2' }] };
      }
      if (/UPDATE players/.test(sql)) return { rows: [{ xp: 100, level: 2, gold: 50 }] };
      if (/INSERT INTO player_game_challenges/.test(sql)) return { rows: [{ id: 1 }], rowCount: 1 };
      if (/FROM player_badges/.test(sql)) return { rows: [] };
      if (/SELECT[\s\S]*under_par[\s\S]*courses[\s\S]*challenges/.test(sql)) return { rows: [{ under_par: '1', courses: '0', challenges: '1' }] };
      return { rows: [{ xp: 100, level: 2, gold: 50 }] };
    };

    // An ace, a birdie and a bogey: 1 + 2 + 4 = 7 against par 9.
    const holes = [hole(3, 1), hole(3, 2), hole(3, 4)];
    const r = await fetch(base + '/api/game/rounds', { method: 'POST', headers: auth, body: JSON.stringify({ holes }) });
    const j = (await r.json()) as { round: { par: number; strokes: number; vs_par?: number }; xp_earned: number };
    assert.equal(r.status, 201);
    assert.equal(inserted.par, 9);
    assert.equal(inserted.strokes, 7);
    assert.equal(inserted.vsPar, -2, 'two under par');
    assert.equal(inserted.birdies, 1, 'the 2 on a par 3');
    assert.equal(inserted.aces, 1, 'the hole in one');
    assert.ok(j.xp_earned > 0, 'XP is awarded');
  });

  await t.test('past the daily cap a round records but pays nothing', async () => {
    handler = (sql) => {
      if (/COUNT\(\*\) AS cnt FROM game_rounds/.test(sql)) return { rows: [{ cnt: '99' }] };   // well past the cap
      if (/INSERT INTO game_rounds/.test(sql)) return { rows: [{ id: 2, created_at: '2026-09-25T00:00:00Z' }] };
      if (/SELECT COUNT\(\*\) AS rounds/.test(sql)) {
        return { rows: [{ rounds: '99', holes: '297', birdies: '0', aces: '0', under_par: '0', courses: '0', best_round: '3' }] };
      }
      if (/FROM player_badges/.test(sql)) return { rows: [] };
      return { rows: [{ under_par: '0', courses: '0', challenges: '0' }] };
    };
    const r = await fetch(base + '/api/game/rounds', { method: 'POST', headers: auth, body: JSON.stringify({ holes: round(3, 4) }) });
    const j = (await r.json()) as { xp_earned: number; xp_capped: boolean };
    assert.equal(j.xp_earned, 0, 'no XP past the cap');
    assert.equal(j.xp_capped, true);
  });

  await t.test('challenges report progress against the round history', async () => {
    handler = (sql) => {
      if (/SELECT COUNT\(\*\) AS rounds/.test(sql)) {
        return { rows: [{ rounds: '2', holes: '6', birdies: '5', aces: '0', under_par: '1', courses: '1', best_round: '-1' }] };
      }
      if (/FROM player_game_challenges/.test(sql)) return { rows: [] };
      return { rows: [] };
    };
    const r = await fetch(base + '/api/game/challenges', { headers: auth });
    const j = (await r.json()) as Record<string, Array<{ key: string; progress: number; target: number; completed: boolean }>>;
    assert.ok(j.daily.length && j.weekly.length && j.monthly.length && j.lifetime.length);
    const birdies = j.daily.find((c) => c.key === 'daily_birdies_3')!;
    assert.equal(birdies.progress, 3, 'progress is capped at the target');
    assert.equal(birdies.completed, true, '5 birdies clears a target of 3');
    const rounds3 = j.daily.find((c) => c.key === 'daily_rounds_3')!;
    assert.equal(rounds3.completed, false, '2 rounds does not clear 3');
  });

  await t.test('the leaderboard is public and ranks by game XP', async () => {
    handler = (sql) => {
      if (/FROM game_rounds g JOIN players/.test(sql)) {
        return { rows: [
          { id: 1, display_name: 'A', game_xp: 300, rounds: 4, best_vs_par: -3, birdies: 9 },
          { id: 2, display_name: 'B', game_xp: 120, rounds: 2, best_vs_par: -1, birdies: 3 },
        ] };
      }
      return { rows: [] };
    };
    const r = await fetch(base + '/api/game/leaderboard?period=weekly');
    const j = (await r.json()) as { period: string; players: Array<{ rank: number; game_xp: number }> };
    assert.equal(r.status, 200, 'no auth required');
    assert.equal(j.period, 'weekly');
    assert.equal(j.players[0]!.rank, 1);
    assert.equal(j.players[0]!.game_xp, 300);
  });

  await t.test('an unknown period falls back to weekly rather than erroring', async () => {
    handler = () => ({ rows: [] });
    const r = await fetch(base + '/api/game/leaderboard?period=fortnightly');
    const j = (await r.json()) as { period: string };
    assert.equal(j.period, 'weekly');
  });

  server.close();
});
