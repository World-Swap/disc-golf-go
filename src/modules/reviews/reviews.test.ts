import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../http/app';
import { createToken } from '../../middleware/auth';
import type { Database } from '../../db/types';

let handler: (sql: string) => { rows: unknown[]; rowCount?: number } = () => ({ rows: [] });
const db = { query: async (sql: string) => handler(sql) as never, connect: async () => ({}) as never } as unknown as Database;

test('reviews + feedback endpoints', async (t) => {
  const app = createApp(db);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const token = createToken({ id: 42, player_uuid: 'u42' });
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const json = { 'Content-Type': 'application/json' };

  await t.test('GET reviews (public) -> list + summary', async () => {
    handler = (sql) => {
      if (/FROM course_reviews cr JOIN players/.test(sql)) return { rows: [{ id: 1, rating: 5, review_text: 'Great', display_name: 'Bob' }] };
      if (/AVG\(rating\)/.test(sql)) return { rows: [{ avg_rating: '4.5', total_reviews: '2' }] };
      return { rows: [] };
    };
    const r = await fetch(base + '/api/courses/7/reviews');
    const j = (await r.json()) as { reviews: unknown[]; summary: { avg_rating: number; total_reviews: number } };
    assert.equal(j.reviews.length, 1);
    assert.equal(j.summary.avg_rating, 4.5);
    assert.equal(j.summary.total_reviews, 2);
  });

  await t.test('POST review: bad rating -> 400; valid -> 201', async () => {
    let r = await fetch(base + '/api/courses/7/reviews', { method: 'POST', headers: auth, body: JSON.stringify({ rating: 9 }) });
    assert.equal(r.status, 400);

    handler = (sql) => {
      if (/SELECT id FROM courses/.test(sql)) return { rows: [{ id: 7 }] };
      if (/INSERT INTO course_reviews/.test(sql)) return { rows: [{ id: 3, rating: 4, review_text: 'ok', created_at: new Date() }] };
      return { rows: [] };
    };
    r = await fetch(base + '/api/courses/7/reviews', { method: 'POST', headers: auth, body: JSON.stringify({ rating: 4, review_text: 'ok' }) });
    const j = (await r.json()) as { success: boolean; review: { rating: number } };
    assert.equal(r.status, 201);
    assert.equal(j.review.rating, 4);
  });

  await t.test('DELETE review: 404 when none', async () => {
    handler = () => ({ rows: [], rowCount: 0 });
    const r = await fetch(base + '/api/courses/7/reviews', { method: 'DELETE', headers: auth });
    assert.equal(r.status, 404);
  });

  await t.test('POST /feedback: validation + success', async () => {
    let r = await fetch(base + '/api/feedback', { method: 'POST', headers: json, body: JSON.stringify({ category: 'Feedback', message: 'short' }) });
    assert.equal(r.status, 400);
    r = await fetch(base + '/api/feedback', { method: 'POST', headers: json, body: JSON.stringify({ category: 'Bogus', message: 'this is long enough' }) });
    assert.equal(r.status, 400);
    handler = () => ({ rows: [] });
    r = await fetch(base + '/api/feedback', { method: 'POST', headers: json, body: JSON.stringify({ category: 'Bug Report', message: 'this is a valid message' }) });
    const j = (await r.json()) as { success: boolean };
    assert.equal(r.status, 200);
    assert.equal(j.success, true);
  });

  await new Promise<void>((r) => server.close(() => r()));
});
