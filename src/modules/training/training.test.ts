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
  if (/FROM training_categories c LEFT JOIN training_lessons/.test(s) && /GROUP BY c.id/.test(s) && /lesson_count/.test(s)) {
    return { rows: [{ id: 1, name: 'Form', slug: 'form', description: null, icon: '🥏', skill_level: 'all_levels', lesson_count: '10', sort_order: 1 }] };
  }
  if (/tl.category_id, COUNT\(\*\) AS completed_count/.test(s)) return { rows: [{ category_id: 1, completed_count: '3' }] };

  // completion transaction
  if (/l.xp_reward, l.title, c.slug AS category_slug/.test(s)) return { rows: [{ id: 5, category_id: 1, xp_reward: 40, title: 'Backhand', category_slug: 'form' }] };
  if (/SELECT id FROM training_completions WHERE player_id = \$1 AND lesson_id/.test(s)) return { rows: [] }; // not completed yet
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
  if (/FROM training_categories c LEFT JOIN training_lessons l.*COUNT\(tc.id\) AS completed/.test(s)) return { rows: [] };
  if (/SELECT xp FROM players WHERE id/.test(s)) return { rows: [{ xp: 540 }] };

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

  await t.test('GET /training/categories (public) with completion counts when authed', async () => {
    const r = await fetch(base + '/api/training/categories', { headers: auth });
    const j = (await r.json()) as { categories: Array<{ lesson_count: number; completed_count: number }> };
    assert.equal(r.status, 200);
    assert.equal(j.categories[0]!.lesson_count, 10);
    assert.equal(j.categories[0]!.completed_count, 3);
  });

  await t.test('POST /training/completions: awards base XP', async () => {
    const r = await fetch(base + '/api/training/completions', { method: 'POST', headers: auth, body: JSON.stringify({ lesson_id: 5 }) });
    const j = (await r.json()) as { success: boolean; already_completed: boolean; xp_awarded: number; current_xp: number; lesson_title: string };
    assert.equal(r.status, 200);
    assert.equal(j.success, true);
    assert.equal(j.already_completed, false);
    assert.equal(j.xp_awarded, 40);
    assert.equal(j.current_xp, 540);
    assert.equal(j.lesson_title, 'Backhand');
  });

  await t.test('POST /training/completions requires lesson_id', async () => {
    const r = await fetch(base + '/api/training/completions', { method: 'POST', headers: auth, body: JSON.stringify({}) });
    assert.equal(r.status, 400);
  });

  await t.test('POST /training/completions unauth -> 401', async () => {
    const r = await fetch(base + '/api/training/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lesson_id: 5 }) });
    assert.equal(r.status, 401);
  });

  await new Promise<void>((r) => server.close(() => r()));
});
