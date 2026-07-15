import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../http/app';
import { createToken } from '../../middleware/auth';
import type { Database } from '../../db/types';
import { evaluateQuestConditions } from './quest-engine';

// ── unit: pure condition evaluation ──
test('evaluateQuestConditions', () => {
  const q = (trigger: string, conditions: Record<string, unknown> = {}, target = 1) =>
    ({ trigger_event: trigger, trigger_conditions: conditions, target_value: target } as never);

  assert.equal(evaluateQuestConditions(q('ROUND_UNDER_PAR'), { scoreVsPar: -2 }), true);
  assert.equal(evaluateQuestConditions(q('ROUND_UNDER_PAR'), { scoreVsPar: 1 }), false);
  assert.equal(evaluateQuestConditions(q('ROUND_18_HOLES'), { holesLogged: 18 }), true);
  assert.equal(evaluateQuestConditions(q('ROUND_18_HOLES'), { holesLogged: 9 }), false);
  assert.equal(evaluateQuestConditions(q('BATTLE_WIN', { battle_type: 'weekly' }), { battleType: 'weekly' }), true);
  assert.equal(evaluateQuestConditions(q('BATTLE_WIN', { battle_type: 'weekly' }), { battleType: 'daily' }), false);
  assert.equal(evaluateQuestConditions(q('TRAINING_COMPLETE', { category_slug: 'form' }), { category_slug: 'form' }), true);
  assert.equal(evaluateQuestConditions(q('TRAINING_COMPLETE', { category_slug: 'form' }), { category_slug: 'putting' }), false);
  assert.equal(evaluateQuestConditions(q('ROUND_CLEAN'), { bogeys: 0, doublesPlus: 0 }), false); // needs signal present
  assert.equal(evaluateQuestConditions(q('UNKNOWN_EVENT'), {}), true);
});

// ── integration: routes ──
let handler: (sql: string) => { rows: unknown[] } = () => ({ rows: [] });
const db = { query: async (sql: string) => handler(sql) as never, connect: async () => ({}) as never } as unknown as Database;

test('story endpoints', async (t) => {
  const app = createApp(db);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const token = createToken({ id: 42, player_uuid: 'u42' });
  const auth = { Authorization: `Bearer ${token}` };

  await t.test('GET /story/missions: daily + missions', async () => {
    handler = (sql) => {
      if (/FROM player_daily_challenges WHERE player_id/.test(sql)) return { rows: [{ id: 1, challenge_date: '2026-07-13', title: 'Train Today', description: null, challenge_type: 'watch_and_learn', target_value: 1, progress: 0, xp_reward: 20, gold_reward: 5, training_slug: null, completed: false, completed_at: null }] };
      if (/SELECT xp, gold, total_rounds, battle_wins FROM players/.test(sql)) return { rows: [{ xp: 500, gold: 100, total_rounds: 3, battle_wins: 1 }] };
      if (/FROM story_quests sq/.test(sql)) return { rows: [{ id: 10, quest_key: 'ch1_main_1', title: 'First Flight', mission_type: 'watch_and_learn', progress: 0, completed: false, completed_at: null }] };
      return { rows: [] };
    };
    const r = await fetch(base + '/api/story/missions', { headers: auth });
    const j = (await r.json()) as { playerXp: number; dailyChallenge: { title: string }; missions: unknown[]; totalMissions: number };
    assert.equal(r.status, 200);
    assert.equal(j.playerXp, 500);
    assert.equal(j.dailyChallenge.title, 'Train Today');
    assert.equal(j.totalMissions, 1);
  });

  await t.test('GET /story/daily: auto-assign when none', async () => {
    let assigned = false;
    handler = (sql) => {
      if (/FROM player_daily_challenges WHERE player_id/.test(sql)) {
        if (!assigned) return { rows: [] };
        return { rows: [{ id: 2, challenge_date: '2026-07-13', title: 'Play a Round', description: null, challenge_type: 'course_apply', target_value: 1, progress: 0, xp_reward: 30, gold_reward: 10, training_slug: null, completed: false, completed_at: null }] };
      }
      if (/FROM daily_challenge_pool/.test(sql)) return { rows: [{ id: 5, title: 'Play a Round', description: null, challenge_type: 'course_apply', target_value: 1, xp_reward: 30, gold_reward: 10, training_slug: null }] };
      if (/INSERT INTO player_daily_challenges/.test(sql)) { assigned = true; return { rows: [] }; }
      return { rows: [] };
    };
    const r = await fetch(base + '/api/story/daily', { headers: auth });
    const j = (await r.json()) as { title: string; date: string };
    assert.equal(r.status, 200);
    assert.equal(j.title, 'Play a Round');
  });

  await t.test('unauth -> 401', async () => {
    const r = await fetch(base + '/api/story/missions');
    assert.equal(r.status, 401);
  });

  await new Promise<void>((r) => server.close(() => r()));
});
