// middleware/compression.js — Brotli + gzip compression for API responses
// Does NOT own static file serving (handled by express.static in server.js).

const zlib = require('zlib');

// Content types we should NOT compress — already compressed or streaming
const UNCOMPRESSIBLE = [
  'event-stream',
  'image/', 'font/', 'audio/', 'video/',
  'application/pdf',
];

function shouldSkip(res, bodyLen) {
  if (bodyLen < 1024) return true; // Not worth the CPU overhead
  if (res.getHeader('Content-Encoding')) return true;
  const ct = (res.getHeader('Content-Type') || '').toLowerCase();
  return UNCOMPRESSIBLE.some(t => ct.includes(t));
}

module.exports = function compressionMiddleware(req, res, next) {
  const enc = (req.headers['accept-encoding'] || '').toLowerCase();
  if (!enc.includes('br') && !enc.includes('gzip')) return next();

  // Capture the response body
  const chunks = [];
  const _write = res.write.bind(res);
  const _end = res.end.bind(res);

  res.write = (chunk, encoding, callback) => {
    chunks.push(chunk);
    return _write(chunk, encoding, callback);
  };

  res.end = (chunk, encoding, callback) => {
    if (chunk) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    if (shouldSkip(res, body.length)) {
      return _end(chunk, encoding, callback);
    }

    const cb = (err, compressed) => {
      if (err) return _end(chunk, encoding, callback);
      res.setHeader('Content-Length', compressed.length);
      _end(compressed, callback);
    };

    if (enc.includes('br')) {
      res.setHeader('Content-Encoding', 'br');
      res.removeHeader('Content-Length');
      zlib.brotliCompress(body, { quality: 6 }, cb);
    } else {
      res.setHeader('Content-Encoding', 'gzip');
      res.removeHeader('Content-Length');
      zlib.gzip(body, { level: 6 }, cb);
    }
  };

  next();
};