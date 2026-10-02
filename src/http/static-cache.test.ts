// Navigation cost. Every page requests four versioned assets, so whether they
// are cached decides how many blocking round trips a tab tap makes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mountFrontend } from './static';

function serve(): { url: string; close: () => Promise<void> } {
  const app = express();
  mountFrontend(app);
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

test('a versioned asset is cached for a year, so navigation stops revalidating it', async () => {
  const s = serve();
  try {
    for (const path of ['/styles/app-ui.css?v=w13', '/js/app.js?v=w11', '/styles/tokens.css?v=w10']) {
      const res = await fetch(s.url + path);
      assert.equal(res.status, 200, `${path} should serve`);
      assert.match(
        res.headers.get('cache-control') ?? '',
        /max-age=31536000/,
        `${path} carries a version, so it must not be revalidated on every tap`
      );
      assert.match(res.headers.get('cache-control') ?? '', /immutable/, `${path} should be immutable`);
    }
  } finally {
    await s.close();
  }
});

test('the SAME file without a version is still revalidated', async () => {
  // The guard that stops an unversioned reference being pinned to a stale copy
  // for a year — the one real risk of an immutable policy.
  const s = serve();
  try {
    const res = await fetch(s.url + '/styles/app-ui.css');
    assert.equal(res.status, 200);
    assert.doesNotMatch(
      res.headers.get('cache-control') ?? '',
      /immutable|max-age=31536000/,
      'without ?v= there is nothing to guarantee freshness, so it must revalidate'
    );
  } finally {
    await s.close();
  }
});

test('an HTML page is never cached long, so a deploy is visible at once', async () => {
  const s = serve();
  try {
    const res = await fetch(s.url + '/home');
    assert.equal(res.status, 200);
    assert.doesNotMatch(
      res.headers.get('cache-control') ?? '',
      /max-age=31536000|immutable/,
      'pages must not be pinned — they are how a Render deploy reaches players'
    );
  } finally {
    await s.close();
  }
});

test('unversioned art keeps its own shorter cache', async () => {
  const s = serve();
  try {
    const res = await fetch(s.url + '/img/cards/throw-lab.webp');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control') ?? '', /max-age=3600/);
  } finally {
    await s.close();
  }
});
