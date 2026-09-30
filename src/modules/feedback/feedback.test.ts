import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createFeedbackRouter } from './feedback';
import { errorHandler } from '../../http/error-handler';
import { resetRateLimits } from '../../middleware/rate-limit';
import type { EmailMessage } from '../../lib/email';
import type { Queryable } from '../../db/types';

interface Harness {
  base: string;
  close: () => Promise<void>;
  inserts: unknown[][];
  sent: EmailMessage[];
}

function harness(opts: { failDb?: boolean; failEmail?: boolean } = {}): Promise<Harness> {
  const inserts: unknown[][] = [];
  const sent: EmailMessage[] = [];
  const db = {
    query: async (_sql: string, params?: unknown[]) => {
      if (opts.failDb) throw new Error('database is down');
      inserts.push(params ?? []);
      return { rows: [] } as never;
    },
  } as unknown as Queryable;

  const app = express();
  app.use(express.json());
  app.use(createFeedbackRouter(db, (_q, _s, next) => next(), async (msg) => {
    if (opts.failEmail) throw new Error('resend is down');
    sent.push(msg);
  }));
  app.use(errorHandler);

  const server = app.listen(0);
  return new Promise((resolve) => server.once('listening', () => {
    const { port } = server.address() as AddressInfo;
    resolve({
      base: `http://127.0.0.1:${port}`,
      close: () => new Promise<void>((r) => server.close(() => r())),
      inserts, sent,
    });
  }));
}

const post = (base: string, body: unknown) =>
  fetch(base + '/feedback', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

test('feedback', async (t) => {
  await t.test('a bug report is stored and emailed', async () => {
    resetRateLimits();
    const h = await harness();
    const res = await post(h.base, {
      category: 'Bug Report',
      message: 'Tapped Start on the daily and the screen stayed blank.',
      email: 'player@example.com',
      context: { page: '/checkin', app_version: 'w11' },
    });
    assert.equal(res.status, 200);
    assert.equal(h.inserts.length, 1, 'the report must be stored');
    assert.equal(h.sent.length, 1, 'and a notification sent');
    assert.match(h.sent[0]!.subject, /^\[Bug Report\]/, 'category leads the subject so bugs can be filtered');
    assert.match(h.sent[0]!.text, /page:\s+\/checkin/, 'context is what makes a report reproducible');
    assert.match(h.sent[0]!.text, /player@example\.com/);
    await h.close();
  });

  // The whole reason the insert runs first and the send is wrapped: a report
  // that reached us must never be lost because a mail provider had a bad minute,
  // and the reporter must not be told it failed when it did not.
  await t.test('a mail failure does not lose the report or fail the request', async () => {
    resetRateLimits();
    const h = await harness({ failEmail: true });
    const res = await post(h.base, {
      category: 'Bug Report', message: 'The scorecard will not let me finish a round.',
    });
    assert.equal(res.status, 200, 'the reporter should not see an error for something that worked');
    assert.equal(h.inserts.length, 1, 'the report is still stored');
    await h.close();
  });

  // The opposite case: if it was never stored, saying "thanks" would be a lie.
  await t.test('a database failure DOES fail the request', async () => {
    resetRateLimits();
    const h = await harness({ failDb: true });
    const res = await post(h.base, {
      category: 'Bug Report', message: 'Something is broken on the ranks page.',
    });
    assert.equal(res.status, 500);
    assert.equal(h.sent.length, 0, 'nothing should be emailed for a report that was not saved');
    await h.close();
  });

  await t.test('validation: too short, and an unknown category', async () => {
    resetRateLimits();
    const h = await harness();
    assert.equal((await post(h.base, { category: 'Bug Report', message: 'broken' })).status, 400);
    assert.equal((await post(h.base, { category: 'Complaint', message: 'a long enough message' })).status, 400);
    assert.equal(h.inserts.length, 0);
    await h.close();
  });

  await t.test('only known context keys are stored', async () => {
    resetRateLimits();
    const h = await harness();
    await post(h.base, {
      category: 'Feedback', message: 'The training paths are genuinely useful.',
      context: { page: '/training', evil: '<script>', token: 'secret' },
    });
    const ctx = JSON.parse(h.inserts[0]![5] as string) as Record<string, string>;
    assert.equal(ctx.page, '/training');
    assert.equal(ctx.evil, undefined, 'unknown keys must not be persisted');
    assert.equal(ctx.token, undefined);
    await h.close();
  });

  await t.test('the endpoint is rate limited', async () => {
    resetRateLimits();
    const h = await harness();
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      codes.push((await post(h.base, {
        category: 'Feedback', message: `a perfectly valid message number ${i}`,
      })).status);
    }
    assert.ok(codes.includes(429), `public endpoint should be limited: ${codes.join(',')}`);
    await h.close();
  });
});
