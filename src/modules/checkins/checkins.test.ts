import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../http/app';
import { createToken } from '../../middleware/auth';
import type { Database } from '../../db/types';

const opts = { sameDay: '0' };

function handler(sqlRaw: string): { rows: unknown[] } {
  const s = sqlRaw.replace(/\s+/g, ' ').trim();
  if (/^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)/i.test(s)) return { rows: [] };

  if (/display_name, xp, level, battle_wins, total_rounds FROM players/.test(s)) {
    return { rows: [{ id: 42, display_name: 'Bob', xp: 500, level: 2, battle_wins: 0, total_rounds: 0 }] };
  }
  if (/FROM courses WHERE id = \$1/.test(s)) return { rows: [{ id: 7, name: 'Oak Park', city: 'Austin', state: 'TX', lat: 10, lng: 10 }] };

  if (/course_id = \$2 AND checked_in_at/.test(s)) return { rows: [{ cnt: opts.sameDay }] };
  if (/player_id = \$1 AND course_id = \$2/.test(s)) return { rows: [{ cnt: '0' }] }; // prevVisit / challenge count
  if (/FROM checkins WHERE course_id = \$1/.test(s)) return { rows: [{ cnt: '0' }] }; // trailblazer
  if (/player_id = \$1 AND checked_in_at >= \$2/.test(s)) return { rows: [{ cnt: '0' }] }; // daily first
  if (/INSERT INTO checkins/.test(s)) return { rows: [{ id: 555 }] };

  if (/boost_type = 'boost_xp'/.test(s)) return { rows: [] };
  if (/boost_type = 'boost_gold'/.test(s)) return { rows: [] };
  if (/INSERT INTO xp_transactions/.test(s)) return { rows: [] };
  if (/INSERT INTO gold_transactions/.test(s)) return { rows: [] };
  if (/UPDATE players SET xp = xp/.test(s)) return { rows: [{ xp: 800 }] };
  if (/UPDATE players SET level/.test(s)) return { rows: [] };
  if (/UPDATE players SET gold/.test(s)) return { rows: [{ gold: 75 }] };
  if (/UPDATE players SET total_rounds/.test(s)) return { rows: [] };
  if (/UPDATE checkins SET xp_earned/.test(s)) return { rows: [] };

  if (/COUNT\(\*\) AS total_checkins/.test(s)) return { rows: [{ total_checkins: '1', unique_courses: '1' }] };
  if (/battle_wins, best_streak, total_rounds FROM players/.test(s)) return { rows: [{ battle_wins: '0', best_streak: '0', total_rounds: '0' }] };
  if (/SELECT total_rounds FROM players/.test(s)) return { rows: [{ total_rounds: '0' }] };
  if (/AND c.state != ''/.test(s)) return { rows: [{ cnt: '0' }] }; // completed states
  if (/max_same_course_visits/.test(s)) return { rows: [{ unique_courses: '0', total_checkins: '1', max_same_course_visits: '1', unique_states: '1', weekend_rounds: '0', night_checkins: '0', morning_checkins: '0', weather_checkins: '0' }] };
  if (/MIN\(ci2.checked_in_at\)/.test(s)) return { rows: [{ cnt: '0' }] };
  if (/player_challenges WHERE player_id = \$1 AND completed = TRUE/.test(s)) return { rows: [{ cnt: '0' }] };
  if (/challenger_id = \$1 THEN opponent_id/.test(s)) return { rows: [{ cnt: '0' }] };
  if (/c.city, c.state/.test(s)) return { rows: [{ cnt: '0' }] };
  if (/'spring'/.test(s)) return { rows: [{ cnt: '0' }] };
  if (/SELECT category, tier FROM player_badges/.test(s)) return { rows: [] };
  if (/SELECT xp, level, gold FROM players/.test(s)) return { rows: [{ xp: 800, level: 3, gold: 75 }] };
  if (/SELECT gold FROM players WHERE id = \$1/.test(s)) return { rows: [{ gold: 75 }] };
  if (/FROM challenges WHERE challenge_type = 'course_checkin'/.test(s)) return { rows: [] };
  return { rows: [] };
}

const db = {
  query: async (sql: string) => handler(sql) as never,
  connect: async () => ({ query: async (sql: string) => handler(sql), release() {} }) as never,
} as unknown as Database;

test('checkins endpoints', async (t) => {
  const app = createApp(db);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const token = createToken({ id: 42, player_uuid: 'u42' });
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const post = (b: unknown) => fetch(base + '/api/checkins', { method: 'POST', headers: auth, body: JSON.stringify(b) });

  await t.test('missing coords -> 400', async () => {
    const r = await post({ course_id: 7 });
    assert.equal(r.status, 400);
  });

  await t.test('happy path -> rewards + level up', async () => {
    opts.sameDay = '0';
    const r = await post({ course_id: 7, player_lat: 10, player_lng: 10, is_round_complete: true, weather_condition: 'rain' });
    const j = (await r.json()) as { success: boolean; is_new_course: boolean; is_trailblazer: boolean; xp_breakdown: Array<{ event: string }>; new_level: number; old_level: number; leveled_up: boolean; new_gold: number; new_badges: unknown[] };
    assert.equal(r.status, 200);
    assert.equal(j.success, true);
    assert.equal(j.is_new_course, true);
    assert.equal(j.is_trailblazer, true);
    assert.ok(j.xp_breakdown.some((e) => e.event === 'checkin_new_course'));
    assert.ok(j.xp_breakdown.some((e) => e.event === 'round_complete'));
    assert.ok(j.xp_breakdown.some((e) => e.event === 'bad_weather'));
    assert.equal(j.old_level, 2);
    assert.equal(j.new_level, 3); // finalXp 800
    assert.equal(j.leveled_up, true);
    assert.equal(j.new_gold, 75);
    assert.ok(Array.isArray(j.new_badges));
  });

  await t.test('too far -> 400 with details', async () => {
    const r = await post({ course_id: 7, player_lat: 11, player_lng: 11 });
    const j = (await r.json()) as { error: string; required_meters: number; course_name: string };
    assert.equal(r.status, 400);
    assert.match(j.error, /Too far/);
    assert.equal(j.required_meters, 800);
    assert.equal(j.course_name, 'Oak Park');
  });

  await t.test('already checked in today -> 400', async () => {
    opts.sameDay = '1';
    const r = await post({ course_id: 7, player_lat: 10, player_lng: 10 });
    const j = (await r.json()) as { error: string; resets_at: string };
    assert.equal(r.status, 400);
    assert.match(j.error, /Already checked in/);
    assert.ok(j.resets_at);
    opts.sameDay = '0';
  });

  await t.test('GET /checkins/status', async () => {
    const r = await fetch(base + '/api/checkins/status?course_id=7', { headers: auth });
    const j = (await r.json()) as { course_id: number; checked_in: boolean };
    assert.equal(r.status, 200);
    assert.equal(j.course_id, 7);
    assert.equal(typeof j.checked_in, 'boolean');
  });

  await t.test('unauth -> 401', async () => {
    const r = await fetch(base + '/api/checkins/me');
    assert.equal(r.status, 401);
  });

  await new Promise<void>((r) => server.close(() => r()));
});
