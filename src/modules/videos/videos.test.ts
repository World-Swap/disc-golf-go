import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../http/app';
import type { Database } from '../../db/types';
import { NEWEST_COUNT, PER_CHANNEL_CAP, TEACHING_COUNT } from './videos.service';

let handler: (sql: string, params?: unknown[]) => { rows: unknown[]; rowCount?: number } = () => ({ rows: [] });
const db = {
  query: async (sql: string, params?: unknown[]) => handler(sql, params) as never,
  connect: async () => ({}) as never,
} as unknown as Database;

const video = (id: string, channel = 'UCaaaaaaaaaaaaaaaaaaaaaa', name = 'A Channel') => ({
  video_id: id, channel_id: channel, channel_name: name,
  title: 'Some lesson', published_at: '2026-09-20T00:00:00Z',
});

test('the channel video feed', async (t) => {
  const app = createApp(db);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  await t.test('the newest list is public and needs no login', async () => {
    handler = () => ({ rows: [video('aaaaaaaaaaa')] });
    const r = await fetch(base + '/api/videos/newest');
    assert.equal(r.status, 200, 'the feed is public uploads; a login would only hide them');
    const j = (await r.json()) as { videos: Array<{ url: string; thumbnail: string }> };
    assert.equal(j.videos.length, 1);
  });

  // The watch and thumbnail URLs are derived from the id rather than stored,
  // so a row cannot carry a link that disagrees with its own video.
  await t.test('links are derived from the video id', async () => {
    handler = () => ({ rows: [video('dQw4w9WgXcQ')] });
    const j = (await (await fetch(base + '/api/videos/newest')).json()) as
      { videos: Array<{ url: string; thumbnail: string }> };
    assert.equal(j.videos[0]!.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.equal(j.videos[0]!.thumbnail, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
  });

  await t.test('the newest list is capped at NEWEST_COUNT however many are asked for', async () => {
    let asked = 0;
    handler = (sql, params) => {
      if (/FROM eligible/.test(sql)) asked = Number((params ?? [])[0]);
      return { rows: [] };
    };
    await fetch(base + '/api/videos/newest?limit=500');
    assert.equal(asked, NEWEST_COUNT, 'a big limit cannot drain the table');
    await fetch(base + '/api/videos/newest?limit=3');
    assert.equal(asked, 3, 'a smaller limit is still honoured');
  });

  // The whole shape of the feature: the Newest list is the top N subject to a
  // per-channel cap, and the creator lists are exactly what it is not showing.
  // Both reads must define that set identically or a video lands in both
  // places, or in neither.
  await t.test('every read defines the newest set the same way', async () => {
    const seen: Array<{ sql: string; params: unknown[] }> = [];
    handler = (sql, params) => {
      if (/channel_videos/.test(sql)) seen.push({ sql, params: params ?? [] });
      return { rows: [] };
    };
    await fetch(base + '/api/videos/newest');
    await fetch(base + '/api/videos/creators');
    await fetch(base + '/api/videos/creators/UCaaaaaaaaaaaaaaaaaaaaaa');
    assert.equal(seen.length, 3);
    for (const { sql, params } of seen) {
      assert.match(sql, /PARTITION BY channel_id/, 'ranks each channel separately');
      assert.equal(params[1], PER_CHANNEL_CAP, 'same cap everywhere');
    }
    // The two creator reads subtract precisely the Newest list.
    for (const { sql, params } of seen.slice(1)) {
      assert.match(sql, /NOT IN \(SELECT video_id FROM eligible WHERE grn <= \$1\)/);
      assert.equal(params[0], NEWEST_COUNT, 'subtracting the same N the list shows');
    }
  });

  // Without the cap one channel owns the section: JomezPro posts four round
  // coverage videos on an event day and took six of the ten slots.
  await t.test('no channel can take more than the cap', async () => {
    let capUsed = -1;
    handler = (sql, params) => {
      if (/PARTITION BY channel_id/.test(sql)) capUsed = Number((params ?? [])[1]);
      return { rows: [] };
    };
    await fetch(base + '/api/videos/newest?limit=10');
    assert.equal(capUsed, PER_CHANNEL_CAP);
    assert.ok(PER_CHANNEL_CAP < NEWEST_COUNT, 'a cap that cannot bind is not a cap');
  });

  // The training feed makes a promise the lounge does not: everything under
  // "new training videos" teaches. That promise is kept by the column, written
  // once by the refresh job, so the read can never widen it by accident.
  await t.test('the training feed reads only rows marked as teaching', async () => {
    let sql = '';
    handler = (s) => { if (/channel_videos/.test(s)) sql = s; return { rows: [] }; };
    await fetch(base + '/api/videos/teaching');
    assert.match(sql, /WHERE teaches AND NOT feed_hidden/, 'both gates, and no others');
    assert.match(sql, /PARTITION BY channel_id/, 'still capped per channel');
  });

  await t.test('the training feed is capped and cannot be widened by a query string', async () => {
    let params: unknown[] = [];
    handler = (s, p) => { if (/WHERE teaches/.test(s)) params = p ?? []; return { rows: [] }; };
    await fetch(base + '/api/videos/teaching?limit=9999');
    assert.equal(params[0], TEACHING_COUNT, 'a big limit cannot drain the table');
    assert.equal(params[1], PER_CHANNEL_CAP, 'one channel cannot own the list');
  });

  await t.test('a channel id that is not one is refused', async () => {
    handler = () => ({ rows: [] });
    for (const bad of ['nonsense', 'UCtooshort', "UC'; DROP TABLE channel_videos; --"]) {
      const r = await fetch(base + '/api/videos/creators/' + encodeURIComponent(bad));
      assert.equal(r.status, 400, bad + ' should not reach the query');
    }
  });

  // Shorts are hidden by the refresh job writing feed_hidden, not by the
  // reads testing is_short -- that is what lets a channel whose teaching is
  // entirely Shorts (Scott Stokely posts nothing else) appear at all.
  await t.test('the feed filters on feed_hidden, never on is_short', async () => {
    const seen: string[] = [];
    handler = (sql) => { if (/channel_videos/.test(sql)) seen.push(sql); return { rows: [] }; };
    await fetch(base + '/api/videos/newest');
    await fetch(base + '/api/videos/creators');
    await fetch(base + '/api/videos/creators/UC4LCYbEROzep8Cw0lZWAJ4A');
    assert.ok(seen.length >= 3, 'all three reads hit the table');
    for (const sql of seen) {
      assert.match(sql, /NOT feed_hidden/, 'every read respects the feed flag');
      assert.doesNotMatch(sql, /NOT is_short/, 'no read second-guesses it');
    }
  });

  await t.test('a valid-looking channel id is accepted', async () => {
    handler = () => ({ rows: [] });
    const r = await fetch(base + '/api/videos/creators/UC4LCYbEROzep8Cw0lZWAJ4A');
    assert.equal(r.status, 200);
  });

  server.close();
});
