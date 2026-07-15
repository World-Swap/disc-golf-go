import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../http/app';
import { createToken } from '../../middleware/auth';
import type { Database } from '../../db/types';

let handler: (sql: string) => { rows: unknown[] } = () => ({ rows: [] });
const db = { query: async (sql: string) => handler(sql) as never, connect: async () => ({}) as never } as unknown as Database;

test('courses endpoints', async (t) => {
  const app = createApp(db);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const get = (p: string, h: Record<string, string> = {}) => fetch(base + p, { headers: h });

  await t.test('GET /courses/count', async () => {
    handler = () => ({ rows: [{ total: '3550' }] });
    const r = await get('/api/courses/count');
    const j = (await r.json()) as { total: number };
    assert.equal(r.status, 200);
    assert.equal(j.total, 3550);
  });

  await t.test('GET /courses?search', async () => {
    handler = () => ({ rows: [{ id: 1, name: 'Oak Park', city: 'Austin', state: 'TX', lat: '30', lng: '-97', holes: 18, par: 54 }] });
    const r = await get('/api/courses?search=oak&limit=10');
    const j = (await r.json()) as { courses: Array<{ name: string }> };
    assert.equal(j.courses[0]!.name, 'Oak Park');
  });

  await t.test('GET /courses/nearby: missing coords -> 400', async () => {
    const r = await get('/api/courses/nearby');
    assert.equal(r.status, 400);
  });

  await t.test('GET /courses/nearby: sorted nearest-first, within radius', async () => {
    handler = () => ({
      rows: [
        { id: 1, name: 'Far', lat: '10.5', lng: '10.5' },
        { id: 2, name: 'Near', lat: '10.001', lng: '10.001' },
      ],
    });
    const r = await get('/api/courses/nearby?lat=10&lng=10&radius=200000');
    const j = (await r.json()) as Array<{ id: number; distance_meters: number }>;
    assert.equal(j[0]!.id, 2);
    assert.ok(j[0]!.distance_meters < j[1]!.distance_meters);
  });

  await t.test('GET /courses/map-pins: anon vs authed visited flag', async () => {
    handler = (sql) => {
      if (/FROM courses/.test(sql)) return { rows: [{ id: 1, name: 'A', lat: '1', lng: '1', holes: '18', par: '54' }, { id: 2, name: 'B', lat: '2', lng: '2', holes: '9', par: '27' }] };
      if (/checkins/.test(sql)) return { rows: [{ course_id: 2 }] };
      return { rows: [] };
    };
    let r = await get('/api/courses/map-pins');
    let j = (await r.json()) as Array<{ id: number; visited: boolean; holes: number }>;
    assert.equal(j[0]!.visited, false);
    assert.equal(j[0]!.holes, 18);

    const token = createToken({ id: 5, player_uuid: 'u5' });
    r = await get('/api/courses/map-pins', { Authorization: `Bearer ${token}` });
    j = (await r.json()) as Array<{ id: number; visited: boolean; holes: number }>;
    assert.equal(j.find((c) => c.id === 2)!.visited, true);
    assert.equal(j.find((c) => c.id === 1)!.visited, false);
  });

  await t.test('GET /courses/:id: found + stats, and 404', async () => {
    handler = (sql) => {
      if (/FROM courses WHERE id/.test(sql)) return { rows: [{ id: 7, name: 'Oak', hole_details: null }] };
      if (/total_checkins/.test(sql)) return { rows: [{ total_checkins: '12', unique_visitors: '5' }] };
      return { rows: [] };
    };
    let r = await get('/api/courses/7');
    let j = (await r.json()) as { id: number; total_checkins: number; unique_visitors: number };
    assert.equal(j.id, 7);
    assert.equal(j.total_checkins, 12);
    assert.equal(j.unique_visitors, 5);

    handler = () => ({ rows: [] });
    r = await get('/api/courses/999');
    assert.equal(r.status, 404);
  });

  await new Promise<void>((r) => server.close(() => r()));
});
