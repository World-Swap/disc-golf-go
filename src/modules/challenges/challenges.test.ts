import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../http/app';
import { createToken } from '../../middleware/auth';
import type { Database } from '../../db/types';

let handler: (sql: string) => { rows: unknown[] } = () => ({ rows: [] });
const db = {
  query: async (sql: string) => handler(sql) as never,
  connect: async () => ({ query: async (sql: string) => handler(sql), release() {} }) as never,
} as unknown as Database;

test('challenges endpoints', async (t) => {
  const app = createApp(db);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const token = createToken({ id: 42, player_uuid: 'u42' });
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  await t.test('GET /challenges/board: groups by cadence + computes progress', async () => {
    handler = (sqlRaw) => {
      const s = sqlRaw.replace(/\s+/g, ' ');
      if (/COUNT\(\*\) as cnt FROM active_challenge_slots/.test(s)) return { rows: [{ cnt: '3' }] }; // slots already exist
      if (/acs.id as slot_id/.test(s)) return { rows: [{ slot_id: 1, cadence: 'daily', period_start: new Date(), period_end: new Date(Date.now() + 86400000), challenge_id: 9, slug: 'daily_c', title: 'Check In', difficulty: 'easy', challenge_type: 'daily_checkins', target_value: 3, xp_reward: 150 }] };
      if (/COUNT\(DISTINCT course_id\) AS cnt FROM checkins/.test(s)) return { rows: [{ cnt: '2' }] }; // rotating progress
      if (/INSERT INTO player_challenge_slots/.test(s)) return { rows: [] };
      if (/ch.cadence = 'permanent'/.test(s)) return { rows: [{ id: 20, slug: 'perm', title: 'Regular', difficulty: 'easy' }] };
      return { rows: [] };
    };
    const r = await fetch(base + '/api/challenges/board', { headers: auth });
    const j = (await r.json()) as { daily: Array<{ progress: number; completed: boolean }>; permanent: unknown[] };
    assert.equal(r.status, 200);
    assert.equal(j.daily[0]!.progress, 2);
    assert.equal(j.daily[0]!.completed, false); // 2 < 3
    assert.equal(j.permanent.length, 1);
  });

  await t.test('POST claim: not completed -> 400', async () => {
    handler = (sqlRaw) => {
      const s = sqlRaw.replace(/\s+/g, ' ');
      if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(s.trim())) return { rows: [] };
      if (/FROM active_challenge_slots acs JOIN challenges/.test(s)) return { rows: [{ id: 1, difficulty: 'easy', slug: 'c', xp_reward: 150, challenge_type: 'daily_checkins', target_value: 3, cadence: 'daily' }] };
      if (/FROM player_challenge_slots WHERE player_id/.test(s)) return { rows: [{ completed: false, claimed: false }] };
      return { rows: [] };
    };
    const r = await fetch(base + '/api/challenges/slots/1/claim', { method: 'POST', headers: auth });
    const j = (await r.json()) as { error: string };
    assert.equal(r.status, 400);
    assert.match(j.error, /not completed/i);
  });

  await t.test('GET /challenges/leaderboard (public)', async () => {
    handler = () => ({ rows: [{ id: 1, display_name: 'A', level: 3, xp: 900, challenges_completed: 12 }] });
    const r = await fetch(base + '/api/challenges/leaderboard');
    const j = (await r.json()) as { leaderboard: Array<{ challenges_completed: number }> };
    assert.equal(r.status, 200);
    assert.equal(j.leaderboard[0]!.challenges_completed, 12);
  });

  await t.test('unauth board -> 401', async () => {
    const r = await fetch(base + '/api/challenges/board');
    assert.equal(r.status, 401);
  });

  await new Promise<void>((r) => server.close(() => r()));
});
