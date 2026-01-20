import { Request, Response, NextFunction } from 'express';
import { ratingService } from '../services/rating.service';
import { ratingSchema, getRatingsQuerySchema } from '../validators/rating.validator';

export class RatingController {
  /**
   * Rate a game (create or update rating)
   * POST /api/games/:gameId/rating
   */
  async rateGame(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new Error('User not authenticated');
      }

      const { gameId } = req.params;
      const data = ratingSchema.parse(req.body);

      const result = await ratingService.rateGame(req.user.userId, gameId, data);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user's rating for a specific game
   * GET /api/games/:gameId/rating/me
   */
  async getUserRating(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new Error('User not authenticated');
      }

      const { gameId } = req.params;
      const rating = await ratingService.getUserRating(req.user.userId, gameId);

      res.status(200).json({
        success: true,
        data: rating,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all ratings for a game
   * GET /api/games/:gameId/ratings
   */
  async getGameRatings(req: Request, res: Response, next: NextFunction) {
    try {
      const { gameId } = req.params;
      const query = getRatingsQuerySchema.parse(req.query);

      const result = await ratingService.getGameRatings(gameId, query);

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all ratings by current user
   * GET /api/ratings/me
   */
  async getMyRatings(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new Error('User not authenticated');
      }

      const query = getRatingsQuerySchema.parse(req.query);
      const result = await ratingService.getUserRatings(req.user.userId, query);

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete user's rating for a game
   * DELETE /api/games/:gameId/rating
   */
  async deleteRating(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new Error('User not authenticated');
      }

      const { gameId } = req.params;
      const result = await ratingService.deleteRating(req.user.userId, gameId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get rating statistics for a game
   * GET /api/games/:gameId/rating/stats
   */
  async getGameStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { gameId } = req.params;
      const stats = await ratingService.getGameStats(gameId);

      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Check if user has rated a game
   * GET /api/games/:gameId/rating/check
   */
  async checkUserRating(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new Error('User not authenticated');
      }

      const { gameId } = req.params;
      const hasRated = await ratingService.hasUserRated(req.user.userId, gameId);

      res.status(200).json({
        success: true,
        data: {
          hasRated,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user's recent ratings
   * GET /api/ratings/me/recent
   */
  async getMyRecentRatings(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new Error('User not authenticated');
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const ratings = await ratingService.getRecentRatings(req.user.userId, limit);

      res.status(200).json({
        success: true,
        data: ratings,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const ratingController = new RatingController();
