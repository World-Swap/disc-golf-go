// src/modules/checkins/checkins.validation.ts — validate the check-in body.

import { badRequest } from '../../http/errors';

export interface CheckinInput {
  course_id: number;
  player_lat: number;
  player_lng: number;
  is_round_complete: boolean;
  holes_logged: number | null;
  weather_condition: string | null;
}

export function parseCheckin(body: unknown): CheckinInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const course_id = Number(b.course_id);
  const player_lat = Number(b.player_lat);
  const player_lng = Number(b.player_lng);

  if (!course_id || b.player_lat === undefined || b.player_lng === undefined || Number.isNaN(player_lat) || Number.isNaN(player_lng)) {
    throw badRequest('course_id, player_lat, and player_lng are required');
  }

  return {
    course_id,
    player_lat,
    player_lng,
    is_round_complete: Boolean(b.is_round_complete),
    holes_logged: b.holes_logged != null ? Number(b.holes_logged) : null,
    weather_condition: typeof b.weather_condition === 'string' ? b.weather_condition : null,
  };
}
