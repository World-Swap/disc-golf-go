import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../http/app';
import type { Database } from '../../db/types';
import { NEWEST_COUNT } from './videos.service';

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
      if (/ORDER BY published_at DESC/.test(sql) && !/ROW_NUMBER/.test(sql)) asked = Number((params ?? [])[0]);
      return { rows: [] };
    };
    await fetch(base + '/api/videos/newest?limit=500');
    assert.equal(asked, NEWEST_COUNT, 'a big limit cannot drain the table');
    await fetch(base + '/api/videos/newest?limit=3');
    assert.equal(asked, 3, 'a smaller limit is still honoured');
  });

  // The whole shape of the feature: the newest N are the Newest section, and
  // everything past them is reached through its creator. If the creator
  // queries did not skip the same N, a video would show up in both places.
  await t.test('creator lists start where the newest list stops', async () => {
    const skips: number[] = [];
    handler = (sql, params) => {
      if (/ROW_NUMBER/.test(sql)) skips.push(Number((params ?? [])[/channel_id = \$1/.test(sql) ? 1 : 0]));
      return { rows: [] };
    };
    await fetch(base + '/api/videos/creators');
    await fetch(base + '/api/videos/creators/UCaaaaaaaaaaaaaaaaaaaaaa');
    assert.deepEqual(skips, [NEWEST_COUNT, NEWEST_COUNT], 'both skip the newest cut');
  });

  await t.test('a channel id that is not one is refused', async () => {
    handler = () => ({ rows: [] });
    for (const bad of ['nonsense', 'UCtooshort', "UC'; DROP TABLE channel_videos; --"]) {
      const r = await fetch(base + '/api/videos/creators/' + encodeURIComponent(bad));
      assert.equal(r.status, 400, bad + ' should not reach the query');
    }
  });

  await t.test('a valid-looking channel id is accepted', async () => {
    handler = () => ({ rows: [] });
    const r = await fetch(base + '/api/videos/creators/UC4LCYbEROzep8Cw0lZWAJ4A');
    assert.equal(r.status, 200);
  });

  server.close();
});
