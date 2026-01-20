import { Router } from 'express';
import { ratingController } from '../controllers/rating.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * Routes for user's own ratings
 */

/**
 * @route   GET /api/ratings/me
 * @desc    Get all ratings by current user
 * @access  Private
 */
router.get('/me', authenticate, ratingController.getMyRatings.bind(ratingController));

/**
 * @route   GET /api/ratings/me/recent
 * @desc    Get recent ratings by current user
 * @access  Private
 */
router.get('/me/recent', authenticate, ratingController.getMyRecentRatings.bind(ratingController));

export default router;
