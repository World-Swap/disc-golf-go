// src/middleware/admin-auth.ts — admin password login + admin JWT verification.
// Admin login compares against ADMIN_PASSWORD (timing-safe) and issues a
// short-lived JWT; subsequent admin requests present it as x-admin-token.

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { RequestHandler } from 'express';
import { config } from '../config';
import { unauthorized } from '../http/errors';

const ADMIN_TOKEN_EXPIRY = '8h';

export function createAdminToken(): string {
  return jwt.sign({ role: 'admin', iat: Math.floor(Date.now() / 1000) }, config.adminJwtSecret, { expiresIn: ADMIN_TOKEN_EXPIRY });
}

export function verifyAdminPassword(provided: unknown): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof provided !== 'string' || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export const requireAdmin: RequestHandler = (req, _res, next) => {
  const token = req.headers['x-admin-token'];
  if (typeof token === 'string') {
    try {
      const decoded = jwt.verify(token, config.adminJwtSecret) as jwt.JwtPayload;
      if (decoded.role === 'admin') return next();
    } catch {
      /* fall through */
    }
  }
  return next(unauthorized('Admin authentication required'));
};
