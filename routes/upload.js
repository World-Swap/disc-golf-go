const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const FormData = require('form-data');
const { requireAuth } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit for profile photos
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP, or GIF images are allowed'));
    }
  }
});

module.exports = ({ pool }) => {
  const router = express.Router();

  // POST /api/players/me/photo — upload profile photo
  router.post('/players/me/photo', requireAuth(pool), upload.single('photo'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const polsiaApiKey = process.env.POLSIA_API_KEY;
    if (!polsiaApiKey) {
      return res.status(500).json({ error: 'File storage not configured' });
    }

    try {
      // Upload to R2 via Polsia proxy
      const formData = new FormData();
      formData.append('file', req.file.buffer, {
        filename: `avatar_${req.player.id}_${Date.now()}.${req.file.originalname.split('.').pop() || 'jpg'}`,
        contentType: req.file.mimetype
      });

      const uploadRes = await fetch('https://polsia.com/api/proxy/r2/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${polsiaApiKey}`,
          ...formData.getHeaders()
        },
        body: formData
      });

      const result = await uploadRes.json();
      if (!result.success) {
        throw new Error(result.error?.message || 'Upload failed');
      }

      const photoUrl = result.file.url;

      // Save to player record
      await pool.query(
        'UPDATE players SET profile_photo_url = $1 WHERE id = $2',
        [photoUrl, req.player.id]
      );

      res.json({ success: true, url: photoUrl });
    } catch (err) {
      console.error('Photo upload error:', err.message);
      res.status(500).json({ error: 'Failed to upload photo' });
    }
  });

  // POST /api/crews/:crewId/logo — upload crew logo (boss/manager only)
  router.post('/crews/:crewId/logo', requireAuth(pool), upload.single('logo'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const polsiaApiKey = process.env.POLSIA_API_KEY;
    if (!polsiaApiKey) {
      return res.status(500).json({ error: 'File storage not configured' });
    }

    try {
      // Verify boss/manager membership
      const memberRes = await pool.query(
        'SELECT role FROM crew_members WHERE crew_id = $1 AND player_id = $2',
        [req.params.crewId, req.player.id]
      );
      if (!memberRes.rows.length) {
        return res.status(403).json({ error: 'Not a crew member' });
      }
      if (!['boss', 'manager'].includes(memberRes.rows[0].role)) {
        return res.status(403).json({ error: 'Only boss or manager can update logo' });
      }

      // Upload to R2 via Polsia proxy
      const formData = new FormData();
      formData.append('file', req.file.buffer, {
        filename: `crew_logo_${req.params.crewId}_${Date.now()}.${req.file.originalname.split('.').pop() || 'jpg'}`,
        contentType: req.file.mimetype
      });

      const uploadRes = await fetch('https://polsia.com/api/proxy/r2/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${polsiaApiKey}`,
          ...formData.getHeaders()
        },
        body: formData
      });

      const result = await uploadRes.json();
      if (!result.success) {
        throw new Error(result.error?.message || 'Upload failed');
      }

      const logoUrl = result.file.url;

      // Save to crew record
      await pool.query(
        'UPDATE crews SET logo_url = $1 WHERE id = $2',
        [logoUrl, req.params.crewId]
      );

      res.json({ success: true, url: logoUrl });
    } catch (err) {
      console.error('Crew logo upload error:', err.message);
      res.status(500).json({ error: 'Failed to upload logo' });
    }
  });

  return router;
};
