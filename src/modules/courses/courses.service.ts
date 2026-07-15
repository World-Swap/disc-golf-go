// src/modules/courses/courses.service.ts — courses logic: search, nearby
// (bounding box + haversine sort), map pins with per-player visited flag, detail.

import { notFound } from '../../http/errors';
import { haversineMeters } from '../../lib/geo';
import { createCoursesRepo, type CoursesRepo, type CourseListRow } from './courses.repo';
import type { Queryable } from '../../db/types';

const KM_PER_DEG = 111.5; // conservative deg→km near the equator
const CHECKIN_RADIUS_M = 800;
const DEFAULT_RADIUS_M = 50_000;

export interface NearbyQuery {
  lat: number;
  lng: number;
  checkinOnly: boolean;
  radius?: number;
}

export function createCoursesService(db: Queryable, repo: CoursesRepo = createCoursesRepo(db)) {
  return {
    async search(search: string | null, limit: number) {
      const safeLimit = Math.min(5000, Math.max(1, limit || 5000));
      return { courses: await repo.list(search, safeLimit) };
    },

    count() {
      return repo.count();
    },

    async nearby({ lat, lng, checkinOnly, radius }: NearbyQuery) {
      const radiusMeters = checkinOnly ? CHECKIN_RADIUS_M : radius || DEFAULT_RADIUS_M;
      const latBuffer = radiusMeters / 1000 / KM_PER_DEG;
      const lngBuffer = radiusMeters / 1000 / (KM_PER_DEG * Math.cos((lat * Math.PI) / 180) || KM_PER_DEG);

      const rows = await repo.withinBox(lat - latBuffer, lat + latBuffer, lng - lngBuffer, lng + lngBuffer);

      return rows
        .map((c) => ({ ...c, distance_meters: Math.round(haversineMeters(lat, lng, parseFloat(c.lat!), parseFloat(c.lng!))) }))
        .filter((c) => c.distance_meters <= radiusMeters)
        .sort((a, b) => a.distance_meters - b.distance_meters)
        .slice(0, checkinOnly ? 5 : 20);
    },

    async mapPins(playerId: number | null) {
      const [pins, visited] = await Promise.all([
        repo.mapPins(),
        playerId ? repo.visitedCourseIds(playerId) : Promise.resolve(new Set<number>()),
      ]);
      return pins.map((c) => ({
        ...c,
        holes: c.holes ? parseInt(c.holes, 10) : null,
        par: c.par ? parseInt(c.par, 10) : null,
        visited: visited.has(c.id),
      }));
    },

    async detail(id: number) {
      const course = await repo.findById(id);
      if (!course) throw notFound('Course not found');
      const stats = await repo.checkinStats(id);
      return { ...course, ...stats };
    },
  };
}

export type CoursesService = ReturnType<typeof createCoursesService>;
export type { CourseListRow };
