import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

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
 * @desc    Get user's recent activity (ratings, reviews)
 * @access  Public
 */
router.get('/:username/activity', userController.getActivity.bind(userController));

/**
 * Protected routes (authentication required)
 */

/**
 * @route   GET /api/users/me
 * @desc    Get current user profile (with private data)
 * @access  Private
 * @note    This should be before /:username but we handle "me" as special case in controller
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

export default router;
