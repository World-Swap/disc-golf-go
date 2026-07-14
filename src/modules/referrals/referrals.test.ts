import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../http/app';
import { createToken } from '../../middleware/auth';
import type { Database } from '../../db/types';

let handler: (sql: string) => { rows: unknown[] } = () => ({ rows: [] });
const db = { query: async (sql: string) => handler(sql) as never, connect: async () => ({}) as never } as unknown as Database;

test('referrals endpoints', async (t) => {
  const app = createApp(db);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const token = createToken({ id: 42, player_uuid: 'u42' });
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  await t.test('GET /referrals/me: codes + stats + url', async () => {
    handler = (sql) => {
      if (/FROM referral_codes WHERE player_id/.test(sql)) return { rows: [{ code: 'ABCD1234', created_at: new Date() }] };
      if (/FROM referral_activations ra/.test(sql)) return { rows: [{ code_used: 'ABCD1234', status: 'rewarded', reward_type: 'gold', reward_amount: 200, friend_id: 7, friend_name: 'Amy', expires_at: new Date(), created_at: new Date() }] };
      if (/SELECT display_name, gold FROM players/.test(sql)) return { rows: [{ display_name: 'Bob', gold: 500 }] };
      return { rows: [] };
    };
    const r = await fetch(base + '/api/referrals/me', { headers: auth });
    const j = (await r.json()) as { codes: Array<{ referral_url: string }>; stats: { total_rewards_gold: number; rewarded_count: number } };
    assert.equal(r.status, 200);
    assert.match(j.codes[0]!.referral_url, /ref=ABCD1234/);
    assert.match(j.codes[0]!.referral_url, /utm_campaign=referral_program/);
    assert.equal(j.stats.total_rewards_gold, 200);
    assert.equal(j.stats.rewarded_count, 1);
  });

  await t.test('POST /referrals/generate: reuse existing', async () => {
    handler = (sql) => (/SELECT code FROM referral_codes WHERE player_id/.test(sql) ? { rows: [{ code: 'EXIST123' }] } : { rows: [] });
    const r = await fetch(base + '/api/referrals/generate', { method: 'POST', headers: auth });
    const j = (await r.json()) as { code: string; already_existed: boolean };
    assert.equal(j.code, 'EXIST123');
    assert.equal(j.already_existed, true);
  });

  await t.test('GET /referrals/validate/:code', async () => {
    handler = () => ({ rows: [{ code: 'ABCD1234', referrer_id: 1, referrer_name: 'Bob' }] });
    const r = await fetch(base + '/api/referrals/validate/abcd1234');
    const j = (await r.json()) as { valid: boolean; referrer_name: string };
    assert.equal(j.valid, true);
    assert.equal(j.referrer_name, 'Bob');
  });

  await t.test('POST /referrals/claim: self-referral rejected', async () => {
    handler = () => ({ rows: [{ player_id: 42 }] }); // owner == friend
    const r = await fetch(base + '/api/referrals/claim', { method: 'POST', headers: auth, body: JSON.stringify({ code: 'ABCD1234' }) });
    const j = (await r.json()) as { claimed: boolean; reason: string };
    assert.equal(j.claimed, false);
    assert.equal(j.reason, 'self_referral');
  });

  await t.test('POST /referrals/claim: valid activation', async () => {
    handler = (sql) => (/SELECT player_id FROM referral_codes/.test(sql) ? { rows: [{ player_id: 1 }] } : { rows: [] });
    const r = await fetch(base + '/api/referrals/claim', { method: 'POST', headers: auth, body: JSON.stringify({ code: 'ABCD1234' }) });
    const j = (await r.json()) as { claimed: boolean; expires_at: string };
    assert.equal(j.claimed, true);
    assert.ok(j.expires_at);
  });

  await t.test('POST /referrals/share: not your code -> 403', async () => {
    handler = () => ({ rows: [{ player_id: 99 }] });
    const r = await fetch(base + '/api/referrals/share', { method: 'POST', headers: auth, body: JSON.stringify({ code: 'ABCD1234' }) });
    assert.equal(r.status, 403);
  });

  await new Promise<void>((r) => server.close(() => r()));
});
