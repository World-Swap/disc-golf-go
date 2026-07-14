// src/modules/delete-account/delete-account.service.ts — GDPR deletion.

import { badRequest } from '../../http/errors';
import { sendEmail, type SendEmail } from '../../lib/email';
import type { Database } from '../../db/types';
import { createDeleteAccountRepo, type DeleteAccountRepo } from './delete-account.repo';

function deletionConfirmation(email: string, displayName: string | null) {
  const name = displayName || 'there';
  return {
    to: email,
    subject: 'Your Disc Golf Go account deletion request',
    text: `Hi ${name},\n\nWe received your request to delete your Disc Golf Go account.\n\nYour account and all associated data will be permanently deleted within 48 hours.\n\nThis action cannot be undone.\n\nIf you did not request this, contact us at contact@discgolfgo.app immediately.\n\n— The Disc Golf Go Team`,
    html: `<p>Hi ${name},</p><p>We received your request to delete your Disc Golf Go account.</p><p>Your account and all associated data will be <strong>permanently deleted within 48 hours</strong>.</p><p>This action cannot be undone.</p><p>If you did not request this, contact us at <a href="mailto:contact@discgolfgo.app">contact@discgolfgo.app</a> immediately.</p><p>— The Disc Golf Go Team</p>`,
  };
}

function requestReceived(email: string) {
  return {
    to: email,
    subject: 'Disc Golf Go — Account deletion request received',
    text: `We received a request to delete the Disc Golf Go account for this email.\n\nIf an account exists, all associated data will be permanently removed within 48 hours.\n\nIf you did not make this request, you can ignore this email.\n\n— The Disc Golf Go Team`,
    html: `<p>We received a request to delete the Disc Golf Go account for this email.</p><p>If an account exists, all associated data will be <strong>permanently removed within 48 hours</strong>.</p><p>If you did not make this request, you can ignore this email.</p><p>— The Disc Golf Go Team</p>`,
  };
}

export interface DeleteAccountDeps {
  db: Database;
  repo?: DeleteAccountRepo;
  send?: SendEmail;
}

export function createDeleteAccountService({ db, repo = createDeleteAccountRepo(db), send = sendEmail }: DeleteAccountDeps) {
  return {
    async deleteAccount(playerId: number) {
      const contact = await repo.playerContact(playerId);
      await repo.deleteAllData(playerId);
      if (contact?.email) {
        void send(deletionConfirmation(contact.email, contact.display_name)).catch(() => {});
      }
      return { success: true, message: 'Account deleted' };
    },

    // Always returns success (privacy — never reveals whether the account exists).
    async requestDeletion(emailRaw: unknown) {
      const email = String(emailRaw ?? '');
      if (!email.includes('@')) throw badRequest('Valid email address is required');
      const normalized = email.toLowerCase().trim();

      if ((await repo.findIdByEmail(normalized)) != null) {
        await repo.upsertDeletionRequest(normalized);
        void send(requestReceived(normalized)).catch(() => {});
      }
      return { success: true };
    },
  };
}

export type DeleteAccountService = ReturnType<typeof createDeleteAccountService>;
