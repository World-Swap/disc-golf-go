const express = require('express');
const { JWT_SECRET } = require('../middleware/auth');

// Haversine distance in meters
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

  // Get all courses (paginated)
  // Query: ?search=<text>&limit=<n>   (search matches name/city/state)
  router.get('/courses', async (req, res) => {
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
      console.error('Get courses error:', err.message);
      res.status(500).json({ error: 'Failed to get courses' });
    }
  });

  // Get total count of active courses (lightweight endpoint for landing page)
  router.get('/courses/count', async (_req, res) => {
    try {
      const result = await pool.query(
        `SELECT COUNT(*) AS total FROM courses WHERE is_active IS NOT FALSE`
      );
      const total = parseInt(result.rows[0].total, 10);
      // Cache for 5 minutes — count changes rarely
      res.set('Cache-Control', 'public, max-age=300');
      res.json({ total });
    } catch (err) {
      console.error('Course count error:', err.message);
      res.status(500).json({ error: 'Failed to get course count' });
    }
  });

  // Get nearby courses (sorted by distance)
  // ?lat=&lng=&radius=50000  — returns courses within radius sorted by distance (up to 20)
  // ?lat=&lng=&checkin_only=true — returns only courses within 500m (fast GPS check-in path)
  router.get('/courses/nearby', async (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const checkinOnly = req.query.checkin_only === 'true';
    const radiusMeters = checkinOnly ? 800 : (parseFloat(req.query.radius) || 50000); // 800m for check-in path, 50km default

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'lat and lng query params required' });
    }

    // Use a tighter bounding box (+1% margin) to reduce rows loaded for large radius queries.
    // Haversine math: at the equator, 1 degree ≈ 111km. Use 111.5km/deg as a conservative factor.
    const kmPerDeg = 111.5;
    const latBuffer = radiusMeters / 1000 / kmPerDeg;
    const lngBuffer = radiusMeters / 1000 / (kmPerDeg * Math.cos(lat * Math.PI / 180) || kmPerDeg);
    const minLat = lat - latBuffer;
    const maxLat = lat + latBuffer;
    const minLng = lng - lngBuffer;
    const maxLng = lng + lngBuffer;

    try {
      const result = await pool.query(
        `SELECT ${COURSE_LIST_COLS} FROM courses
         WHERE is_active IS NOT FALSE
           AND lat IS NOT NULL AND lng IS NOT NULL
           AND lat BETWEEN $1 AND $2
           AND lng BETWEEN $3 AND $4`,
        [minLat, maxLat, minLng, maxLng]
      );

      const nearby = result.rows
        .map(c => {
          const d = haversineMeters(lat, lng, parseFloat(c.lat), parseFloat(c.lng));
          return { ...c, distance_meters: Math.round(d) };
        })
        .filter(c => c.distance_meters <= radiusMeters)
        .sort((a, b) => a.distance_meters - b.distance_meters)
        .slice(0, checkinOnly ? 5 : 20);

      res.json(nearby);
    } catch (err) {
      console.error('Nearby courses error:', err.message);
      res.status(500).json({ error: 'Failed to get nearby courses' });
    }
  });

  // Map pins — lightweight: all courses + visited flag per player (optional auth)
  // Used by /map page. Returns: id, name, city, state, lat, lng, holes, par, visited
  // IMPORTANT: must be defined BEFORE /courses/:id to avoid wildcard swallowing "map-pins"
  router.get('/courses/map-pins', async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, name, city, state, lat, lng,
                COALESCE(hole_count, holes) AS holes, par
         FROM courses WHERE is_active IS NOT FALSE AND lat IS NOT NULL AND lng IS NOT NULL`
      );

      // Resolve player ID from JWT token or legacy X-Player-Id UUID header
      let visitedSet = new Set();
      let playerId = null;

      const token = req.headers.authorization?.split(' ')[1];
      if (token) {
        try {
          const jwt = require('jsonwebtoken');
          const decoded = jwt.verify(token, JWT_SECRET);
          playerId = decoded.id || decoded.player_id;
        } catch (_) { /* invalid/expired token — skip visited lookup */ }
      }

      // Fallback: legacy UUID-based session (X-Player-Id header)
      if (!playerId) {
        const playerUuid = req.headers['x-player-id'];
        if (playerUuid) {
          try {
            const uuidResult = await pool.query(
              'SELECT id FROM players WHERE player_uuid = $1',
              [playerUuid]
            );
            if (uuidResult.rows.length > 0) {
              playerId = uuidResult.rows[0].id;
            }
          } catch (_) { /* UUID lookup failed — skip visited */ }
        }
      }

      if (playerId) {
        const visited = await pool.query(
          `SELECT DISTINCT course_id FROM checkins WHERE player_id = $1`,
          [playerId]
        );
        visitedSet = new Set(visited.rows.map(r => r.course_id));
      }

      res.set('Cache-Control', 'no-cache');
      res.json(result.rows.map(c => ({
        ...c,
        holes: c.holes ? parseInt(c.holes, 10) : null,
        par: c.par ? parseInt(c.par, 10) : null,
        visited: visitedSet.has(c.id)
      })));
    } catch (err) {
      console.error('Map pins error:', err.message);
      res.status(500).json({ error: 'Failed to get map pins' });
    }
  });

  // Get course by ID (full detail)
  // Must come AFTER all literal /courses/* routes to avoid :id wildcard conflicts
  router.get('/courses/:id', async (req, res) => {
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

      const course = result.rows[0];

      // Also fetch check-in count and unique visitor count
      const statsResult = await pool.query(
        `SELECT
          COUNT(*) AS total_checkins,
          COUNT(DISTINCT player_id) AS unique_visitors
         FROM checkins WHERE course_id = $1`,
        [courseId]
      );
      const stats = statsResult.rows[0];

      res.json({
        ...course,
        total_checkins: parseInt(stats.total_checkins, 10),
        unique_visitors: parseInt(stats.unique_visitors, 10)
      });
    } catch (err) {
      console.error('Course detail error:', err.message);
      res.status(500).json({ error: 'Failed to get course detail' });
    }
  });

  return router;
};
