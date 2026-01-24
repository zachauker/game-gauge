import { ratingRepository } from '../repositories/rating.repository';
import { gameRepository } from '../repositories/game.repository';
import { NotFoundError, BadRequestError } from '../utils/errors.util';
import { RatingInput, GetRatingsQuery } from '../validators/rating.validator';

export class RatingService {
  /**
   * Create or update a rating for a game
   * If user already rated this game, update their rating
   */
  async rateGame(userId: string, gameId: string, data: RatingInput) {
    // Check if game exists
    const game = await gameRepository.findById(gameId);
    if (!game) {
      throw new NotFoundError('Game not found');
    }

    // Upsert rating (create or update)
    const rating = await ratingRepository.upsert(userId, gameId, data.score);

    // Get updated stats
    const stats = await ratingRepository.getStats(gameId);

    return {
      rating,
      stats,
    };
  }

  /**
   * Get user's rating for a specific game
   */
  async getUserRating(userId: string, gameId: string) {
    const rating = await ratingRepository.findByUserAndGame(userId, gameId);

    if (!rating) {
      throw new NotFoundError('Rating not found');
    }

    return rating;
  }

  /**
   * Get all ratings for a game
   */
  async getGameRatings(gameId: string, query: GetRatingsQuery) {
    // Check if game exists
    const game = await gameRepository.findById(gameId);
    if (!game) {
      throw new NotFoundError('Game not found');
    }

    const { page, limit } = query;
    return ratingRepository.findByGame(gameId, page, limit);
  }

  /**
   * Get all ratings by a user
   */
  async getUserRatings(userId: string, query: GetRatingsQuery) {
    const { page, limit } = query;
    return ratingRepository.findByUser(userId, page, limit);
  }

  /**
   * Delete a rating
   */
  async deleteRating(userId: string, gameId: string) {
    // Check if rating exists
    const rating = await ratingRepository.findByUserAndGame(userId, gameId);
    if (!rating) {
      throw new NotFoundError('Rating not found');
    }

    // Delete rating
    await ratingRepository.delete(userId, gameId);

    // Get updated stats
    const stats = await ratingRepository.getStats(gameId);

    return {
      message: 'Rating deleted successfully',
      stats,
    };
  }

  /**
   * Get rating statistics for a game
   */
  async getGameStats(gameId: string) {
    // Check if game exists
    const game = await gameRepository.findById(gameId);
    if (!game) {
      throw new NotFoundError('Game not found');
    }

    return ratingRepository.getStats(gameId);
  }

  /**
   * Check if user has rated a game
   */
  async hasUserRated(userId: string, gameId: string) {
    return ratingRepository.hasUserRated(userId, gameId);
  }

  /**
   * Get user's recent ratings (for profile, activity)
   */
  async getRecentRatings(userId: string, limit: number = 10) {
    return ratingRepository.getRecentByUser(userId, limit);
  }
}

export const ratingService = new RatingService();
