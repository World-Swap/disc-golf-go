// src/modules/auth/auth.repo.ts — data access for auth against the existing
// players + password_reset_tokens tables. Only SQL lives here.

import type { Queryable } from '../../db/types';

export interface PlayerRow {
  id: number;
  player_uuid: string;
  display_name: string;
  username: string | null;
  email: string | null;
  profile_photo_url: string | null;
  xp: number;
  created_at: Date;
}

export interface PlayerAuthRow extends PlayerRow {
  password_hash: string | null;
}

export interface GuestRow {
  id: number;
  player_uuid: string;
  display_name: string;
  xp: number;
  is_guest: boolean;
  onboarding_completed: boolean;
  experience_level: string | null;
}

export interface ResetTokenRow {
  id: number;
  player_id: number;
  used_at: Date | null;
  expires_at: Date;
}

export function createAuthRepo(db: Queryable) {
  return {
    /** Rows whose email OR username collide — used to detect signup conflicts. */
    async findConflicts(email: string, username: string) {
      const r = await db.query<{ email: string | null; username: string | null }>(
        'SELECT email, username FROM players WHERE email = $1 OR username = $2',
        [email, username]
      );
      return r.rows;
    },

    async insertPlayer(input: {
      playerUuid: string;
      displayName: string;
      username: string;
      email: string;
      passwordHash: string;
    }): Promise<PlayerRow> {
      const r = await db.query<PlayerRow>(
        `INSERT INTO players (player_uuid, display_name, username, email, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, player_uuid, display_name, username, email, xp, profile_photo_url, created_at`,
        [input.playerUuid, input.displayName, input.username, input.email, input.passwordHash]
      );
      return r.rows[0]!;
    },

    async findByEmailWithHash(email: string): Promise<PlayerAuthRow | null> {
      const r = await db.query<PlayerAuthRow>(
        `SELECT id, player_uuid, display_name, username, email, password_hash, xp, profile_photo_url, created_at
         FROM players WHERE email = $1`,
        [email]
      );
      return r.rows[0] ?? null;
    },

    async insertGuest(guestUuid: string): Promise<GuestRow> {
      const r = await db.query<GuestRow>(
        `INSERT INTO players (player_uuid, display_name, username, email, is_guest, guest_uuid)
         VALUES ($1, $2, $3, NULL, true, $1)
         RETURNING id, player_uuid, display_name, xp, is_guest, onboarding_completed, experience_level`,
        [guestUuid, 'Guest Player', 'guest_' + guestUuid.slice(0, 8)]
      );
      return r.rows[0]!;
    },

    async findByGuestUuid(guestUuid: string): Promise<GuestRow | null> {
      const r = await db.query<GuestRow>(
        `SELECT id, player_uuid, display_name, xp, is_guest, onboarding_completed, experience_level
         FROM players WHERE guest_uuid = $1 LIMIT 1`,
        [guestUuid]
      );
      return r.rows[0] ?? null;
    },

    // ── password reset ──
    async countRecentResetTokens(email: string): Promise<number> {
      const r = await db.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt
         FROM password_reset_tokens prt
         JOIN players p ON p.id = prt.player_id
         WHERE p.email = $1 AND prt.created_at > NOW() - INTERVAL '1 hour'`,
        [email]
      );
      return parseInt(r.rows[0]!.cnt, 10);
    },

    async findPlayerIdByEmail(email: string): Promise<number | null> {
      const r = await db.query<{ id: number }>('SELECT id FROM players WHERE email = $1', [email]);
      return r.rows[0]?.id ?? null;
    },

    async insertResetToken(playerId: number, token: string, expiresAt: Date): Promise<void> {
      await db.query(
        `INSERT INTO password_reset_tokens (player_id, token, expires_at) VALUES ($1, $2, $3)`,
        [playerId, token, expiresAt]
      );
    },

    async findResetToken(token: string): Promise<ResetTokenRow | null> {
      const r = await db.query<ResetTokenRow>(
        `SELECT id, player_id, used_at, expires_at FROM password_reset_tokens WHERE token = $1`,
        [token]
      );
      return r.rows[0] ?? null;
    },

    async updatePassword(playerId: number, passwordHash: string): Promise<void> {
      await db.query('UPDATE players SET password_hash = $1 WHERE id = $2', [passwordHash, playerId]);
    },

    /** Consume all of a player's outstanding (unused) reset tokens. */
    async consumeResetTokens(playerId: number): Promise<void> {
      await db.query(
        `UPDATE password_reset_tokens SET used_at = NOW() WHERE player_id = $1 AND used_at IS NULL`,
        [playerId]
      );
    },
  };
}

export type AuthRepo = ReturnType<typeof createAuthRepo>;
