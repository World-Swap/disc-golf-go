// src/modules/videos/videos.service.ts — the newest-uploads feed.
//
// The shape of the feature is one decision: the NEWEST_COUNT most recent
// uploads across every channel are the "Newest" list, and everything older
// than that cut is reached through its creator. A video is therefore in
// exactly one place, and the creator lists shrink as new uploads push videos
// out of the newest list -- which is why `skip` is passed to every query
// rather than each one deciding for itself.
//
// Shorts are excluded from all three queries, so the ranking the skip counts
// against is the same set the Newest list shows. Ranking over everything and
// skipping ten would silently hide whatever shorts fell in that window.

import type { VideosRepo, VideoRow } from './videos.repo';

/** How many uploads the "Newest" section holds. The rest go to creators. */
export const NEWEST_COUNT = 10;

/** A YouTube id is 11 characters of [A-Za-z0-9_-]; anything else is not one. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function isVideoId(id: unknown): id is string {
  return typeof id === 'string' && VIDEO_ID.test(id);
}

/** The watch and thumbnail URLs are derived, never stored: they are one id. */
function present(v: VideoRow) {
  return {
    video_id: v.video_id,
    title: v.title,
    channel_id: v.channel_id,
    channel_name: v.channel_name,
    published_at: v.published_at,
    url: 'https://www.youtube.com/watch?v=' + v.video_id,
    thumbnail: 'https://i.ytimg.com/vi/' + v.video_id + '/mqdefault.jpg',
  };
}

export function createVideosService(deps: { repo: VideosRepo }) {
  const { repo } = deps;

  return {
    /** The Newest section. */
    async newest(limit = NEWEST_COUNT) {
      const n = Math.min(Math.max(limit, 1), NEWEST_COUNT);
      const rows = await repo.newest(n);
      return { videos: rows.map(present), newest_count: NEWEST_COUNT };
    },

    /**
     * The creators who have anything older than the newest cut. A channel
     * whose only uploads are all still in the Newest list is deliberately
     * absent: listing it would open an empty creator page.
     */
    async creators() {
      const rows = await repo.creators(NEWEST_COUNT);
      return {
        creators: rows.map((c) => ({
          channel_id: c.channel_id,
          channel_name: c.channel_name,
          videos: c.videos,
          latest_at: c.latest_at,
          url: 'https://www.youtube.com/channel/' + c.channel_id,
        })),
      };
    },

    async byCreator(channelId: unknown, limit = 50) {
      const id = typeof channelId === 'string' ? channelId : '';
      const rows = await repo.byCreator(id, NEWEST_COUNT, Math.min(Math.max(limit, 1), 100));
      return {
        channel_id: id,
        channel_name: rows[0]?.channel_name ?? null,
        videos: rows.map(present),
      };
    },
  };
}

export type VideosService = ReturnType<typeof createVideosService>;
