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

/**
 * The Newest list, as SQL.
 *
 * `capped` ranks each channel's own uploads, `eligible` keeps only the first
 * `cap` of them and then ranks what is left globally by date. Without that cap
 * one channel owns the section: JomezPro posts four round-coverage videos on
 * an event day, which took six of the ten slots and buried the other
 * twenty-seven channels.
 *
 * Both reads build on this same expression, so the creator lists are exactly
 * "everything the Newest list is not showing" and a video is never in both.
 */
const NEWEST_SET = `
  WITH capped AS (
    SELECT video_id, channel_id, channel_name, title, published_at, id,
           ROW_NUMBER() OVER (PARTITION BY channel_id ORDER BY published_at DESC, id DESC) AS crn
      FROM channel_videos
     WHERE NOT feed_hidden
  ), eligible AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY published_at DESC, id DESC) AS grn
      FROM capped
     WHERE crn <= $2
  )`;

export function createVideosRepo(db: Database) {
  return {
    /** The newest uploads across every channel, at most `cap` from each. */
    async newest(limit: number, cap: number): Promise<VideoRow[]> {
      const r = await db.query<VideoRow>(
        `${NEWEST_SET}
         SELECT video_id, channel_id, channel_name, title, published_at
           FROM eligible
          WHERE grn <= $1
          ORDER BY grn`,
        [limit, cap]
      );
      return r.rows;
    },

    /** Channels holding anything the Newest list is not already showing. */
    async creators(limit: number, cap: number): Promise<CreatorRow[]> {
      const r = await db.query<CreatorRow>(
        `${NEWEST_SET}
         SELECT channel_id, channel_name,
                COUNT(*)::int AS videos,
                MAX(published_at) AS latest_at
           FROM channel_videos v
          WHERE NOT v.feed_hidden
            AND v.video_id NOT IN (SELECT video_id FROM eligible WHERE grn <= $1)
          GROUP BY channel_id, channel_name
          ORDER BY MAX(published_at) DESC`,
        [limit, cap]
      );
      return r.rows;
    },

    /** One creator's videos, newest first, minus any on the Newest list. */
    async byCreator(channelId: string, limit: number, cap: number, rows: number): Promise<VideoRow[]> {
      const r = await db.query<VideoRow>(
        `${NEWEST_SET}
         SELECT v.video_id, v.channel_id, v.channel_name, v.title, v.published_at
           FROM channel_videos v
          WHERE NOT v.feed_hidden
            AND v.channel_id = $3
            AND v.video_id NOT IN (SELECT video_id FROM eligible WHERE grn <= $1)
          ORDER BY v.published_at DESC, v.id DESC
          LIMIT $4`,
        [limit, cap, channelId, rows]
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
        'SELECT COUNT(*)::text AS n FROM channel_videos WHERE NOT feed_hidden');
      return parseInt(r.rows[0]?.n ?? '0', 10);
    },
  };
}

export type VideosRepo = ReturnType<typeof createVideosRepo>;
