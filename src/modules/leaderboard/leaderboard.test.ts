import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../http/app';
import { createToken } from '../../middleware/auth';
import type { Database } from '../../db/types';

let handler: (sql: string) => { rows: unknown[] } = () => ({ rows: [] });
const db = { query: async (sql: string) => handler(sql) as never, connect: async () => ({}) as never } as unknown as Database;

test('leaderboard endpoints', async (t) => {
  const app = createApp(db);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const get = (p: string, h: Record<string, string> = {}) => fetch(base + p, { headers: h });

  await t.test('top5: JWT user in list gets is_me (bug fix baked in)', async () => {
    handler = () => ({ rows: [
      { id: 1, display_name: 'A', username: 'a', xp: 900, level: 3 },
      { id: 2, display_name: 'B', username: 'b', xp: 500, level: 2 },
    ]});
    const token = createToken({ id: 2, player_uuid: 'u2' });
    const r = await get('/api/leaderboard/top5', { Authorization: `Bearer ${token}` });
    const j = (await r.json()) as { players: Array<{ id: number; is_me: boolean; skill_tier: string }> };
    assert.equal(j.players.find((p) => p.id === 2)!.is_me, true);
    assert.equal(j.players.find((p) => p.id === 1)!.is_me, false);
    assert.equal(j.players[0]!.skill_tier, 'player'); // xp 900
  });

  await t.test('top5 anon: no is_me, my_rank null', async () => {
    const r = await get('/api/leaderboard/top5');
    const j = (await r.json()) as { players: Array<{ is_me: boolean }>; my_rank: unknown };
    assert.ok(j.players.every((p) => !p.is_me));
    assert.equal(j.my_rank, null);
  });

  await t.test('/leaderboard overall alltime -> ranked, gold tier', async () => {
    handler = (sql) => {
      if (/training_completions/.test(sql)) return { rows: [{ id: 5, display_name: 'X', total_xp: 1000, lessons_completed: 2, current_streak: 1, challenges_won: 0, stat_value: 1000 }] };
      return { rows: [] };
    };
    const r = await get('/api/leaderboard?tab=overall&period=alltime');
    const j = (await r.json()) as { tab: string; players: Array<{ rank: number; rank_tier: string }> };
    assert.equal(j.tab, 'overall');
    assert.equal(j.players[0]!.rank, 1);
    assert.equal(j.players[0]!.rank_tier, 'gold');
  });

  // The all-time XP board used to rank by players.xp -- the grand total across
  // Throw Lab, tournaments, quests, referrals and check-ins -- under a heading
  // that said "earned from completed lessons". In production one player showed
  // 9,920 there against a field whose next row was 295, and locally a player
  // with 12 lessons and no game XP showed 0 while a player with 0 lessons led.
  // These two pin the shape of the query rather than a number, because the
  // regression is a column swap that no row count would catch.
  await t.test('all-time XP is training XP, never the players.xp grand total', async () => {
    let seen = '';
    handler = (sql) => { if (/training_completions/.test(sql)) seen = sql; return { rows: [] }; };
    await get('/api/leaderboard?tab=overall&period=lifetime');
    assert.match(seen, /SUM\(l\.xp_reward\)/, 'all-time XP must be summed from lesson rewards');
    assert.doesNotMatch(seen, /p\.xp AS total_xp/, 'all-time XP must not be the players.xp counter');
    assert.doesNotMatch(seen, /\bp\.xp > 0\b/, 'game-only XP must not put a player on the training board');
  });

  await t.test('periods are calendar boundaries shared with the game board', async () => {
    const params: unknown[][] = [];
    const spy = {
      query: async (sql: string, p?: unknown[]) => { if (p) params.push(p); return handler(sql) as never; },
      connect: async () => ({}) as never,
    } as unknown as Database;
    const app2 = createApp(spy);
    const srv = app2.listen(0);
    await new Promise<void>((r) => srv.once('listening', r));
    const { port: p2 } = srv.address() as AddressInfo;
    handler = () => ({ rows: [] });

    await fetch(`http://127.0.0.1:${p2}/api/leaderboard?tab=overall&period=weekly`);
    const since = params[0]![0] as Date;
    assert.ok(since instanceof Date, 'the period boundary is a bound Date, not an interpolated interval');
    assert.equal(since.getUTCDay(), 1, 'Week runs from Monday, matching the Throw Lab board');
    assert.equal(since.getUTCHours(), 0);

    // A page cached before this deploy still sends the old slugs.
    params.length = 0;
    await fetch(`http://127.0.0.1:${p2}/api/leaderboard?tab=overall&period=week`);
    assert.equal((params[0]![0] as Date).getTime(), since.getTime(), 'old slug week -> weekly');
    await new Promise<void>((r) => srv.close(() => r()));
  });

  await new Promise<void>((r) => server.close(() => r()));
});

// The Videos board read 0 for every player while the API was returning 38, 34,
// 26. ranks.html looked each metric's field up in its own STAT map, and that map
// never got a `videos` entry when the metric was added -- so p[undefined] was
// undefined and the row fell through to 0. Nothing failed; a real board just
// quietly showed nothing. Two guards, because the page and the server each hold
// half of this.
test('the ranks page and the leaderboard agree on the training metrics', async (t) => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const html = fs.readFileSync(path.join(process.cwd(), 'web', 'ranks.html'), 'utf8');

  // The tabs the page offers for the training board, read out of its TABS table.
  // Anchored on `var TABS = {`, not on `training:` alone: the PERIODS table a
  // few lines above has a `training:` key too, and matching that read the four
  // PERIODS back as if they were metrics. Caught by printing the capture
  // instead of trusting that a matching regex matched the right thing.
  const block = /var TABS = \{\s*training:\s*\[([\s\S]*?)\]\s*,\s*\n\s*game:/.exec(html);
  assert.ok(block, 'could not find the training tab list in ranks.html');
  const offered = [...block[1]!.matchAll(/\['([a-z_]+)',/g)].map((m) => m[1]!);

  await t.test('every tab the page offers is one the server serves', () => {
    // Mirrors TABS in leaderboard.service.ts. Kept as a literal rather than
    // imported so that deleting a server tab fails here loudly instead of
    // silently agreeing with itself.
    const served = ['overall', 'lessons', 'streak', 'challenges', 'videos'];
    assert.deepEqual(
      offered.filter((t2) => !served.includes(t2)),
      [],
      'ranks.html offers a training tab the leaderboard API would reject'
    );
    assert.deepEqual(
      served.filter((t2) => !offered.includes(t2)),
      [],
      'the API serves a training tab the page never shows'
    );
  });

  // The actual fix: the row reads the server's sorted value, so a metric the
  // page has no local mapping for still renders its real number.
  await t.test('the row renders the value the server sorted by', () => {
    assert.match(
      html,
      /p\.stat_value != null \? p\.stat_value/,
      'ranks.html should read stat_value, not a per-metric field map'
    );
  });
});
