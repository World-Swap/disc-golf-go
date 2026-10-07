// src/http/inline-script.test.ts — every inline <script> in web/ must parse.
//
// This exists because a one-line edit to profile.html shipped a LITERAL NEWLINE
// inside a single-quoted JavaScript string, which is a syntax error, which
// killed the whole page script, which left the Profile tab stuck on "Loading…"
// in production. Nothing caught it: it is valid-looking HTML, the server serves
// it happily, and the page that was verified in a browser was a different one.
//
// CLAUDE.md already recorded this exact trap for this exact file -- an
// apostrophe in "What's new" once ended the same kind of string and killed Home
// and Profile -- so a note was not enough and a test is.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const WEB = join(__dirname, '../../web');

/** Inline scripts only: src= ones are files, and ld+json is data, not code. */
function inlineScripts(html: string): string[] {
  const out: string[] = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const attrs = m[1] ?? '';
    if (/\bsrc=/.test(attrs)) continue;
    if (/type\s*=\s*["'](?!text\/javascript|module)/.test(attrs)) continue; // ld+json etc.
    out.push(m[2] ?? '');
  }
  return out;
}

test('every inline script in web/ is syntactically valid JavaScript', () => {
  const broken: string[] = [];
  for (const file of readdirSync(WEB).filter((f) => f.endsWith('.html'))) {
    const html = readFileSync(join(WEB, file), 'utf8');
    inlineScripts(html).forEach((code, i) => {
      try {
        // Compile only -- never run. Browser globals are absent here, and a
        // syntax error is what we are hunting.
        new vm.Script(code, { filename: `${file}#${i}` });
      } catch (e) {
        broken.push(`${file} script#${i}: ${(e as Error).message}`);
      }
    });
  }
  assert.deepEqual(broken, [], 'these pages would die on load');
});
