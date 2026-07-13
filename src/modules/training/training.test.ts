import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../http/app';
import { createToken } from '../../middleware/auth';
import type { Database } from '../../db/types';

function handler(sqlRaw: string): { rows: unknown[] } {
  const s = sqlRaw.replace(/\s+/g, ' ').trim();
  if (/^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)/i.test(s)) return { rows: [] };

  // categories (public browse)
  if (/FROM training_categories c LEFT JOIN training_lessons/.test(s) && /lesson_count/.test(s)) {
    return { rows: [{ id: 1, name: 'Form', slug: 'form', description: null, icon: '🥏', skill_level: 'all_levels', lesson_count: '10', sort_order: 1 }] };
  }
  if (/tl.category_id, COUNT\(\*\) AS completed_count/.test(s)) return { rows: [{ category_id: 1, completed_count: '3' }] };

  // completion transaction
  if (/l.xp_reward, l.title, c.slug AS category_slug/.test(s)) return { rows: [{ id: 5, category_id: 1, xp_reward: 40, title: 'Backhand', category_slug: 'form' }] };
  if (/SELECT id FROM training_completions WHERE player_id = \$1 AND lesson_id/.test(s)) return { rows: [] };
  if (/INSERT INTO training_completions/.test(s)) return { rows: [] };
  if (/streak_days, last_date FROM training_streaks WHERE player_id = \$1 FOR UPDATE/.test(s)) return { rows: [] };
  if (/INSERT INTO training_streaks/.test(s)) return { rows: [] };
  if (/UPDATE players SET training_streak_days/.test(s)) return { rows: [] };
  if (/UPDATE players SET xp = xp/.test(s)) return { rows: [] };
  if (/INSERT INTO xp_transactions/.test(s)) return { rows: [] };
  if (/INSERT INTO xp_log/.test(s)) return { rows: [] };
  if (/COUNT\(\*\) AS cnt FROM training_lessons WHERE category_id/.test(s)) return { rows: [{ cnt: '10' }] };
  if (/FROM training_completions tc JOIN training_lessons l ON l.id = tc.lesson_id WHERE tc.player_id = \$1 AND l.category_id/.test(s)) return { rows: [{ cnt: '4' }] };
  if (/COUNT\(\*\) AS cnt FROM training_completions tc JOIN training_lessons tl/.test(s)) return { rows: [{ cnt: '4' }] };
  if (/SELECT xp FROM players WHERE id/.test(s)) return { rows: [{ xp: 540 }] };

  // recommendations
  if (/SELECT xp, training_streak_days FROM players/.test(s)) return { rows: [{ xp: 600, training_streak_days: 2 }] };
  if (/pct_complete ASC NULLS FIRST/.test(s)) return { rows: [{ id: 1, name: 'Form', slug: 'form', icon: '🥏', description: null, total_lessons: '10', completed_lessons: '4', pct_complete: 40 }] };
  if (/difficulty IN \('beginner', 'intermediate'\)/.test(s)) return { rows: [{ id: 5, title: 'Backhand', slug: 'backhand', difficulty: 'beginner', xp_reward: 40, category_name: 'Form', category_slug: 'form', category_icon: '🥏' }] };
  if (/difficulty = 'advanced'/.test(s)) return { rows: [] };
  if (/l.category_id = \$1 AND l.is_active = true AND l.id NOT IN/.test(s)) return { rows: [{ id: 6, title: 'Forehand', slug: 'forehand', difficulty: 'beginner', xp_reward: 40 }] };

  // home/state
  if (/id, username, xp, level, experience_level/.test(s)) return { rows: [{ id: 42, username: 'bob', xp: 600, level: 2, experience_level: 'experienced', total_distance_m: '1000', total_rounds: '5', total_courses_visited: '3', gold_balance: '50', total_checkins: '12', total_birdies: '4', total_aces: '0' }] };
  if (/total_xp_earned/.test(s) && !/category_id/.test(s)) return { rows: [{ total_lessons: '10', completed_lessons: '4', total_xp_earned: '160' }] };
  if (/c.id AS category_id/.test(s) && /xp_earned/.test(s)) return { rows: [{ category_id: 1, name: 'Form', slug: 'form', icon: '🥏', total_lessons: '10', completed_lessons: '4', xp_earned: '160', pct_complete: '40' }] };
  if (/category_name, c.slug AS category_slug FROM training_lessons/.test(s)) return { rows: [{ id: 6, title: 'Forehand', slug: 'forehand', difficulty: 'beginner', xp_reward: 40, category_name: 'Form', category_slug: 'form' }] };
  if (/WITH daily AS/.test(s)) return { rows: [{ streak_days: '3' }] };
  if (/FROM rounds r JOIN courses/.test(s)) return { rows: [] };

  return { rows: [] };
}

const db = {
  query: async (sql: string) => handler(sql) as never,
  connect: async () => ({ query: async (sql: string) => handler(sql), release() {} }) as never,
} as unknown as Database;

test('training endpoints', async (t) => {
  const app = createApp(db);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const token = createToken({ id: 42, player_uuid: 'u42' });
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const getAuthed = (p: string) => fetch(base + p, { headers: auth });

  await t.test('GET /training/categories with completion counts', async () => {
    const r = await getAuthed('/api/training/categories');
    const j = (await r.json()) as { categories: Array<{ lesson_count: number; completed_count: number }> };
    assert.equal(j.categories[0]!.lesson_count, 10);
    assert.equal(j.categories[0]!.completed_count, 3);
  });

  await t.test('POST /training/completions awards base XP', async () => {
    const r = await fetch(base + '/api/training/completions', { method: 'POST', headers: auth, body: JSON.stringify({ lesson_id: 5 }) });
    const j = (await r.json()) as { xp_awarded: number; current_xp: number };
    assert.equal(r.status, 200);
    assert.equal(j.xp_awarded, 40);
    assert.equal(j.current_xp, 540);
  });

  await t.test('POST /training/completions unauth -> 401', async () => {
    const r = await fetch(base + '/api/training/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lesson_id: 5 }) });
    assert.equal(r.status, 401);
  });

  await t.test('GET /training/recommendations: tier-based', async () => {
    const r = await getAuthed('/api/training/recommendations');
    const j = (await r.json()) as { skill_tier: string; recommendations: Array<{ priority: number; type: string }>; tier_messages: unknown[] };
    assert.equal(j.skill_tier, 'player'); // xp 600
    assert.ok(j.recommendations.some((x) => x.priority === 1 && x.type === 'lesson'));
    assert.ok(j.recommendations.some((x) => x.type === 'category_focus'));
    assert.equal(j.tier_messages.length, 3);
  });

  await t.test('GET /home/state authed: level via progression, next_level_xp', async () => {
    const r = await getAuthed('/api/home/state');
    const j = (await r.json()) as { authenticated: boolean; player: { level: number; skill_tier: string }; training: { overall: { pct_complete: number } }; next_level_xp: number };
    assert.equal(j.authenticated, true);
    assert.equal(j.player.level, 2); // xp 600 -> L2 (250..749)
    assert.equal(j.next_level_xp, 750); // totalXpForLevel(3)
    assert.equal(j.player.skill_tier, 'player');
    assert.equal(j.training.overall.pct_complete, 40);
  });

  await t.test('GET /home/state anon -> { authenticated:false }', async () => {
    const r = await fetch(base + '/api/home/state');
    const j = (await r.json()) as { authenticated: boolean };
    assert.equal(j.authenticated, false);
  });

  await new Promise<void>((r) => server.close(() => r()));
});
