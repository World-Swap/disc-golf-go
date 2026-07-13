// src/modules/auth/auth.view.ts — shape player rows into the public API payload
// returned by auth endpoints. Level fields come from the progression module.

import { getLevelFromXp, getLevelProgress, type LevelProgress } from '../progression/level';
import type { PlayerRow, GuestRow } from './auth.repo';

export interface PublicPlayer {
  id: number;
  display_name: string;
  username: string | null;
  email: string | null;
  profile_photo_url: string | null;
  xp: number;
  level: number;
  level_progress: LevelProgress;
}

export function toPublicPlayer(p: PlayerRow): PublicPlayer {
  return {
    id: p.id,
    display_name: p.display_name,
    username: p.username,
    email: p.email,
    profile_photo_url: p.profile_photo_url,
    xp: p.xp,
    level: getLevelFromXp(p.xp),
    level_progress: getLevelProgress(p.xp),
  };
}

export function toGuestPlayer(p: GuestRow) {
  return {
    id: p.id,
    display_name: p.display_name,
    is_guest: true,
    xp: p.xp,
    level: getLevelFromXp(p.xp),
    level_progress: getLevelProgress(p.xp),
  };
}

/** Fuller guest shape for the guest-status endpoint (persisted guest identity). */
export function toGuestStatusPlayer(p: GuestRow) {
  return {
    id: p.id,
    player_uuid: p.player_uuid,
    display_name: p.display_name,
    xp: p.xp,
    is_guest: p.is_guest,
    onboarding_completed: p.onboarding_completed,
    experience_level: p.experience_level,
    level: getLevelFromXp(p.xp),
    level_progress: getLevelProgress(p.xp),
  };
}
