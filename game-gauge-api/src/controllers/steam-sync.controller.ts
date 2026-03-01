import { Request, Response, NextFunction } from 'express';
import { steamSyncService } from '../services/steam-sync.service';
import { z } from 'zod';

// Validation schemas
const libraryQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .default('1')
    .transform((val) => parseInt(val, 10))
    .refine((val) => val > 0, 'Page must be positive'),
  limit: z
    .string()
    .optional()
    .default('50')
    .transform((val) => parseInt(val, 10))
    .refine((val) => val > 0 && val <= 200, 'Limit must be between 1 and 200'),
  sortBy: z
    .enum(['playtimeForever', 'playtimeRecent', 'name', 'lastPlayed'])
    .optional()
    .default('playtimeForever'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  matchedOnly: z
    .string()
    .optional()
    .default('false')
    .transform((val) => val === 'true'),
});

const recentQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .default('20')
    .transform((val) => parseInt(val, 10))
    .refine((val) => val > 0 && val <= 100, 'Limit must be between 1 and 100'),
});

export class SteamSyncController {
  /**
   * POST /api/steam/sync/library
   * Trigger a full Steam library sync.
   */
  async syncLibrary(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');

      const result = await steamSyncService.syncLibrary(req.user.userId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/steam/sync/recent
   * Sync only recently played games (lighter operation).
   */
  async syncRecent(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');

      const result = await steamSyncService.syncRecentlyPlayed(req.user.userId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/steam/library
   * Get the user's cached Steam library.
   */
  async getLibrary(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');

      const { page, limit, sortBy, sortOrder, matchedOnly } =
        libraryQuerySchema.parse(req.query);

      const result = await steamSyncService.getLibrary(req.user.userId, {
        page,
        limit,
        sortBy,
        sortOrder,
        matchedOnly,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/steam/recent
   * Get recently played games from cache.
   */
  async getRecentlyPlayed(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');

      const { limit } = recentQuerySchema.parse(req.query);

      const result = await steamSyncService.getRecentlyPlayed(
        req.user.userId,
        limit
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/steam/wishlist
   * Get the user's Steam wishlist (live fetch).
   */
  async getWishlist(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');

      const result = await steamSyncService.getWishlist(req.user.userId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/steam/profile
   * Get the user's Steam profile summary (live fetch).
   */
  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');

      const result = await steamSyncService.getProfile(req.user.userId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/steam/sync/status
   * Get sync metadata (last sync time, game counts).
   */
  async getSyncStatus(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');

      const result = await steamSyncService.getSyncStatus(req.user.userId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const steamSyncController = new SteamSyncController();
