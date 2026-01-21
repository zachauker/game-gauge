import { Request, Response, NextFunction } from 'express';
import { igdbService } from '../services/igdb.service';
import { gameImportService } from '../services/gameImport.service';
import { z } from 'zod';

// Validation schemas
const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required').max(100),
  limit: z
    .string()
    .optional()
    .default('10')
    .transform((val) => parseInt(val, 10))
    .refine((val) => val > 0 && val <= 50, 'Limit must be between 1 and 50'),
});

const importGameSchema = z.object({
  igdbId: z.number().int().positive('IGDB ID must be a positive integer'),
});

export class IGDBController {
  /**
   * Search for games in IGDB
   * GET /api/igdb/search?q=zelda&limit=10
   */
  async search(req: Request, res: Response, next: NextFunction) {
    try {
      const { q, limit } = searchQuerySchema.parse(req.query);

      const results = await igdbService.searchGames(q, limit);

      res.status(200).json({
        success: true,
        data: results,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get game details from IGDB by IGDB ID
   * GET /api/igdb/games/:igdbId
   */
  async getGameById(req: Request, res: Response, next: NextFunction) {
    try {
      const igdbId = parseInt(req.params.igdbId as string, 10);

      if (isNaN(igdbId)) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Invalid IGDB ID',
            code: 'INVALID_ID',
          },
        });
      }

      const game = await igdbService.getGameById(igdbId);

      if (!game) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Game not found in IGDB',
            code: 'NOT_FOUND',
          },
        });
      }

      // Check if game exists in our database
      const inDatabase = await gameImportService.gameExistsInDatabase(igdbId);

      res.status(200).json({
        success: true,
        data: {
          ...game,
          inDatabase, // Tells frontend if user can rate/review
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Import a game from IGDB to our database
   * POST /api/igdb/import
   * Body: { igdbId: 123 }
   */
  async importGame(req: Request, res: Response, next: NextFunction) {
    try {
      const { igdbId } = importGameSchema.parse(req.body);

      const game = await gameImportService.getOrImportGame(igdbId);

      res.status(201).json({
        success: true,
        data: game,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get popular games from IGDB
   * GET /api/igdb/popular?limit=20
   */
  async getPopular(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const games = await igdbService.getPopularGames(limit);

      res.status(200).json({
        success: true,
        data: games,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get recently released games from IGDB
   * GET /api/igdb/recent?limit=20
   */
  async getRecent(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const games = await igdbService.getRecentGames(limit);

      res.status(200).json({
        success: true,
        data: games,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Refresh game data from IGDB (admin/maintenance)
   * POST /api/igdb/refresh/:gameId
   */
  async refreshGame(req: Request, res: Response, next: NextFunction) {
    try {
      const { gameId } = req.params;

      const game = await gameImportService.refreshGame(gameId as string);

      res.status(200).json({
        success: true,
        data: game,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const igdbController = new IGDBController();
