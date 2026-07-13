const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'REDACTED';

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '90d' });
}

// Middleware: require JWT auth. Sets req.player = { id, player_uuid }.
// Also accepts legacy X-Player-Id UUID header for backward compat.
// Stores the raw Bearer token in req.rawToken for downstream use.
function requireAuth(pool) {
  return async (req, res, next) => {
    // 1. Try JWT Bearer token
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      req.rawToken = token;
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.player = { id: decoded.id, player_uuid: decoded.player_uuid };
        return next();
      } catch (err) {
        console.warn('[auth] JWT verification failed:', err.message);
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    }

    // 2. Legacy UUID header (backward compat)
    const playerUuid = req.headers['x-player-id'];
    if (playerUuid) {
      try {
        const result = await pool.query(
          'SELECT id, player_uuid FROM players WHERE player_uuid = $1',
          [playerUuid]
        );
        if (result.rows.length > 0) {
          req.player = { id: result.rows[0].id, player_uuid: result.rows[0].player_uuid };
          return next();
        }
      } catch (err) {
        console.warn('[auth] Legacy UUID lookup failed:', err.message);
      }
    }

    return res.status(401).json({ error: 'Authentication required' });
  };
}

module.exports = { createToken, requireAuth, JWT_SECRET };
