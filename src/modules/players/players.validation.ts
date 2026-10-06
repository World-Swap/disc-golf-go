// src/modules/players/players.validation.ts — validation for profile updates.

import { badRequest } from '../../http/errors';

export interface ProfileUpdate {
  display_name?: string;
  username?: string;
}

export function parseProfileUpdate(body: unknown): ProfileUpdate {
  const b = (body ?? {}) as Record<string, unknown>;
  const update: ProfileUpdate = {};

  if (b.display_name !== undefined) {
    const display_name = String(b.display_name);
    if (display_name.length < 2 || display_name.length > 30) {
      throw badRequest('Display name must be 2-30 characters');
    }
    update.display_name = display_name.trim();
  }

  if (b.username !== undefined) {
    const username = String(b.username);
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      throw badRequest('Username must be 3-20 characters: letters, numbers, underscores only');
    }
    update.username = username.toLowerCase();
    // There is one name now. The account form asks for the username alone, but
    // display_name is the column read by the leaderboards, the tournament
    // boards, reviews, check-ins and the admin tools -- thirty-odd files -- so
    // it is kept in step here rather than removed from all of them. A caller
    // that sends BOTH still wins on display_name (the line above), which is what
    // keeps the admin tools able to correct a name.
    if (b.display_name === undefined) update.display_name = update.username;
  }

  if (update.display_name === undefined && update.username === undefined) {
    throw badRequest('No fields to update');
  }
  return update;
}
