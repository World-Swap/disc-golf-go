// src/lib/email.ts — single outbound email transport (Polsia proxy). The one
// place to change providers. Missing POLSIA_API_KEY is a warn-and-continue
// no-op so flows that fire email never crash — email is always best-effort.

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type SendEmail = (msg: EmailMessage) => Promise<void>;

const EMAIL_ENDPOINT = 'https://polsia.com/api/proxy/email/send';

export const sendEmail: SendEmail = async ({ to, subject, text, html }) => {
  const apiKey = process.env.POLSIA_API_KEY;
  if (!apiKey) {
    console.warn('[email] POLSIA_API_KEY not set — skipping email to', to);
    return;
  }

  const res = await fetch(EMAIL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ to, subject, body: text, html }),
  });

  if (!res.ok) {
    throw new Error(`Email send failed with status ${res.status}`);
  }
};
