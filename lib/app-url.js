// lib/app-url.js — canonical public base URL for building outbound links
// (password-reset emails, referral links, self-referencing API calls).
// Prefers APP_BASE_URL, falls back to the legacy APP_URL env var, then the
// live domain. Replaces the old scattered `disc-golf-go.polsia.app` fallbacks.
function appBaseUrl() {
  return process.env.APP_BASE_URL || process.env.APP_URL || 'https://discgolfgo.app';
}

module.exports = { appBaseUrl };
