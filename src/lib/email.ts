// src/lib/email.ts — single outbound email transport (Resend). The one place to
// change providers. Missing RESEND_API_KEY is a warn-and-continue no-op so flows
// that fire email never crash — email is always best-effort. A non-2xx response
// throws so the caller can log the real reason.
//
// Required Render env:
//   RESEND_API_KEY  — from resend.com › API Keys
//   EMAIL_FROM      — verified sender, e.g. "Disc Golf Go <no-reply@discgolfgo.com>"
//                     (defaults to Resend's shared onboarding sender for testing)
//
// EVERY address in this app is on discgolfgo.com. Resend is verified for .com
// and .com alone; discgolfgo.app has never had mail of any kind, sending or
// receiving. The example above said .app for a while, which is misleading in
// the most expensive direction -- copy it into EMAIL_FROM and Resend rejects
// every send, so password resets, deletion confirmations and bug reports all
// stop at once and nothing in the app reports it.
//
// The sender and the reply address are still different things (a sender needs
// no inbox), but here they are on the same domain, so there is no case for an
// address on .app anywhere. A test enforces that.

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type SendEmail = (msg: EmailMessage) => Promise<void>;

const EMAIL_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Disc Golf Go <onboarding@resend.dev>';

export const sendEmail: SendEmail = async ({ to, subject, text, html }) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set — skipping email to', to);
    return;
  }

  const res = await fetch(EMAIL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || DEFAULT_FROM, to: [to], subject, text, html }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Email send failed with status ${res.status}${detail ? `: ${detail}` : ''}`);
  }
};
