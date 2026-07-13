// routes/courses.js — course listing, search, nearby/check-in lookup, map pins, detail.
// Read-only; no writes. Distance math lives in lib/geo.

const express = require('express');
const { optionalAuth } = require('../middleware/auth');
const { haversineMeters } = require('../lib/geo');

// Columns used in list/nearby views (lightweight)
const COURSE_LIST_COLS = `
  id, name, city, state, lat, lng,
  COALESCE(hole_count, holes) AS holes,
  par,
  terrain, difficulty, fees,
  pdga_rating, dgcoursereview_rating
`;

// All columns for detail view — includes hole_details JSONB for per-hole scorecard
const COURSE_DETAIL_COLS = `
  id, name, city, state, lat, lng,
  COALESCE(hole_count, holes) AS holes,
  par, hole_count, course_length_ft,
  terrain, difficulty, amenities,
  fees, elevation_change_ft, designer, year_established,
  pdga_rating, dgcoursereview_rating,
  notable_features, is_active,
  rating, terrain_type, pdga_course_id,
  hole_details,
  created_at, updated_at
`;

module.exports = ({ pool }) => {
  const router = express.Router();

  // GET /api/courses — all courses (paginated). ?search matches name/city/state.
  router.get('/courses', async (req, res, next) => {
    const { search, limit = 5000 } = req.query;
    const safeLimit = Math.min(5000, Math.max(1, parseInt(limit, 10) || 5000));
    try {
      const r = await pool.query(
        `SELECT ${COURSE_LIST_COLS} FROM courses
         WHERE is_active IS NOT FALSE
           AND ($1::text IS NULL OR name ILIKE '%' || $1 || '%'
                OR city ILIKE '%' || $1 || '%'
                OR state ILIKE '%' || $1 || '%')
         ORDER BY name ASC
         LIMIT $2`,
        [search || null, safeLimit]
      );
      res.json({ courses: r.rows });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/courses/count — total active courses (lightweight, for landing page).
  router.get('/courses/count', async (_req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT COUNT(*) AS total FROM courses WHERE is_active IS NOT FALSE`
      );
      const total = parseInt(result.rows[0].total, 10);
      res.set('Cache-Control', 'public, max-age=300'); // count changes rarely
      res.json({ total });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/courses/nearby — courses within radius, sorted by distance.
  // ?lat=&lng=&radius=50000                — up to 20 within radius (50km default)
  // ?lat=&lng=&checkin_only=true           — up to 5 within 800m (GPS check-in path)
  router.get('/courses/nearby', async (req, res, next) => {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const checkinOnly = req.query.checkin_only === 'true';
    const radiusMeters = checkinOnly ? 800 : (parseFloat(req.query.radius) || 50000);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'lat and lng query params required' });
    }

    // Tighten to a bounding box first to reduce rows loaded for large-radius queries.
    // At the equator 1 degree ≈ 111km; use 111.5km/deg as a conservative factor.
    const kmPerDeg = 111.5;
    const latBuffer = radiusMeters / 1000 / kmPerDeg;
    const lngBuffer = radiusMeters / 1000 / (kmPerDeg * Math.cos(lat * Math.PI / 180) || kmPerDeg);

    try {
      const result = await pool.query(
        `SELECT ${COURSE_LIST_COLS} FROM courses
         WHERE is_active IS NOT FALSE
           AND lat IS NOT NULL AND lng IS NOT NULL
           AND lat BETWEEN $1 AND $2
           AND lng BETWEEN $3 AND $4`,
        [lat - latBuffer, lat + latBuffer, lng - lngBuffer, lng + lngBuffer]
      );

      const nearby = result.rows
        .map(c => ({ ...c, distance_meters: Math.round(haversineMeters(lat, lng, parseFloat(c.lat), parseFloat(c.lng))) }))
        .filter(c => c.distance_meters <= radiusMeters)
        .sort((a, b) => a.distance_meters - b.distance_meters)
        .slice(0, checkinOnly ? 5 : 20);

      res.json(nearby);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/courses/map-pins — all courses + per-player "visited" flag (optional auth).
  // MUST be defined before /courses/:id so the wildcard doesn't swallow "map-pins".
  router.get('/courses/map-pins', optionalAuth(pool), async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT id, name, city, state, lat, lng,
                COALESCE(hole_count, holes) AS holes, par
         FROM courses WHERE is_active IS NOT FALSE AND lat IS NOT NULL AND lng IS NOT NULL`
      );

      let visitedSet = new Set();
      if (req.player) {
        const visited = await pool.query(
          `SELECT DISTINCT course_id FROM checkins WHERE player_id = $1`,
          [req.player.id]
        );
        visitedSet = new Set(visited.rows.map(r => r.course_id));
      }

      res.set('Cache-Control', 'no-cache');
      res.json(result.rows.map(c => ({
        ...c,
        holes: c.holes ? parseInt(c.holes, 10) : null,
        par: c.par ? parseInt(c.par, 10) : null,
        visited: visitedSet.has(c.id),
      })));
    } catch (err) {
      next(err);
    }
  });

  // GET /api/courses/:id — full course detail + check-in stats.
  // MUST come after all literal /courses/* routes to avoid :id swallowing them.
  router.get('/courses/:id', async (req, res, next) => {
    const courseId = parseInt(req.params.id, 10);
    if (isNaN(courseId)) {
      return res.status(400).json({ error: 'Invalid course ID' });
    }

    try {
      const result = await pool.query(
        `SELECT ${COURSE_DETAIL_COLS} FROM courses WHERE id = $1`,
        [courseId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Course not found' });
      }

      const stats = await pool.query(
        `SELECT COUNT(*) AS total_checkins, COUNT(DISTINCT player_id) AS unique_visitors
         FROM checkins WHERE course_id = $1`,
        [courseId]
      );

      res.json({
        ...result.rows[0],
        total_checkins: parseInt(stats.rows[0].total_checkins, 10),
        unique_visitors: parseInt(stats.rows[0].unique_visitors, 10),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
