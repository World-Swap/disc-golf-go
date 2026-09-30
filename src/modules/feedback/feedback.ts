// src/modules/feedback/feedback.ts — feedback and bug reports.
//
// The endpoint has existed for a while and stored reports in the `feedback`
// table. Two things were missing: nothing in web/ ever called it, so there was
// no way to file a report from the app at all; and nothing was ever emailed, so
// a report only existed if somebody thought to query the table.
//
// The database stays the source of truth and the email is a NOTIFICATION. They
// are ordered and handled accordingly: the insert happens first and its failure
// fails the request, while a failed send is logged and swallowed. Losing a
// report because a mail provider had a bad minute would be the worst outcome
// here, and the report is the thing worth keeping.
//
// Render env:
//   FEEDBACK_EMAIL — where reports go. Defaults to contact@discgolfgo.com.
//                    NOTE: every other address in this repo is @discgolfgo.app;
//                    if .com does not receive mail, set this rather than
//                    letting reports bounce silently.

import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { badRequest } from '../../http/errors';
import { rateLimit } from '../../middleware/rate-limit';
import { sendEmail as defaultSendEmail, type SendEmail } from '../../lib/email';
import type { Queryable } from '../../db/types';

const VALID_CATEGORIES = ['Feedback', 'Suggestion', 'Bug Report'];

/** Diagnostic fields the client may send. Anything else is ignored. */
const CONTEXT_KEYS = ['page', 'app_version', 'platform', 'screen', 'user_agent'] as const;

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function feedbackTo(): string {
  return process.env.FEEDBACK_EMAIL || 'contact@discgolfgo.com';
}

/** Keep only the known keys, as short strings. The client is not trusted. */
function cleanContext(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of CONTEXT_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 300);
  }
  return out;
}

function buildEmail(input: {
  category: string; message: string; name: string | null; email: string | null;
  playerId: number | null; context: Record<string, string>;
}) {
  const { category, message, name, email, playerId, context } = input;
  const who = name || (playerId ? `player #${playerId}` : 'anonymous');
  const lines = [
    `Category: ${category}`,
    `From:     ${who}${email ? ` <${email}>` : ''}`,
    playerId ? `Player:   #${playerId}` : 'Player:   not signed in',
    ...Object.entries(context).map(([k, v]) => `${(k + ':').padEnd(10)}${v}`),
    '',
    message,
  ];
  return {
    // The category leads the subject so bug reports can be filtered from praise.
    subject: `[${category}] ${message.replace(/\s+/g, ' ').slice(0, 60)}${message.length > 60 ? '…' : ''}`,
    text: lines.join('\n'),
    html:
      `<p><strong>${esc(category)}</strong> from ${esc(who)}` +
      `${email ? ` &lt;${esc(email)}&gt;` : ''}</p>` +
      (Object.keys(context).length
        ? `<ul>${Object.entries(context)
            .map(([k, v]) => `<li><strong>${esc(k)}:</strong> ${esc(v)}</li>`).join('')}</ul>`
        : '') +
      `<p style="white-space:pre-wrap">${esc(message)}</p>`,
  };
}

export function createFeedbackRouter(
  db: Queryable,
  optionalAuth: RequestHandler = (_req, _res, next) => next(),
  send: SendEmail = defaultSendEmail
): Router {
  const router = Router();

  router.post(
    '/feedback',
    // Public and unauthenticated, which this app has already learned means
    // "will be found by bots". Generous enough that a person reporting two
    // bugs in a row is never blocked.
    rateLimit({ name: 'feedback', windowMs: 60 * 60 * 1000, max: 10 }),
    optionalAuth,
    asyncHandler(async (req, res) => {
      const { name, email, category, message, context } = (req.body ?? {}) as Record<string, unknown>;

      if (typeof message !== 'string' || message.trim().length < 10) {
        throw badRequest('Message is required and must be at least 10 characters.');
      }
      if (typeof category !== 'string' || !VALID_CATEGORIES.includes(category)) {
        throw badRequest('Invalid category. Choose: Feedback, Suggestion, or Bug Report.');
      }

      const cleanName = typeof name === 'string' ? name.trim().slice(0, 100) || null : null;
      const cleanEmail = typeof email === 'string' ? email.trim().slice(0, 255) || null : null;
      const cleanMessage = message.trim().slice(0, 2000);
      const playerId = req.player?.id ?? null;
      const ctx = cleanContext(context);
      // The browser's own claim about itself, which the client cannot forge any
      // better than it already forges the header.
      const ua = req.headers['user-agent'];
      if (!ctx.user_agent && typeof ua === 'string') ctx.user_agent = ua.slice(0, 300);

      // First and mandatory: if this fails, the caller should know and retry.
      await db.query(
        `INSERT INTO feedback (name, email, category, message, player_id, context)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [cleanName, cleanEmail, category, cleanMessage, playerId, JSON.stringify(ctx)]
      );

      // Best effort. The report is already saved; a mail outage must not turn a
      // filed bug into a lost one, and must not show the reporter an error for
      // something that did in fact work.
      try {
        const mail = buildEmail({
          category, message: cleanMessage, name: cleanName,
          email: cleanEmail, playerId, context: ctx,
        });
        await send({ to: feedbackTo(), ...mail });
      } catch (err) {
        console.error('[feedback] stored but could not email:', (err as Error)?.message);
      }

      res.json({ success: true, message: 'Thanks — this is on its way to us.' });
    })
  );

  return router;
}
