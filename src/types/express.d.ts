// Ambient augmentation: attach the authenticated player to Express requests.
import type { AuthPlayer } from '../middleware/auth';

declare global {
  namespace Express {
    interface Request {
      player?: AuthPlayer;
    }
  }
}

export {};
