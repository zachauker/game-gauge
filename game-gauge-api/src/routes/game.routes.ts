import { Router } from 'express';
import { gameController } from '../controllers/game.controller';
import { ratingController } from '../controllers/rating.controller';
import { reviewController } from '../controllers/review.controller';
import { listController } from '../controllers/list.controller';
import { authenticate, optionalAuth } from '../middleware/auth.middleware';

const router = Router();

/**
 * Public routes (no authentication required)
 */

/**
 * @route   GET /api/games/top-rated
 * @desc    Get top-rated games
 * @access  Public
 * @note    Must be before /:id route to avoid matching "top-rated" as an ID
 */
router.get('/top-rated', gameController.getTopRated.bind(gameController));

/**
 * @route   GET /api/games/recent
 * @desc    Get recently added games
 * @access  Public
 * @note    Must be before /:id route to avoid matching "recent" as an ID
 */
router.get('/recent', gameController.getRecent.bind(gameController));

/**
 * @route   GET /api/games/slug/:slug
 * @desc    Get game by slug (SEO-friendly URL)
 * @access  Public
 */
router.get('/slug/:slug', gameController.findBySlug.bind(gameController));

/**
 * @route   GET /api/games
 * @desc    Get all games (with pagination, search, filters)
 * @access  Public
 */
router.get('/', gameController.findAll.bind(gameController));

/**
 * @route   GET /api/games/:id
 * @desc    Get single game by ID
 * @access  Public
 */
router.get('/:id', gameController.findById.bind(gameController));

/**
 * Protected routes (authentication required)
 * TODO: Add admin-only middleware for create/update/delete
 */

/**
 * @route   POST /api/games
 * @desc    Create a new game
 * @access  Private (TODO: Admin only)
 */
router.post('/', authenticate, gameController.create.bind(gameController));

/**
 * @route   PATCH /api/games/:id
 * @desc    Update a game
 * @access  Private (TODO: Admin only)
 */
router.patch('/:id', authenticate, gameController.update.bind(gameController));

/**
 * @route   DELETE /api/games/:id
 * @desc    Delete a game
 * @access  Private (TODO: Admin only)
 */
router.delete('/:id', authenticate, gameController.delete.bind(gameController));

/**
 * Rating routes for specific games
 */

/**
 * @route   GET /api/games/:gameId/rating/stats
 * @desc    Get rating statistics for a game (average, distribution, etc.)
 * @access  Public
 * @note    Must be before other rating routes to avoid matching "stats" as part of path
 */
router.get('/:gameId/rating/stats', ratingController.getGameStats.bind(ratingController));

/**
 * @route   GET /api/games/:gameId/rating/check
 * @desc    Check if current user has rated this game
 * @access  Private
 */
router.get('/:gameId/rating/check', authenticate, ratingController.checkUserRating.bind(ratingController));

/**
 * @route   GET /api/games/:gameId/rating/me
 * @desc    Get current user's rating for this game
 * @access  Private
 */
router.get('/:gameId/rating/me', authenticate, ratingController.getUserRating.bind(ratingController));

/**
 * @route   GET /api/games/:gameId/ratings
 * @desc    Get all ratings for a game (paginated)
 * @access  Public
 */
router.get('/:gameId/ratings', ratingController.getGameRatings.bind(ratingController));

/**
 * @route   POST /api/games/:gameId/rating
 * @desc    Rate a game (create or update rating)
 * @access  Private
 */
router.post('/:gameId/rating', authenticate, ratingController.rateGame.bind(ratingController));

/**
 * @route   DELETE /api/games/:gameId/rating
 * @desc    Delete user's rating for a game
 * @access  Private
 */
router.delete('/:gameId/rating', authenticate, ratingController.deleteRating.bind(ratingController));

/**
 * Review routes for specific games
 */

/**
 * @route   GET /api/games/:gameId/reviews/check
 * @desc    Check if current user has reviewed this game
 * @access  Private
 * @note    Must be before other review routes
 */
router.get('/:gameId/reviews/check', authenticate, reviewController.checkUserReview.bind(reviewController));

/**
 * @route   GET /api/games/:gameId/reviews/me
 * @desc    Get current user's review for this game
 * @access  Private
 */
router.get('/:gameId/reviews/me', authenticate, reviewController.getUserReview.bind(reviewController));

/**
 * @route   GET /api/games/:gameId/reviews
 * @desc    Get all reviews for a game (paginated)
 * @access  Public
 */
router.get('/:gameId/reviews', reviewController.getGameReviews.bind(reviewController));

/**
 * @route   POST /api/games/:gameId/reviews
 * @desc    Create a review for a game
 * @access  Private
 */
router.post('/:gameId/reviews', authenticate, reviewController.create.bind(reviewController));

export default router;

/**
 * Lists routes for games
 */

/**
 * @route   GET /api/games/:gameId/lists
 * @desc    Get lists containing this game
 * @access  Public
 */
router.get('/:gameId/lists', listController.getListsContainingGame.bind(listController));

