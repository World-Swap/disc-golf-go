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
  }

  if (update.display_name === undefined && update.username === undefined) {
    throw badRequest('No fields to update');
  }
  return update;
}
