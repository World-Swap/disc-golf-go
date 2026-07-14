// src/modules/upload/upload.routes.ts — profile photo upload.
// (Legacy crew-logo upload dropped — crews are out of scope.)

import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../http/async-handler';
import { badRequest, unauthorized, AppError } from '../../http/errors';
import { uploadImage } from '../../lib/storage';
import type { Queryable } from '../../db/types';

interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, WebP, or GIF images are allowed'));
  },
});

export function createUploadRouter(db: Queryable, requireAuth: RequestHandler): Router {
  const router = Router();

  router.post(
    '/players/me/photo',
    requireAuth,
    upload.single('photo'),
    asyncHandler(async (req, res) => {
      if (!req.player) throw unauthorized();
      const file = (req as unknown as { file?: UploadedFile }).file;
      if (!file) throw badRequest('No file uploaded');

      const ext = file.originalname.split('.').pop() || 'jpg';
      let url: string;
      try {
        url = await uploadImage({
          buffer: file.buffer,
          filename: `avatar_${req.player.id}_${Date.now()}.${ext}`,
          contentType: file.mimetype,
        });
      } catch (err) {
        // Unconfigured storage is an operational error, not the client's fault.
        if ((err as Error).message === 'File storage not configured') throw new AppError(500, 'File storage not configured');
        throw err;
      }

      await db.query('UPDATE players SET profile_photo_url = $1 WHERE id = $2', [url, req.player.id]);
      res.json({ success: true, url });
    })
  );

  return router;
}
