// src/lib/email.ts — single outbound email transport (Resend). The one place to
// change providers. Missing RESEND_API_KEY is a warn-and-continue no-op so flows
// that fire email never crash — email is always best-effort. A non-2xx response
// throws so the caller can log the real reason.
//
// Required Render env:
//   RESEND_API_KEY  — from resend.com › API Keys
//   EMAIL_FROM      — verified sender, e.g. "Disc Golf Go <no-reply@discgolfgo.app>"
//                     (defaults to Resend's shared onboarding sender for testing)
//
// The SENDER and the CONTACT address are different things and only one of them
// needs an inbox. discgolfgo.app receives no mail at all, so every address a
// human is told to write to is contact@discgolfgo.com -- but a domain can be
// verified for SENDING without receiving, so EMAIL_FROM may legitimately stay
// on .app. Do not "fix" it to match the contact address without checking which
// domain is actually verified in Resend: change it to an unverified one and
// every outbound email in the app stops.

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
