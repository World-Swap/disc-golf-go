// lib/email.js — single outbound email transport for the whole app.
// Currently proxies through the Polsia email API. This is the one place to
// change when swapping email providers; callers just pass to/subject/text/html.
//
// Missing POLSIA_API_KEY (e.g. local dev) is a warn-and-continue no-op so
// flows that fire email don't crash — email is always best-effort.

const EMAIL_ENDPOINT = 'https://polsia.com/api/proxy/email/send';

async function sendEmail({ to, subject, text, html }) {
  const apiKey = process.env.POLSIA_API_KEY;
  if (!apiKey) {
    console.warn('[email] POLSIA_API_KEY not set — skipping email to', to);
    return;
  }

  const res = await fetch(EMAIL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ to, subject, body: text, html }),
  });

  if (!res.ok) {
    throw new Error(`Email send failed with status ${res.status}`);
  }
}

module.exports = { sendEmail };
