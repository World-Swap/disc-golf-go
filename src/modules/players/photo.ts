// src/modules/players/photo.ts — decoding and checking an uploaded avatar.
//
// Pure: a string in, bytes or an error out. No database, no request, so the
// rules below can be tested over real encoded images without a server.

import { badRequest } from '../../http/errors';

/** What a browser canvas can produce, and what we are willing to serve back. */
export const ALLOWED_MIME = ['image/webp', 'image/jpeg', 'image/png'] as const;
export type PhotoMime = (typeof ALLOWED_MIME)[number];

/**
 * The ceiling on the DECODED bytes. The client resizes to 256px before sending,
 * which lands around 10-40KB, so this is roomy enough for an odd image and
 * still far below express.json's 1mb body limit -- base64 inflates by 4/3, so a
 * 512KB image is a ~683KB body and still fits.
 */
export const MAX_BYTES = 512 * 1024;

/**
 * The first bytes of each format. The declared MIME in a data URI is just a
 * string the caller chose, so it is checked against what the bytes ACTUALLY
 * are -- otherwise anything at all could be stored and later served back under
 * an image content-type, which is how a file upload turns into a way to host
 * someone else's content on your domain.
 */
const MAGIC: Record<PhotoMime, (b: Buffer) => boolean> = {
  'image/png': (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) =>
    b.length > 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
};

export interface DecodedPhoto {
  mime: PhotoMime;
  bytes: Buffer;
}

/**
 * Parse a `data:` URI from the client into bytes we are willing to store.
 * Throws a 400 with a readable reason rather than returning null, because every
 * failure here is something the person can act on.
 */
export function decodePhoto(raw: unknown): DecodedPhoto {
  if (typeof raw !== 'string' || !raw) throw badRequest('No image was sent');

  const m = /^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(raw.trim());
  if (!m) throw badRequest('That image could not be read');

  const mime = m[1]!.toLowerCase() as PhotoMime;
  if (!ALLOWED_MIME.includes(mime)) throw badRequest('Images must be PNG, JPEG or WebP');

  let bytes: Buffer;
  try {
    bytes = Buffer.from(m[2]!, 'base64');
  } catch {
    throw badRequest('That image could not be read');
  }
  if (!bytes.length) throw badRequest('That image is empty');
  if (bytes.length > MAX_BYTES) throw badRequest('That image is too large — keep it under 512KB');

  // The bytes have to BE what they claim to be.
  if (!MAGIC[mime](bytes)) throw badRequest('That file is not a ' + mime.replace('image/', '').toUpperCase() + ' image');

  return { mime, bytes };
}

/**
 * Where the photo is served from. Carries the updated time so a changed photo
 * is a changed URL -- the endpoint sets a long cache, and without this a new
 * photo would sit behind the old one on every device that had seen it.
 */
export const photoUrl = (playerId: number, updatedAt: Date | string | null): string =>
  '/api/players/' + playerId + '/photo?v=' + new Date(updatedAt ?? Date.now()).getTime();
