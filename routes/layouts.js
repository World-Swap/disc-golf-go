/**
 * Course Layouts & Holes — API
 *
 * Owns: course_layouts, course_holes tables
 * Owns: CRUD for named layouts per course; bulk hole upsert per layout
 * Does NOT own: courses table schema, round scoring logic, scorecard rendering
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { sanitizeFields } = require('../middleware/security');

module.exports = ({ pool }) => {
  const router = express.Router();
  // requireAuth needs pool for legacy UUID header support
  const auth = requireAuth(pool);

  // ─── Layouts ─────────────────────────────────────────────────────────────

  // GET /api/courses/:courseId/layouts — list all layouts for a course
  router.get('/courses/:courseId/layouts', async (req, res) => {
    const courseId = parseInt(req.params.courseId, 10);
    if (isNaN(courseId)) return res.status(400).json({ error: 'Invalid course ID' });

    try {
      const { rows } = await pool.query(
        `SELECT l.id, l.course_id, l.name, l.hole_count, l.is_default, l.created_at,
                COALESCE(l.hole_count,
                  (SELECT COUNT(*) FROM course_holes ch WHERE ch.layout_id = l.id)) AS total_holes
         FROM course_layouts l
         WHERE l.course_id = $1
         ORDER BY l.is_default DESC, l.name ASC`,
        [courseId]
      );
      res.json(rows);
    } catch (err) {
      console.error('List layouts error:', err.message);
      res.status(500).json({ error: 'Failed to list layouts' });
    }
  });

  // POST /api/courses/:courseId/layouts — create a new layout
  router.post('/courses/:courseId/layouts', auth, sanitizeFields('name'), async (req, res) => {
    const courseId = parseInt(req.params.courseId, 10);
    if (isNaN(courseId)) return res.status(400).json({ error: 'Invalid course ID' });

    const { name, hole_count, is_default = false } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // If this new layout is being set as default, clear existing default first
      if (is_default) {
        await client.query(
          `UPDATE course_layouts SET is_default = FALSE WHERE course_id = $1`,
          [courseId]
        );
      }

      const { rows } = await client.query(
        `INSERT INTO course_layouts (course_id, name, hole_count, is_default)
         VALUES ($1, $2, $3, $4)
         RETURNING id, course_id, name, hole_count, is_default, created_at`,
        [courseId, name.trim(), hole_count || null, is_default]
      );

      await client.query('COMMIT');
      res.status(201).json(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        return res.status(409).json({ error: 'A layout with that name already exists for this course' });
      }
      if (err.code === '23503') {
        return res.status(404).json({ error: 'Course not found' });
      }
      console.error('Create layout error:', err.message);
      res.status(500).json({ error: 'Failed to create layout' });
    } finally {
      client.release();
    }
  });

  // PATCH /api/layouts/:layoutId — update a layout's metadata
  router.patch('/layouts/:layoutId', auth, sanitizeFields('name'), async (req, res) => {
    const layoutId = parseInt(req.params.layoutId, 10);
    if (isNaN(layoutId)) return res.status(400).json({ error: 'Invalid layout ID' });

    const { name, hole_count, is_default } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        `SELECT id, course_id, is_default FROM course_layouts WHERE id = $1`,
        [layoutId]
      );
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Layout not found' });
      }

      const layout = existing.rows[0];

      // If marking as default, demote current default on this course first
      if (is_default === true) {
        await client.query(
          `UPDATE course_layouts SET is_default = FALSE WHERE course_id = $1`,
          [layout.course_id]
        );
      }

      // Prevent un-defaulting a default layout without assigning a new one
      if (is_default === false && layout.is_default) {
        const otherDefault = await client.query(
          `SELECT id FROM course_layouts WHERE course_id = $1 AND id != $2 AND is_default = TRUE`,
          [layout.course_id, layoutId]
        );
        if (otherDefault.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'Cannot remove default status without assigning another layout as default'
          });
        }
      }

      const updates = [];
      const params = [];
      let idx = 1;

      if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name.trim()); }
      if (hole_count !== undefined) { updates.push(`hole_count = $${idx++}`); params.push(hole_count); }
      if (is_default !== undefined) { updates.push(`is_default = $${idx++}`); params.push(is_default); }

      if (updates.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'No fields to update' });
      }

      params.push(layoutId);
      const { rows } = await client.query(
        `UPDATE course_layouts SET ${updates.join(', ')} WHERE id = $${idx}
         RETURNING id, course_id, name, hole_count, is_default, created_at`,
        params
      );

      await client.query('COMMIT');
      res.json(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        return res.status(409).json({ error: 'A layout with that name already exists for this course' });
      }
      console.error('Update layout error:', err.message);
      res.status(500).json({ error: 'Failed to update layout' });
    } finally {
      client.release();
    }
  });

  // DELETE /api/layouts/:layoutId — delete a layout (blocks default deletion)
  router.delete('/layouts/:layoutId', auth, async (req, res) => {
    const layoutId = parseInt(req.params.layoutId, 10);
    if (isNaN(layoutId)) return res.status(400).json({ error: 'Invalid layout ID' });

    try {
      const { rows } = await pool.query(
        `SELECT id, is_default FROM course_layouts WHERE id = $1`,
        [layoutId]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Layout not found' });

      if (rows[0].is_default) {
        return res.status(400).json({
          error: 'Cannot delete the default layout. Assign another layout as default first.'
        });
      }

      // Holes cascade via ON DELETE CASCADE
      await pool.query(`DELETE FROM course_layouts WHERE id = $1`, [layoutId]);
      res.json({ deleted: true });
    } catch (err) {
      console.error('Delete layout error:', err.message);
      res.status(500).json({ error: 'Failed to delete layout' });
    }
  });

  // ─── Holes ────────────────────────────────────────────────────────────────

  // GET /api/layouts/:layoutId/holes — get all holes for a layout
  router.get('/layouts/:layoutId/holes', async (req, res) => {
    const layoutId = parseInt(req.params.layoutId, 10);
    if (isNaN(layoutId)) return res.status(400).json({ error: 'Invalid layout ID' });

    try {
      const layoutCheck = await pool.query(
        `SELECT id, course_id, name, hole_count, is_default FROM course_layouts WHERE id = $1`,
        [layoutId]
      );
      if (layoutCheck.rows.length === 0) return res.status(404).json({ error: 'Layout not found' });

      const { rows: holes } = await pool.query(
        `SELECT id, layout_id, hole_number, par, distance_ft, notes
         FROM course_holes
         WHERE layout_id = $1
         ORDER BY hole_number ASC`,
        [layoutId]
      );

      res.json({ layout: layoutCheck.rows[0], holes });
    } catch (err) {
      console.error('Get holes error:', err.message);
      res.status(500).json({ error: 'Failed to get holes' });
    }
  });

  // PUT /api/layouts/:layoutId/holes — bulk upsert all holes for a layout
  // Body: { holes: [{ hole_number, par, distance_ft?, notes? }, ...] }
  // Replaces the full set of holes for the layout atomically.
  router.put('/layouts/:layoutId/holes', auth, async (req, res) => {
    const layoutId = parseInt(req.params.layoutId, 10);
    if (isNaN(layoutId)) return res.status(400).json({ error: 'Invalid layout ID' });

    const { holes } = req.body;
    if (!Array.isArray(holes) || holes.length === 0) {
      return res.status(400).json({ error: 'holes must be a non-empty array' });
    }

    // Validate each hole
    for (const h of holes) {
      if (!Number.isInteger(h.hole_number) || h.hole_number < 1) {
        return res.status(400).json({ error: 'Each hole must have a valid hole_number (integer ≥ 1)' });
      }
      if (!Number.isInteger(h.par) || h.par < 1) {
        return res.status(400).json({ error: 'Each hole must have a valid par (integer ≥ 1)' });
      }
    }

    // Ensure hole_numbers are unique in the request
    const holeNums = holes.map(h => h.hole_number);
    if (new Set(holeNums).size !== holeNums.length) {
      return res.status(400).json({ error: 'Duplicate hole_number values in request' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const layoutCheck = await client.query(
        `SELECT id, hole_count FROM course_layouts WHERE id = $1`,
        [layoutId]
      );
      if (layoutCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Layout not found' });
      }

      // Delete existing holes and replace atomically
      await client.query(`DELETE FROM course_holes WHERE layout_id = $1`, [layoutId]);

      const inserted = [];
      for (const h of holes) {
        const { rows } = await client.query(
          `INSERT INTO course_holes (layout_id, hole_number, par, distance_ft, notes)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, layout_id, hole_number, par, distance_ft, notes`,
          [layoutId, h.hole_number, h.par, h.distance_ft || null, h.notes || null]
        );
        inserted.push(rows[0]);
      }

      // Update layout hole_count to match submitted holes count
      await client.query(
        `UPDATE course_layouts SET hole_count = $1 WHERE id = $2`,
        [holes.length, layoutId]
      );

      await client.query('COMMIT');
      res.json({ saved: inserted.length, holes: inserted.sort((a, b) => a.hole_number - b.hole_number) });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Bulk upsert holes error:', err.message);
      res.status(500).json({ error: 'Failed to save holes' });
    } finally {
      client.release();
    }
  });

  return router;
};
