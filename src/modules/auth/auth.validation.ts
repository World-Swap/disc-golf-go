// src/modules/auth/auth.validation.ts — request validation for auth endpoints.
// Hand-rolled (no external dep); throws AppError(400) which the central error
// handler renders as { error: message }.

import { badRequest } from '../../http/errors';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SignupInput {
  display_name: string;
  username: string;
  email: string;
  password: string;
  referral_code?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ResetInput {
  token: string;
  password: string;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function parseSignup(body: unknown): SignupInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const display_name = str(b.display_name);
  const username = str(b.username);
  const email = str(b.email);
  const password = str(b.password);

  if (!display_name || !username || !email || !password) {
    throw badRequest('display_name, username, email, and password are required');
  }
  if (display_name.length < 2 || display_name.length > 30) {
    throw badRequest('Display name must be 2-30 characters');
  }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    throw badRequest('Username must be 3-20 characters: letters, numbers, underscores only');
  }
  if (!EMAIL_RE.test(email)) {
    throw badRequest('Invalid email address');
  }
  if (password.length < 8) {
    throw badRequest('Password must be at least 8 characters');
  }

  const referral_code = typeof b.referral_code === 'string' ? b.referral_code : undefined;
  return { display_name, username, email, password, referral_code };
}

export function parseLogin(body: unknown): LoginInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const email = str(b.email);
  const password = str(b.password);
  if (!email || !password) throw badRequest('Email and password are required');
  return { email, password };
}

export function parseEmail(body: unknown): string {
  const email = str((body as Record<string, unknown>)?.email);
  if (!email || !EMAIL_RE.test(email)) throw badRequest('Valid email address required');
  return email;
}

export function parseReset(body: unknown): ResetInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const token = str(b.token);
  const password = str(b.password);
  if (!token) throw badRequest('Reset token is required');
  if (!password || password.length < 8) throw badRequest('Password must be at least 8 characters');
  return { token, password };
}
