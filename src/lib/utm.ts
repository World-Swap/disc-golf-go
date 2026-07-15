// src/lib/utm.ts — UTM tagging for outbound marketing links. Pure helper.

export interface UtmOpts {
  source?: string;
  medium?: string;
  campaign: string;
  content?: string;
  term?: string;
}

const UTM_DEFAULTS = { source: 'disc_golf_go', medium: 'app' };

/** Append UTM params to a URL, preserving any existing query + utm_* values. */
export function appendUtm(url: string, opts: UtmOpts): string {
  if (!url || !opts?.campaign) return url;

  const params = new URLSearchParams();
  params.set('utm_source', opts.source || UTM_DEFAULTS.source);
  params.set('utm_medium', opts.medium || UTM_DEFAULTS.medium);
  params.set('utm_campaign', opts.campaign);
  if (opts.content) params.set('utm_content', opts.content);
  if (opts.term) params.set('utm_term', opts.term);

  try {
    const parsed = new URL(url);
    for (const [k, v] of params.entries()) {
      if (!parsed.searchParams.has(k)) parsed.searchParams.set(k, v);
    }
    return parsed.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}${params.toString()}`;
  }
}
