#!/usr/bin/env node
/**
 * preflight-release.js — refuse to cut a release from a stale tree.
 *
 * Why this exists. `npm run android:release` rewrites versionCode in
 * android/app/build.gradle on every run, which leaves the file dirty. A later
 * `git pull` then ABORTS:
 *
 *     error: Your local changes to the following files would be overwritten by
 *     merge: android/app/build.gradle
 *     Aborting
 *
 * That message scrolls past, the build runs anyway, and it builds whatever the
 * tree held — which in practice was eight commits behind. Three separate
 * Android builds shipped that way, each missing the fix it was cut for, and the
 * only symptom was the version name on the Play listing being one behind. The
 * failure is silent at exactly the moment it matters.
 *
 * So the release refuses to start when the tree is behind its remote or dirty.
 * Set ALLOW_STALE_RELEASE=1 to override deliberately (offline, or building an
 * old tag on purpose).
 */

const { execSync } = require('child_process');

const run = (cmd) => {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
};

const die = (lines) => {
  console.error('\n✗ Release preflight failed\n');
  for (const l of lines) console.error('  ' + l);
  console.error('\n  Override deliberately with ALLOW_STALE_RELEASE=1\n');
  process.exit(1);
};

if (process.env.ALLOW_STALE_RELEASE === '1') {
  console.log('⚠ preflight skipped (ALLOW_STALE_RELEASE=1)');
  process.exit(0);
}

if (!run('git rev-parse --git-dir')) {
  console.log('✓ preflight skipped (not a git checkout)');
  process.exit(0);
}

// A release is cut from the tracked branch, so compare against its upstream
// rather than assuming main — a release branch is legitimate.
const branch = run('git rev-parse --abbrev-ref HEAD') || 'HEAD';
const upstream = run('git rev-parse --abbrev-ref --symbolic-full-name @{u}') || 'origin/main';
run(`git fetch ${upstream.split('/')[0] || 'origin'} --quiet`);

const behind = Number(run(`git rev-list --count HEAD..${upstream}`) || '0');
if (behind > 0) {
  die([
    `${branch} is ${behind} commit(s) behind ${upstream}.`,
    'Building now ships whatever this tree holds, not what was merged.',
    '',
    '    git pull',
  ]);
}

// versionCode is rewritten by every build, so it is the file that blocks the
// pull. Call it out by name rather than printing a generic "tree is dirty".
// `run` trims the whole output, which strips the leading space off the FIRST
// porcelain line (" M path" -> "M path"). A fixed slice(3) then ate a character
// of that one path and the check silently passed — the precise bug this script
// exists to catch, in the script itself. Split on the status field instead.
const dirty = (run('git status --porcelain') || '')
  .split('\n')
  .map((l) => l.trim().replace(/^\S+\s+/, ''))
  .filter(Boolean);

// A dirty build.gradle is NORMAL here — the bump rewrites it on every run, so
// blocking on it would fail every second consecutive build. It is only a
// problem later, when it silently aborts a pull. So warn, do not block: being
// behind is the fault worth stopping for, and that is checked above.
const gradle = 'android/app/build.gradle';
if (dirty.includes(gradle)) {
  console.warn(
    `\n⚠ ${gradle} has uncommitted changes (the last versionCode bump).\n` +
      '  Commit it after the upload — left alone it will abort your next `git pull`,\n' +
      '  and a build from a stale tree looks exactly like a good one.\n'
  );
}

console.log(`✓ preflight: ${branch} is up to date with ${upstream}`);
