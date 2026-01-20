import { Request, Response, NextFunction } from 'express';
import { reviewService } from '../services/review.service';
import {
  createReviewSchema,
  updateReviewSchema,
  getReviewsQuerySchema,
} from '../validators/review.validator';

export class ReviewController {
  /**
   * Create a review for a game
   * POST /api/games/:gameId/reviews
   */
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new Error('User not authenticated');
      }

      const { gameId } = req.params;
      const data = createReviewSchema.parse(req.body);

      const review = await reviewService.create(req.user.userId, gameId as string, data);

      res.status(201).json({
        success: true,
        data: review,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a single review by ID
   * GET /api/reviews/:id
   */
  async findById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const review = await reviewService.findById(id as string);

      res.status(200).json({
        success: true,
        data: review,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user's review for a specific game
   * GET /api/games/:gameId/reviews/me
   */
  async getUserReview(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new Error('User not authenticated');
      }

      const { gameId } = req.params;
      const review = await reviewService.getUserReview(req.user.userId, gameId as string);

      res.status(200).json({
        success: true,
        data: review,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all reviews for a game
   * GET /api/games/:gameId/reviews
   */
  async getGameReviews(req: Request, res: Response, next: NextFunction) {
    try {
      const { gameId } = req.params;
      const query = getReviewsQuerySchema.parse(req.query);

      const result = await reviewService.getGameReviews(gameId as string, query);

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
   * Get all reviews by current user
   * GET /api/reviews/me
   */
  async getMyReviews(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new Error('User not authenticated');
      }

      const query = getReviewsQuerySchema.parse(req.query);
      const result = await reviewService.getUserReviews(req.user.userId, query);

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
   * Update a review
   * PATCH /api/reviews/:id
   */
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new Error('User not authenticated');
      }

      const { id } = req.params;
      const data = updateReviewSchema.parse(req.body);

      const review = await reviewService.update(id as string, req.user.userId, data);

      res.status(200).json({
        success: true,
        data: review,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a review
   * DELETE /api/reviews/:id
   */
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new Error('User not authenticated');
      }

      const { id } = req.params;
      const result = await reviewService.delete(id as string, req.user.userId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Check if user has reviewed a game
   * GET /api/games/:gameId/reviews/check
   */
  async checkUserReview(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new Error('User not authenticated');
      }

      const { gameId } = req.params;
      const hasReviewed = await reviewService.hasUserReviewed(req.user.userId, gameId as string);

      res.status(200).json({
        success: true,
        data: {
          hasReviewed,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user's recent reviews
   * GET /api/reviews/me/recent
   */
  async getMyRecentReviews(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new Error('User not authenticated');
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const reviews = await reviewService.getRecentReviews(req.user.userId, limit);

      res.status(200).json({
        success: true,
        data: reviews,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get recent reviews across platform (activity feed)
   * GET /api/reviews/recent
   */
  async getRecentPlatformReviews(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const reviews = await reviewService.getRecentPlatformReviews(limit);

      res.status(200).json({
        success: true,
        data: reviews,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const reviewController = new ReviewController();
