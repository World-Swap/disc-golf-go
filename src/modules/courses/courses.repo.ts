// src/modules/courses/courses.repo.ts — data access for courses (read-only).

import type { Queryable } from '../../db/types';

// Lightweight columns for list / nearby views.
const LIST_COLS = `
  id, name, city, state, lat, lng,
  COALESCE(hole_count, holes) AS holes,
  par, terrain, difficulty, fees,
  pdga_rating, dgcoursereview_rating`;

// Full detail columns (includes hole_details JSONB for the per-hole scorecard).
const DETAIL_COLS = `
  id, name, city, state, lat, lng,
  COALESCE(hole_count, holes) AS holes,
  par, hole_count, course_length_ft,
  terrain, difficulty, amenities,
  fees, elevation_change_ft, designer, year_established,
  pdga_rating, dgcoursereview_rating,
  notable_features, is_active,
  rating, terrain_type, pdga_course_id,
  hole_details, created_at, updated_at`;

export interface CourseListRow {
  id: number;
  name: string;
  city: string | null;
  state: string | null;
  lat: string | null;
  lng: string | null;
  holes: number | null;
  par: number | null;
}

export function createCoursesRepo(db: Queryable) {
  return {
    async list(search: string | null, limit: number): Promise<CourseListRow[]> {
      const r = await db.query<CourseListRow>(
        `SELECT ${LIST_COLS} FROM courses
         WHERE is_active IS NOT FALSE
           AND ($1::text IS NULL OR name ILIKE '%' || $1 || '%'
                OR city ILIKE '%' || $1 || '%'
                OR state ILIKE '%' || $1 || '%')
         ORDER BY name ASC
         LIMIT $2`,
        [search, limit]
      );
      return r.rows;
    },

    async count(): Promise<number> {
      const r = await db.query<{ total: string }>('SELECT COUNT(*) AS total FROM courses WHERE is_active IS NOT FALSE');
      return parseInt(r.rows[0]?.total ?? '0', 10);
    },

    /** Active courses within a lat/lng bounding box (pre-filter before haversine). */
    async withinBox(minLat: number, maxLat: number, minLng: number, maxLng: number): Promise<CourseListRow[]> {
      const r = await db.query<CourseListRow>(
        `SELECT ${LIST_COLS} FROM courses
         WHERE is_active IS NOT FALSE
           AND lat IS NOT NULL AND lng IS NOT NULL
           AND lat BETWEEN $1 AND $2 AND lng BETWEEN $3 AND $4`,
        [minLat, maxLat, minLng, maxLng]
      );
      return r.rows;
    },

    async mapPins() {
      const r = await db.query<{ id: number; name: string; city: string | null; state: string | null; lat: string | null; lng: string | null; holes: string | null; par: string | null }>(
        `SELECT id, name, city, state, lat, lng, COALESCE(hole_count, holes) AS holes, par
         FROM courses WHERE is_active IS NOT FALSE AND lat IS NOT NULL AND lng IS NOT NULL`
      );
      return r.rows;
    },

    async visitedCourseIds(playerId: number): Promise<Set<number>> {
      const r = await db.query<{ course_id: number }>('SELECT DISTINCT course_id FROM checkins WHERE player_id = $1', [playerId]);
      return new Set(r.rows.map((row) => row.course_id));
    },

    async findById(id: number) {
      const r = await db.query(`SELECT ${DETAIL_COLS} FROM courses WHERE id = $1`, [id]);
      return r.rows[0] ?? null;
    },

    async checkinStats(id: number): Promise<{ total_checkins: number; unique_visitors: number }> {
      const r = await db.query<{ total_checkins: string; unique_visitors: string }>(
        'SELECT COUNT(*) AS total_checkins, COUNT(DISTINCT player_id) AS unique_visitors FROM checkins WHERE course_id = $1',
        [id]
      );
      return {
        total_checkins: parseInt(r.rows[0]?.total_checkins ?? '0', 10),
        unique_visitors: parseInt(r.rows[0]?.unique_visitors ?? '0', 10),
      };
    },
  };
}

export type CoursesRepo = ReturnType<typeof createCoursesRepo>;
