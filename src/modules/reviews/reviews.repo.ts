// src/modules/reviews/reviews.repo.ts — course star ratings + text reviews.

import type { Queryable } from '../../db/types';

export function createReviewsRepo(db: Queryable) {
  return {
    async list(courseId: number, limit: number, offset: number) {
      const r = await db.query(
        `SELECT cr.id, cr.rating, cr.review_text, cr.created_at, p.player_uuid, p.username, p.display_name
         FROM course_reviews cr JOIN players p ON p.id = cr.player_id
         WHERE cr.course_id = $1 ORDER BY cr.created_at DESC LIMIT $2 OFFSET $3`,
        [courseId, limit, offset]
      );
      return r.rows;
    },

    async summary(courseId: number) {
      const r = await db.query<{ avg_rating: string | null; total_reviews: string }>(
        'SELECT ROUND(AVG(rating)::numeric, 1) as avg_rating, COUNT(*) as total_reviews FROM course_reviews WHERE course_id = $1',
        [courseId]
      );
      return {
        avg_rating: r.rows[0]?.avg_rating != null ? parseFloat(r.rows[0].avg_rating) : null,
        total_reviews: parseInt(r.rows[0]?.total_reviews ?? '0', 10),
      };
    },

    async courseExists(courseId: number): Promise<boolean> {
      const r = await db.query('SELECT id FROM courses WHERE id = $1', [courseId]);
      return r.rows.length > 0;
    },

    async upsert(playerId: number, courseId: number, rating: number, text: string | null) {
      const r = await db.query(
        `INSERT INTO course_reviews (player_id, course_id, rating, review_text) VALUES ($1, $2, $3, $4)
         ON CONFLICT (player_id, course_id) DO UPDATE SET rating = EXCLUDED.rating, review_text = EXCLUDED.review_text, created_at = NOW()
         RETURNING id, rating, review_text, created_at`,
        [playerId, courseId, rating, text]
      );
      return r.rows[0];
    },

    async remove(playerId: number, courseId: number): Promise<number> {
      const r = await db.query('DELETE FROM course_reviews WHERE player_id = $1 AND course_id = $2 RETURNING id', [playerId, courseId]);
      return r.rowCount ?? 0;
    },
  };
}

export type ReviewsRepo = ReturnType<typeof createReviewsRepo>;
