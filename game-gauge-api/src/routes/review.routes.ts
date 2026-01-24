import { Router } from 'express';
import { reviewController } from '../controllers/review.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * Public routes
 */

/**
 * @route   GET /api/reviews/recent
 * @desc    Get recent reviews across the platform
 * @access  Public
 * @note    Must be before /:id route
 */
router.get('/recent', reviewController.getRecentPlatformReviews.bind(reviewController));

/**
 * @route   GET /api/reviews/:id
 * @desc    Get a single review by ID
 * @access  Public
 */
router.get('/:id', reviewController.findById.bind(reviewController));

/**
 * Protected routes
 */

/**
 * @route   GET /api/reviews/me
 * @desc    Get all reviews by current user
 * @access  Private
 * @note    Must be before /:id route
 */
router.get('/me', authenticate, reviewController.getMyReviews.bind(reviewController));

/**
 * @route   GET /api/reviews/me/recent
 * @desc    Get recent reviews by current user
 * @access  Private
 */
router.get('/me/recent', authenticate, reviewController.getMyRecentReviews.bind(reviewController));

/**
 * @route   PATCH /api/reviews/:id
 * @desc    Update a review (user's own only)
 * @access  Private
 */
router.patch('/:id', authenticate, reviewController.update.bind(reviewController));

/**
 * @route   DELETE /api/reviews/:id
 * @desc    Delete a review (user's own only)
 * @access  Private
 */
router.delete('/:id', authenticate, reviewController.delete.bind(reviewController));

/**
 * @route   POST /api/reviews/:id/helpful
 * @desc    Mark review as helpful
 * @access  Private
 */
router.post('/:id/helpful', authenticate, reviewController.markHelpful.bind(reviewController));

/**
 * @route   DELETE /api/reviews/:id/helpful
 * @desc    Remove helpful mark from review
 * @access  Private
 */
router.delete('/:id/helpful', authenticate, reviewController.unmarkHelpful.bind(reviewController));

export default router;
