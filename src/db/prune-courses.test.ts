import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import { pruneUnnamedCourses } from './migrate';

type Call = { sql: string; params?: unknown[] };

// A client that answers the three queries the prune makes and records them, so
// the test can assert on exactly which ids the DELETE was given.
function stub(courses: { id: number; name: string | null }[], scorecards = 0) {
  const calls: Call[] = [];
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (/FROM courses/.test(sql)) return { rows: courses, rowCount: courses.length };
      if (/FROM scorecards/.test(sql)) return { rows: [{ n: String(scorecards) }], rowCount: 1 };
      return { rows: [], rowCount: (params?.[0] as number[])?.length ?? 0 };
    },
  } as unknown as PoolClient;
  return { client, calls };
}

const deleted = (calls: Call[]) =>
  (calls.find((c) => /^DELETE FROM courses/.test(c.sql))?.params?.[0] as number[]) ?? null;

test('deletes only the placeholder rows, by id', async () => {
  const { client, calls } = stub([
    { id: 1, name: 'Brock Park DGC' },
    { id: 2, name: 'Tee 2 - Long' },
    { id: 3, name: 'Hole 10 - Gray' },
    { id: 4, name: 'Hole in the Wall DGC' },
    { id: 5, name: 'Disc Golf Course' },
    { id: 6, name: 'Course 1' },
    { id: 7, name: '7 Acre Park DGC' },
    { id: 8, name: null },
  ]);
  await pruneUnnamedCourses(client);
  assert.deepEqual(deleted(calls), [2, 3, 5, 6, 8]);
});

test('is a single SELECT once there is nothing left to prune', async () => {
  const { client, calls } = stub([
    { id: 1, name: 'Brock Park DGC' },
    { id: 2, name: 'Comanche Trail Park - Mountain DGC' },
  ]);
  await pruneUnnamedCourses(client);
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.sql, /SELECT id, name FROM courses/);
  assert.equal(deleted(calls), null);
});

test('counts the scorecards a delete cascades away', async () => {
  const { client, calls } = stub([{ id: 9, name: 'Basket4' }], 3);
  await pruneUnnamedCourses(client);
  const count = calls.find((c) => /FROM scorecards/.test(c.sql));
  assert.ok(count, 'expected the scorecard count to be taken before deleting');
  assert.deepEqual(count!.params?.[0], [9]);
  assert.ok(calls.indexOf(count!) < calls.findIndex((c) => /^DELETE/.test(c.sql)));
});
