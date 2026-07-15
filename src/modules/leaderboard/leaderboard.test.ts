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
      if (/FROM leaderboard_entries/.test(sql)) return { rows: [{ id: 5, display_name: 'X', total_xp: 1000, lessons_completed: 2, current_streak: 1, challenges_won: 0, stat_value: 1000 }] };
      return { rows: [] };
    };
    const r = await get('/api/leaderboard?tab=overall&period=alltime');
    const j = (await r.json()) as { tab: string; players: Array<{ rank: number; rank_tier: string }> };
    assert.equal(j.tab, 'overall');
    assert.equal(j.players[0]!.rank, 1);
    assert.equal(j.players[0]!.rank_tier, 'gold');
  });

  await t.test('/leaderboard/crews/training', async () => {
    handler = (sql) => {
      if (/FROM crews/.test(sql)) return { rows: [{ id: 1, name: 'Crew', logo_url: null, member_count: 3, training_xp: 500, lessons_completed: 10 }] };
      return { rows: [] };
    };
    const r = await get('/api/leaderboard/crews/training');
    const j = (await r.json()) as { crews: Array<{ rank: number; training_xp: number }> };
    assert.equal(j.crews[0]!.rank, 1);
    assert.equal(j.crews[0]!.training_xp, 500);
  });

  await new Promise<void>((r) => server.close(() => r()));
});
