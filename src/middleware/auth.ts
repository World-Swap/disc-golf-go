// src/middleware/auth.ts — JWT creation/verification + auth middleware.
// requireAuth rejects unauthenticated requests; optionalAuth attaches the
// player when present but never rejects. Both accept the legacy X-Player-Id
// UUID header for backward compat and take a Queryable so they're testable.

import jwt from 'jsonwebtoken';
import type { Request, RequestHandler } from 'express';
import { config } from '../config';
import type { Queryable } from '../db/types';
import { unauthorized } from '../http/errors';

export interface AuthPlayer {
  id: number;
  player_uuid: string;
}

export function createToken(payload: AuthPlayer): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '90d' });
}

export function verifyToken(token: string): AuthPlayer {
  const decoded = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
  return { id: decoded.id as number, player_uuid: decoded.player_uuid as string };
}

function bearerToken(req: Request): string | null {
  const header = req.headers['authorization'];
  return header && header.startsWith('Bearer ') ? header.slice(7) : null;
}

async function resolveLegacyUuid(db: Queryable, req: Request): Promise<AuthPlayer | null> {
  const uuid = req.headers['x-player-id'];
  if (typeof uuid !== 'string' || !uuid) return null;
  const result = await db.query<AuthPlayer>('SELECT id, player_uuid FROM players WHERE player_uuid = $1', [uuid]);
  return result.rows[0] ?? null;
}

export function requireAuth(db: Queryable): RequestHandler {
  return async (req, _res, next) => {
    const token = bearerToken(req);
    if (token) {
      try {
        req.player = verifyToken(token);
        return next();
      } catch {
        return next(unauthorized('Invalid or expired token'));
      }
    }
    try {
      const player = await resolveLegacyUuid(db, req);
      if (player) {
        req.player = player;
        return next();
      }
    } catch (err) {
      console.warn('[auth] legacy UUID lookup failed:', (err as Error).message);
    }
    return next(unauthorized());
  };
}

export function optionalAuth(db: Queryable): RequestHandler {
  return async (req, _res, next) => {
    const token = bearerToken(req);
    if (token) {
      try {
        req.player = verifyToken(token);
        return next();
      } catch {
        /* invalid token — continue anonymously */
      }
    }
    try {
      const player = await resolveLegacyUuid(db, req);
      if (player) req.player = player;
    } catch (err) {
      console.warn('[auth] optional UUID lookup failed:', (err as Error).message);
    }
    return next();
  };
}
