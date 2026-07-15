// src/modules/auth/auth.service.ts — auth business logic. Depends only on the
// repo + injected collaborators (email sender, base URL), so it unit-tests
// without HTTP or a live DB.

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { conflict, unauthorized, badRequest } from '../../http/errors';
import { createToken } from '../../middleware/auth';
import type { SendEmail } from '../../lib/email';
import type { AuthRepo } from './auth.repo';
import { toPublicPlayer, toGuestPlayer, toGuestStatusPlayer, type PublicPlayer } from './auth.view';
import { type SignupInput, type LoginInput, type ResetInput } from './auth.validation';

const BCRYPT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_RESET_TOKENS_PER_HOUR = 3;

export interface AuthServiceDeps {
  repo: AuthRepo;
  sendEmail: SendEmail;
  appBaseUrl: string;
}

export interface AuthResult {
  token: string;
  player: PublicPlayer;
}

export function createAuthService({ repo, sendEmail, appBaseUrl }: AuthServiceDeps) {
  async function sendResetEmail(toEmail: string, resetToken: string): Promise<void> {
    const resetUrl = `${appBaseUrl}/reset-password?token=${resetToken}`;
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0a0a1a;color:#fff;border-radius:12px;overflow:hidden;">
        <div style="background:#7ed957;padding:20px 24px;">
          <p style="margin:0;font-size:1.2rem;font-weight:700;color:#0a0a1a;">🥏 Disc Golf Go</p>
        </div>
        <div style="padding:32px 24px;">
          <h1 style="margin:0 0 12px;font-size:1.5rem;">Reset your password</h1>
          <p style="color:#aaa;margin-bottom:24px;">Click the button below to choose a new password. This link expires in <strong style="color:#fff;">1 hour</strong>.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#7ed957;color:#0a0a1a;padding:14px 28px;border-radius:10px;font-weight:700;text-decoration:none;font-size:1rem;">Reset Password →</a>
          <p style="color:#666;font-size:0.8rem;margin-top:24px;">If you didn't request this, you can safely ignore this email. Your password won't change.</p>
        </div>
      </div>`;
    await sendEmail({
      to: toEmail,
      subject: 'Reset your Disc Golf Go password',
      text: `Reset your Disc Golf Go password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
      html,
    });
  }

  return {
    async signup(input: SignupInput): Promise<AuthResult> {
      const email = input.email.toLowerCase();
      const username = input.username.toLowerCase();

      const conflicts = await repo.findConflicts(email, username);
      if (conflicts.some((r) => r.email === email)) {
        throw conflict('An account with that email already exists');
      }
      if (conflicts.length > 0) {
        throw conflict('That username is already taken');
      }

      const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
      const player = await repo.insertPlayer({
        playerUuid: crypto.randomUUID(),
        displayName: input.display_name.trim(),
        username,
        email,
        passwordHash,
      });

      // NOTE: referral_code claim is handled by the referrals module (later phase).
      const token = createToken({ id: player.id, player_uuid: player.player_uuid });
      return { token, player: toPublicPlayer(player) };
    },

    async login({ email, password }: LoginInput): Promise<AuthResult> {
      const player = await repo.findByEmailWithHash(email.toLowerCase());
      if (!player) throw unauthorized('Invalid email or password');
      if (!player.password_hash) {
        throw unauthorized('This account was created before passwords were added. Please sign up again.');
      }
      const valid = await bcrypt.compare(password, player.password_hash);
      if (!valid) throw unauthorized('Invalid email or password');

      const token = createToken({ id: player.id, player_uuid: player.player_uuid });
      return { token, player: toPublicPlayer(player) };
    },

    async createGuest() {
      const guestUuid = crypto.randomUUID();
      const player = await repo.insertGuest(guestUuid);
      const token = createToken({ id: player.id, player_uuid: player.player_uuid });
      return { token, player: toGuestPlayer(player) };
    },

    /** Always resolves (no leak of whether the email exists). */
    async requestPasswordReset(email: string): Promise<void> {
      const normalized = email.toLowerCase().trim();

      if ((await repo.countRecentResetTokens(normalized)) >= MAX_RESET_TOKENS_PER_HOUR) {
        return; // silently throttle — don't reveal rate-limit state
      }

      const playerId = await repo.findPlayerIdByEmail(normalized);
      if (playerId == null) return;

      const token = crypto.randomBytes(32).toString('hex');
      await repo.insertResetToken(playerId, token, new Date(Date.now() + RESET_TOKEN_TTL_MS));

      // fire-and-forget — don't block the response on delivery
      void sendResetEmail(normalized, token).catch((err) =>
        console.error('[auth] password reset email failed:', (err as Error).message)
      );
    },

    async resetPassword({ token, password }: ResetInput): Promise<void> {
      const row = await repo.findResetToken(token);
      if (!row) throw badRequest('Invalid or expired reset link. Please request a new one.');
      if (row.used_at) throw badRequest('This reset link has already been used. Please request a new one.');
      if (new Date(row.expires_at) < new Date()) {
        throw badRequest('This reset link has expired. Please request a new one.');
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await repo.updatePassword(row.player_id, passwordHash);
      await repo.consumeResetTokens(row.player_id);
    },

    async verifyResetToken(token: string) {
      const row = await repo.findResetToken(token);
      if (!row) return { valid: false as const, error: 'invalid' };
      if (row.used_at) return { valid: false as const, error: 'used' };
      if (new Date(row.expires_at) < new Date()) return { valid: false as const, error: 'expired' };
      return { valid: true as const };
    },

    async guestStatus(guestUuid: string) {
      const p = await repo.findByGuestUuid(guestUuid);
      if (!p) return { valid: false as const };
      return { valid: true as const, player: toGuestStatusPlayer(p) };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
