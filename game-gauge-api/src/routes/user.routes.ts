import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';
import { activityController } from '../controllers/activity.controller';
import { blockController } from '../controllers/block.controller';

const router = Router();

/**
 * Protected /me routes — must be registered BEFORE /:username
 * to prevent Express matching "me" as a username param
 */

/**
 * @route   GET /api/users/me
 * @desc    Get current user profile (with private data)
 * @access  Private
 */
router.get('/me', authenticate, userController.getCurrentUser.bind(userController));

/**
 * @route   PATCH /api/users/me
 * @desc    Update current user profile
 * @access  Private
 */
router.patch('/me', authenticate, userController.updateProfile.bind(userController));

/**
 * @route   PATCH /api/users/me/username
 * @desc    Update username
 * @access  Private
 */
router.patch('/me/username', authenticate, userController.updateUsername.bind(userController));

/**
 * @route   GET /api/users/me/blocks
 * @desc    List users the current user has blocked
 * @access  Private
 */
router.get('/me/blocks', authenticate, blockController.listBlocked.bind(blockController));

/**
 * Public routes
 */

/**
 * @route   GET /api/users/search
 * @desc    Search users by username
 * @access  Public
 * @note    Must be before /:username to avoid matching "search" as a username
 */
router.get('/search', userController.searchUsers.bind(userController));

/**
 * @route   GET /api/users/:username
 * @desc    Get user profile by username
 * @access  Public
 */
router.get('/:username', userController.getProfile.bind(userController));

/**
 * @route   GET /api/users/:username/stats
 * @desc    Get user statistics
 * @access  Public
 */
router.get('/:username/stats', userController.getStats.bind(userController));

/**
 * @route   GET /api/users/:username/activity
 * @desc    Paginated ActivityEvent feed for a single user (profile Activity tab)
 * @access  Public
 * @note    Routed to activityController — returns { events, total, page, hasMore }
 *          NOT the old userController.getActivity which returned { ratings, reviews }
 */
router.get('/:username/activity', activityController.getUserActivity.bind(activityController));

/**
 * @route   GET /api/users/:username/ratings
 * @desc    Get user's ratings paginated
 * @access  Public
 */
router.get('/:username/ratings', userController.getUserRatings.bind(userController));

/**
 * @route   GET /api/users/:username/reviews
 * @desc    Get user's reviews paginated
 * @access  Public
 */
router.get('/:username/reviews', userController.getUserReviews.bind(userController));

/**
 * @route   POST /api/users/:username/block
 * @desc    Block a user
 * @access  Private
 */
router.post('/:username/block', authenticate, blockController.block.bind(blockController));

/**
 * @route   DELETE /api/users/:username/block
 * @desc    Unblock a user
 * @access  Private
 */
router.delete('/:username/block', authenticate, blockController.unblock.bind(blockController));

export default router;
