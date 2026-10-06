import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodePhoto, photoUrl, MAX_BYTES } from './photo';

// Real headers, not invented ones: a test built from bytes I made up would pass
// against a decoder that was also wrong about them.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'), Buffer.from([0x1a, 0, 0, 0]),
  Buffer.from('WEBP', 'ascii'), Buffer.from('VP8 ', 'ascii'),
]);
const uri = (mime: string, b: Buffer) => `data:${mime};base64,${b.toString('base64')}`;

test('the photo decoder only accepts what it can safely serve back', async (t) => {
  await t.test('a real PNG, JPEG and WebP all pass', () => {
    for (const [mime, buf] of [['image/png', PNG], ['image/jpeg', JPEG], ['image/webp', WEBP]] as const) {
      const out = decodePhoto(uri(mime, buf));
      assert.equal(out.mime, mime);
      assert.ok(out.bytes.equals(buf), `${mime} bytes should survive the round trip`);
    }
  });

  // The whole point of checking magic bytes. The declared type is a string the
  // caller chose; without this, anything at all could be stored and then served
  // back from our own domain under an image content-type.
  await t.test('bytes that are not the declared type are refused', () => {
    assert.throws(() => decodePhoto(uri('image/png', JPEG)), /not a PNG/);
    assert.throws(() => decodePhoto(uri('image/webp', PNG)), /not a WEBP/);
    assert.throws(
      () => decodePhoto(uri('image/png', Buffer.from('<?php echo 1; ?>', 'utf8'))),
      /not a PNG/
    );
  });

  await t.test('only image types we chose are allowed', () => {
    assert.throws(() => decodePhoto(uri('image/svg+xml', PNG)), /PNG, JPEG or WebP/);
    assert.throws(() => decodePhoto(uri('text/html', PNG)), /PNG, JPEG or WebP/);
  });

  await t.test('junk in place of a data URI is refused, not crashed on', () => {
    for (const bad of ['', '   ', 'not-a-uri', 'http://example.com/x.png', null, undefined, 42, {}]) {
      assert.throws(() => decodePhoto(bad as unknown), /could not be read|No image was sent/);
    }
  });

  await t.test('an oversized image is refused', () => {
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_BYTES + 1)]);
    assert.throws(() => decodePhoto(uri('image/png', big)), /too large/);
  });

  await t.test('an empty payload is refused', () => {
    assert.throws(() => decodePhoto('data:image/png;base64,'), /could not be read/);
  });
});

test('the photo URL changes when the photo does', () => {
  // A fixed URL plus the immutable cache on the endpoint would leave a replaced
  // photo hidden behind the old one on every device that had seen it.
  const a = photoUrl(7, new Date('2026-10-06T10:00:00Z'));
  const b = photoUrl(7, new Date('2026-10-06T10:00:01Z'));
  assert.notEqual(a, b);
  assert.match(a, /^\/api\/players\/7\/photo\?v=\d+$/);
});
