import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../http/app';
import { createToken } from '../../middleware/auth';
import type { Database } from '../../db/types';

const YESTERDAY = new Date(Date.now() - 86_400_000);

// One SQL router shared by pool reads and transaction-client queries.
function handler(sqlRaw: string): { rows: unknown[] } {
  const s = sqlRaw.replace(/\s+/g, ' ').trim();
  if (/^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)/i.test(s)) return { rows: [] };

  // getMe: full player row — yesterday + streak 2 => today streak 3 (a milestone)
  if (/login_streak, best_streak/.test(s) && /FROM players WHERE id = \$1/.test(s)) {
    return { rows: [{ id: 42, player_uuid: 'u42', display_name: 'Bob', username: 'bob', email: 'b@x.com', profile_photo_url: null, xp: 500, level: 2, login_streak: 2, best_streak: 2, battle_wins: 0, battle_losses: 0, win_streak: 0, total_rounds: 0, total_birdies: 0, total_aces: 0, gold: 0, last_login_date: YESTERDAY, created_at: new Date() }] };
  }
  // login-streak transaction writes
  if (/UPDATE players SET last_login_date/.test(s)) return { rows: [] };
  if (/boost_type = 'boost_xp'/.test(s)) return { rows: [] };
  if (/INSERT INTO xp_transactions/.test(s)) return { rows: [] };
  if (/UPDATE players SET xp = xp/.test(s)) return { rows: [{ xp: 525 }] };
  if (/UPDATE players SET level/.test(s)) return { rows: [] };
  if (/SELECT category, tier FROM player_badges/.test(s)) return { rows: [] };
  if (/INSERT INTO player_badges/.test(s)) return { rows: [] };
  if (/boost_type = 'boost_gold'/.test(s)) return { rows: [] };
  if (/INSERT INTO gold_transactions/.test(s)) return { rows: [] };
  if (/UPDATE players SET gold/.test(s)) return { rows: [{ gold: 20 }] };

  // getMe aggregates
  if (/COUNT\(\*\) AS total_checkins/.test(s)) return { rows: [{ total_checkins: '4', unique_courses: '2' }] };
  if (/COUNT\(\*\) AS cnt FROM player_badges/.test(s)) return { rows: [{ cnt: '1' }] };
  if (/ORDER BY ci.checked_in_at DESC LIMIT/.test(s)) return { rows: [] };
  if (/COUNT\(DISTINCT lesson_id\) AS n FROM training_completions/.test(s)) return { rows: [{ n: '7' }] };
  if (/AS n FROM training_lessons WHERE is_active/.test(s)) return { rows: [{ n: '72' }] };
  if (/streak_days FROM training_streaks/.test(s)) return { rows: [{ streak_days: 2 }] };
  if (/HAVING COUNT\(DISTINCT l.id\)/.test(s)) return { rows: [{ n: '1' }] };

  // badges
  if (/SELECT category, tier, earned_at FROM player_badges/.test(s)) return { rows: [{ category: 'explorer', tier: 'bronze', earned_at: new Date() }] };
  // progress
  if (/LEFT JOIN checkins ci/.test(s)) return { rows: [{ state: 'TX', country: 'US', total: '10', visited: '4' }] };
  if (/category IN \('explorer'/.test(s)) return { rows: [] };
  // profile update
  if (/UPDATE players SET display_name = \$1 WHERE id/.test(s)) return { rows: [{ id: 42, display_name: 'New Name', username: 'bob', email: 'b@x.com', profile_photo_url: null, xp: 500 }] };
  // reset counts
  if (/SELECT COUNT\(\*\) FROM \w+ WHERE player_id/.test(s)) return { rows: [{ count: '0' }] };

  return { rows: [] };
}

const db = {
  query: async (sql: string) => handler(sql) as never,
  connect: async () => ({ query: async (sql: string) => handler(sql), release() {} }) as never,
} as unknown as Database;

test('players endpoints', async (t) => {
  const app = createApp(db);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const token = createToken({ id: 42, player_uuid: 'u42' });
  const auth = { Authorization: `Bearer ${token}` };
  const get = (p: string) => fetch(base + p, { headers: auth });

  await t.test('GET /players/me: login streak -> milestone XP + level/tier', async () => {
    const r = await get('/api/players/me');
    const j = (await r.json()) as { login_streak: number; best_streak: number; login_xp: { streak: number; amount: number } | null; level: number; skill_tier: { key: string }; stats: { total_checkins: number }; training_stats: { lessons_completed: number } };
    assert.equal(r.status, 200);
    assert.equal(j.login_streak, 3);
    assert.equal(j.best_streak, 3);
    assert.equal(j.login_xp?.streak, 3);
    assert.equal(j.login_xp?.amount, 25); // login_streak_3
    assert.equal(j.level, 2); // xp now 525 (L2 = 250, L3 = 750)
    assert.equal(j.skill_tier.key, 'player');
    assert.equal(j.stats.total_checkins, 4);
    assert.equal(j.training_stats.lessons_completed, 7);
  });

  await t.test('GET /players/badges: earned flag reflected', async () => {
    const r = await get('/api/players/badges');
    const j = (await r.json()) as { categories: Array<{ category: string; tiers: Array<{ tier: string; earned: boolean }> }> };
    const explorer = j.categories.find((c) => c.category === 'explorer')!;
    assert.equal(explorer.tiers.find((tt) => tt.tier === 'bronze')!.earned, true);
    assert.equal(explorer.tiers.find((tt) => tt.tier === 'gold')!.earned, false);
  });

  await t.test('GET /players/progress: states + totals', async () => {
    const r = await get('/api/players/progress');
    const j = (await r.json()) as { states: Array<{ state: string; pct: number }>; totals: { visited: number; total: number; pct: number } };
    assert.equal(j.states[0]!.state, 'TX');
    assert.equal(j.states[0]!.pct, 40);
    assert.equal(j.totals.visited, 4);
    assert.equal(j.totals.pct, 40);
  });

  await t.test('PUT /players/me: validation + update', async () => {
    let r = await fetch(base + '/api/players/me', { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    assert.equal(r.status, 400); // no fields

    r = await fetch(base + '/api/players/me', { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ display_name: 'New Name' }) });
    const j = (await r.json()) as { display_name: string; level: number };
    assert.equal(r.status, 200);
    assert.equal(j.display_name, 'New Name');
  });

  await t.test('POST /players/reset-progress: verification all zero', async () => {
    const r = await fetch(base + '/api/players/reset-progress', { method: 'POST', headers: auth });
    const j = (await r.json()) as { success: boolean; verification: Record<string, unknown> };
    assert.equal(r.status, 200);
    assert.equal(j.success, true);
    assert.equal(j.verification.xp_transactions, 0);
  });

  await t.test('unauth -> 401', async () => {
    const r = await fetch(base + '/api/players/me');
    assert.equal(r.status, 401);
  });

  await new Promise<void>((r) => server.close(() => r()));
});
