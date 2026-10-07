// src/db/ssl.ts — decide TLS for a Postgres connection string.
//
// This replaces `databaseUrl.includes('localhost')`, which was wrong in both
// directions because it was a substring match over the WHOLE url:
//
//   * A local database addressed as 127.0.0.1 (or ::1, or a unix socket) did
//     NOT contain "localhost", so TLS was forced on and the connection failed
//     with "The server does not support SSL connections". Annoying, and it cost
//     a confusing detour while testing the startup probe.
//   * Far worse in the other direction: any REMOTE url with "localhost"
//     anywhere in it -- in the password, in a query parameter, in a hostname
//     like localhost.example.com -- disabled TLS and sent credentials to a
//     remote host in the clear, silently.
//
// So the decision is made on the parsed HOSTNAME, never on the raw string, and
// an explicit sslmode in the url wins over any guess.

/** Loopback and local-socket hosts, where TLS is pointless rather than absent. */
function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  if (h === '') return true;                 // unix socket: postgres:///db?host=/var/run
  if (h === 'localhost') return true;
  if (h.endsWith('.localhost')) return true; // RFC 6761
  if (h === '::1' || h === '0:0:0:0:0:0:0:1') return true;
  if (h === '0.0.0.0' || h === '::') return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h); // the whole 127.0.0.0/8 block
}

export type SslSetting = false | { rejectUnauthorized: boolean };

/**
 * `false` disables TLS; an object enables it.
 *
 * `rejectUnauthorized: false` stays the default for remote hosts because that
 * is what this app has always sent to Neon, and quietly tightening it could
 * fail a deploy. `sslmode=verify-full` is the opt-in for real certificate
 * verification.
 */
export function sslConfigFor(connectionString: string): SslSetting {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    // Unparseable (e.g. a libpq key=value DSN). Fail CLOSED: a connection that
    // fails loudly beats one that silently ships credentials in plaintext.
    return { rejectUnauthorized: false };
  }

  // An explicit sslmode is a statement of intent; honour it over any heuristic.
  const mode = url.searchParams.get('sslmode')?.toLowerCase();
  if (mode === 'disable') return false;
  if (mode === 'verify-full') return { rejectUnauthorized: true };
  if (mode) return { rejectUnauthorized: false }; // require / prefer / verify-ca / allow

  return isLocalHost(url.hostname) ? false : { rejectUnauthorized: false };
}
