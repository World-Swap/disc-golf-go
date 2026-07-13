'use strict';

/**
 * UTM tagging for outbound marketing links (referrals, email, tweet share).
 * Pure helper — no DB or network access.
 */

const UTM_DEFAULTS = Object.freeze({
  source: 'disc_golf_go',
  medium: 'app',
});

const REQUIRED_KEYS = ['source', 'medium', 'campaign'];

/**
 * Append UTM parameters to an existing URL.
 * - Preserves any existing query string.
 * - No-op if url is falsy or not a string.
 * - `source` / `medium` default to UTM_DEFAULTS when omitted; `campaign` is required.
 * - `content` and `term` are appended only when provided.
 *
 * @param {string} url
 * @param {{source?: string, medium?: string, campaign: string, content?: string, term?: string}} opts
 * @returns {string}
 */
function appendUtm(url, opts = {}) {
  if (!url || typeof url !== 'string') return url;
  if (!opts || typeof opts !== 'object') return url;

  const source = opts.source || UTM_DEFAULTS.source;
  const medium = opts.medium || UTM_DEFAULTS.medium;
  const campaign = opts.campaign;

  // campaign is the one field every caller must supply explicitly.
  if (!campaign) return url;

  let parsed;
  try {
    parsed = new URL(url);
  } catch (_e) {
    // Not a parseable absolute URL — fall through to string append below.
    parsed = null;
  }

  const params = new URLSearchParams();
  params.set('utm_source', source);
  params.set('utm_medium', medium);
  params.set('utm_campaign', campaign);
  if (opts.content) params.set('utm_content', opts.content);
  if (opts.term) params.set('utm_term', opts.term);

  const utmString = params.toString();
  if (!utmString) return url;

  if (parsed) {
    // Merge: don't clobber existing utm_* values if any.
    for (const [k, v] of params.entries()) {
      if (!parsed.searchParams.has(k)) parsed.searchParams.set(k, v);
    }
    return parsed.toString();
  }

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${utmString}`;
}

module.exports = { appendUtm, UTM_DEFAULTS, REQUIRED_KEYS };
