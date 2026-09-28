// src/modules/videos/videos.repo.ts — reads and writes for the channel feed.
//
// One shared feed, not per-player state: every row here came from a channel's
// own YouTube upload feed, so the only writes are the refresh job's upserts.

import type { Database, Queryable } from '../../db/types';

export interface VideoRow {
  video_id: string;
  channel_id: string;
  channel_name: string;
  title: string;
  published_at: string;
}

export interface CreatorRow {
  channel_id: string;
  channel_name: string;
  videos: number;
  latest_at: string;
}

export function createVideosRepo(db: Database) {
  return {
    /**
     * The newest uploads across every channel. `offset` is what lets the
     * creator lists start where the newest list stops, so a video is never in
     * both places.
     */
    async newest(limit: number, offset = 0): Promise<VideoRow[]> {
      const r = await db.query<VideoRow>(
        `SELECT video_id, channel_id, channel_name, title, published_at
           FROM channel_videos
          WHERE NOT is_short
          ORDER BY published_at DESC, id DESC
          LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      return r.rows;
    },

    /** Channels that have at least one video past the newest cut. */
    async creators(skip: number): Promise<CreatorRow[]> {
      const r = await db.query<CreatorRow>(
        `WITH ranked AS (
           SELECT channel_id, channel_name, published_at,
                  ROW_NUMBER() OVER (ORDER BY published_at DESC, id DESC) AS rn
             FROM channel_videos
            WHERE NOT is_short
         )
         SELECT channel_id, channel_name,
                COUNT(*)::int AS videos,
                MAX(published_at) AS latest_at
           FROM ranked
          WHERE rn > $1
          GROUP BY channel_id, channel_name
          ORDER BY MAX(published_at) DESC`,
        [skip]
      );
      return r.rows;
    },

    /** One creator's videos, newest first, excluding any in the newest list. */
    async byCreator(channelId: string, skip: number, limit: number): Promise<VideoRow[]> {
      const r = await db.query<VideoRow>(
        `WITH ranked AS (
           SELECT video_id, channel_id, channel_name, title, published_at, id,
                  ROW_NUMBER() OVER (ORDER BY published_at DESC, id DESC) AS rn
             FROM channel_videos
            WHERE NOT is_short
         )
         SELECT video_id, channel_id, channel_name, title, published_at
           FROM ranked
          WHERE channel_id = $1 AND rn > $2
          ORDER BY published_at DESC, id DESC
          LIMIT $3`,
        [channelId, skip, limit]
      );
      return r.rows;
    },

    /**
     * Record one upload. Seeing the same video again updates its title (a
     * creator can rename an upload) rather than inserting a duplicate, which
     * is what makes the refresh job safe to run as often as we like.
     */
    async upsert(client: Queryable, v: VideoRow): Promise<boolean> {
      const r = await client.query<{ inserted: boolean }>(
        `INSERT INTO channel_videos (video_id, channel_id, channel_name, title, published_at)
              VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (video_id) DO UPDATE
            SET title = EXCLUDED.title,
                channel_name = EXCLUDED.channel_name,
                fetched_at = NOW()
         RETURNING (xmax = 0) AS inserted`,
        [v.video_id, v.channel_id, v.channel_name, v.title, v.published_at]
      );
      return r.rows[0]?.inserted ?? false;
    },

    async count(): Promise<number> {
      const r = await db.query<{ n: string }>(
        'SELECT COUNT(*)::text AS n FROM channel_videos WHERE NOT is_short');
      return parseInt(r.rows[0]?.n ?? '0', 10);
    },
  };
}

export type VideosRepo = ReturnType<typeof createVideosRepo>;
