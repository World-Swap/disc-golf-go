// routes/reviews.js — owns course star ratings and text reviews.
// Does NOT own: course data, player profiles, admin review UI.

const express = require('express');
const { requireAuth } = require('../middleware/auth');

module.exports = function({ pool }) {
  const router = express.Router();

  // GET /api/courses/:courseId/reviews — public, paginated reviews for a course
  router.get('/courses/:courseId/reviews', async (req, res) => {
    const courseId = parseInt(req.params.courseId, 10);
    if (isNaN(courseId)) return res.status(400).json({ error: 'Invalid course ID' });

    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    try {
      const [reviewsResult, avgResult] = await Promise.all([
        pool.query(
          `SELECT cr.id, cr.rating, cr.review_text, cr.created_at,
                  p.player_uuid, p.username, p.display_name
           FROM course_reviews cr
           JOIN players p ON p.id = cr.player_id
           WHERE cr.course_id = $1
           ORDER BY cr.created_at DESC
           LIMIT $2 OFFSET $3`,
          [courseId, limit, offset]
        ),
        pool.query(
          `SELECT ROUND(AVG(rating)::numeric, 1) as avg_rating,
                  COUNT(*) as total_reviews
           FROM course_reviews
           WHERE course_id = $1`,
          [courseId]
        ),
      ]);

      res.json({
        reviews: reviewsResult.rows,
        summary: {
          avg_rating: parseFloat(avgResult.rows[0].avg_rating) || null,
          total_reviews: parseInt(avgResult.rows[0].total_reviews, 10),
        },
        pagination: { limit, offset },
      });
    } catch (err) {
      console.error('[reviews] GET error:', err.message);
      res.status(500).json({ error: 'Failed to fetch reviews' });
    }
  });

  // POST /api/courses/:courseId/reviews — authenticated, submit/update a review
  router.post('/courses/:courseId/reviews', requireAuth(pool), async (req, res) => {
    const courseId = parseInt(req.params.courseId, 10);
    if (isNaN(courseId)) return res.status(400).json({ error: 'Invalid course ID' });

    const { rating, review_text } = req.body || {};
    const trimmedText = review_text ? String(review_text).trim().slice(0, 2000) : null;

    // Rating validation
    if (!rating || typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be an integer from 1 to 5' });
    }

    // Verify course exists
    try {
      const courseCheck = await pool.query(
        'SELECT id FROM courses WHERE id = $1',
        [courseId]
      );
      if (courseCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Course not found' });
      }

      // Upsert — one review per player per course
      const result = await pool.query(
        `INSERT INTO course_reviews (player_id, course_id, rating, review_text)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (player_id, course_id)
         DO UPDATE SET rating = EXCLUDED.rating, review_text = EXCLUDED.review_text, created_at = NOW()
         RETURNING id, rating, review_text, created_at`,
        [req.player.id, courseId, rating, trimmedText]
      );

      res.status(201).json({ success: true, review: result.rows[0] });
    } catch (err) {
      console.error('[reviews] POST error:', err.message);
      res.status(500).json({ error: 'Failed to save review' });
    }
  });

  // DELETE /api/courses/:courseId/reviews — authenticated, delete own review
  router.delete('/courses/:courseId/reviews', requireAuth(pool), async (req, res) => {
    const courseId = parseInt(req.params.courseId, 10);
    if (isNaN(courseId)) return res.status(400).json({ error: 'Invalid course ID' });

    try {
      const result = await pool.query(
        `DELETE FROM course_reviews
         WHERE player_id = $1 AND course_id = $2
         RETURNING id`,
        [req.player.id, courseId]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Review not found' });
      }
      res.json({ success: true });
    } catch (err) {
      console.error('[reviews] DELETE error:', err.message);
      res.status(500).json({ error: 'Failed to delete review' });
    }
  });

  return router;
};