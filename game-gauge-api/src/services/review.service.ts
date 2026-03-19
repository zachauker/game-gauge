import { reviewRepository } from '../repositories/review.repository';
import { gameRepository } from '../repositories/game.repository';
import { NotFoundError, ConflictError, ForbiddenError } from '../utils/errors.util';
import {
  CreateReviewInput,
  UpdateReviewInput,
  GetReviewsQuery,
} from '../validators/review.validator';
import { activityService } from './activity.service';
import { ActivityType } from './activity.service';

export class ReviewService {
  /**
   * Create a new review for a game
   */
  async create(userId: string, gameId: string, data: CreateReviewInput) {
    // Check if game exists
    const game = await gameRepository.findById(gameId);
    if (!game) {
      throw new NotFoundError('Game not found');
    }

    // Check if user already reviewed this game
    const existingReview = await reviewRepository.findByUserAndGame(userId, gameId);
    if (existingReview) {
      throw new ConflictError('You have already reviewed this game');
    }

    // Create review and record activity event.
    await reviewRepository
      .create({
        content: data.content,
        userId,
        gameId,
        spoilers: data.spoilers,
      })
      .then((review) => {
        activityService.recordEvent(userId, ActivityType.REVIEWED_GAME, {
          gameId,
          targetId: review.id,
          meta: {
            excerpt: data.content.slice(0, 150),
            gameTitle: game.title,
            coverImage: game.coverImage,
          },
        });

        // Return review with user info
        return reviewRepository.findById(review.id);
      });
  }

  /**
   * Get a single review by ID
   */
  async findById(id: string) {
    const review = await reviewRepository.findById(id);

    if (!review) {
      throw new NotFoundError('Review not found');
    }

    return review;
  }

  /**
   * Get user's review for a specific game
   */
  async getUserReview(userId: string, gameId: string) {
    const review = await reviewRepository.findByUserAndGame(userId, gameId);

    if (!review) {
      throw new NotFoundError('Review not found');
    }

    return review;
  }

  /**
   * Get all reviews for a game
   */
  async getGameReviews(gameId: string, query: GetReviewsQuery) {
    // Check if game exists
    const game = await gameRepository.findById(gameId);
    if (!game) {
      throw new NotFoundError('Game not found');
    }

    const { page, limit, sortBy, sortOrder } = query;
    return reviewRepository.findByGame(gameId, page, limit, sortBy, sortOrder);
  }

  /**
   * Get all reviews by a user
   */
  async getUserReviews(userId: string, query: GetReviewsQuery) {
    const { page, limit, sortBy, sortOrder } = query;
    return reviewRepository.findByUser(userId, page, limit, sortBy, sortOrder);
  }

  /**
   * Update a review
   * Users can only update their own reviews
   */
  async update(reviewId: string, userId: string, data: UpdateReviewInput) {
    // Check if review exists
    const review = await reviewRepository.findById(reviewId);
    if (!review) {
      throw new NotFoundError('Review not found');
    }

    // Check ownership
    if (review.userId !== userId) {
      throw new ForbiddenError('You can only edit your own reviews');
    }

    // Update review
    await reviewRepository.updateContent(reviewId, {
      content: data.content,
      spoilers: data.spoilers,
    });

    // Return updated review with user info
    return reviewRepository.findById(reviewId);
  }

  /**
   * Delete a review
   * Users can only delete their own reviews
   */
  async delete(reviewId: string, userId: string) {
    // Check if review exists
    const review = await reviewRepository.findById(reviewId);
    if (!review) {
      throw new NotFoundError('Review not found');
    }

    // Check ownership
    if (review.userId !== userId) {
      throw new ForbiddenError('You can only delete your own reviews');
    }

    // Delete review and associated activity events.
    await reviewRepository
      .delete(reviewId)
      .then(() => activityService.pruneEvents(reviewId, ActivityType.REVIEWED_GAME));

    return { message: 'Review deleted successfully' };
  }

  /**
   * Check if user has reviewed a game
   */
  async hasUserReviewed(userId: string, gameId: string) {
    return reviewRepository.hasUserReviewed(userId, gameId);
  }

  /**
   * Get recent reviews by user (for profile)
   */
  async getRecentReviews(userId: string, limit: number = 10) {
    return reviewRepository.getRecentByUser(userId, limit);
  }

  /**
   * Get recent reviews across the platform (for activity feed)
   */
  async getRecentPlatformReviews(limit: number = 10) {
    return reviewRepository.getRecentReviews(limit);
  }

  /**
   * Mark review as helpful
   */
  async markHelpful(reviewId: string, userId: string) {
    // Check if review exists
    const review = await reviewRepository.findById(reviewId);
    if (!review) {
      throw new NotFoundError('Review not found');
    }

    // Can't mark your own review as helpful
    if (review.userId === userId) {
      throw new ConflictError('You cannot mark your own review as helpful');
    }

    // Check if already marked
    const hasVoted = await reviewRepository.hasUserVotedHelpful(reviewId, userId);
    if (hasVoted) {
      throw new ConflictError('You have already marked this review as helpful');
    }

    // Add helpful vote
    await reviewRepository.addHelpfulVote(reviewId, userId);

    return { message: 'Review marked as helpful' };
  }

  /**
   * Remove helpful mark from review
   */
  async unmarkHelpful(reviewId: string, userId: string) {
    // Check if review exists
    const review = await reviewRepository.findById(reviewId);
    if (!review) {
      throw new NotFoundError('Review not found');
    }

    // Check if has voted
    const hasVoted = await reviewRepository.hasUserVotedHelpful(reviewId, userId);
    if (!hasVoted) {
      throw new ConflictError('You have not marked this review as helpful');
    }

    // Remove helpful vote
    await reviewRepository.removeHelpfulVote(reviewId, userId);

    return { message: 'Helpful mark removed' };
  }

  /**
   * Get user's helpful votes for reviews
   */
  async getUserHelpfulVotes(userId: string, reviewIds: string[]) {
    return reviewRepository.getUserHelpfulVotes(userId, reviewIds);
  }
}

export const reviewService = new ReviewService();
