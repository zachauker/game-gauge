import { Router } from 'express';
import { followController } from '../controllers/follow.controller';
import { authenticate, optionalAuth } from '../middleware/auth.middleware';

const router = Router({ mergeParams: true }); // receives :username from parent

/**
 * NOTE: These routes are mounted under /api/users by index.ts
 * and sit alongside the existing user routes.
 * Static routes (/suggestions) must be declared before dynamic ones (/:username/...).
 */

/**
 * @route   GET /api/users/suggestions
 * @desc    Suggested users to follow
 * @access  Private
 */
router.get('/suggestions', authenticate, followController.getSuggestions.bind(followController));

/**
 * @route   POST /api/users/:username/follow
 * @desc    Follow a user
 * @access  Private
 */
router.post('/:username/follow', authenticate, followController.followUser.bind(followController));

/**
 * @route   DELETE /api/users/:username/follow
 * @desc    Unfollow a user
 * @access  Private
 */
router.delete('/:username/follow', authenticate, followController.unfollowUser.bind(followController));

/**
 * @route   GET /api/users/:username/followers
 * @desc    List followers of :username
 * @access  Public (with optional auth for isFollowing annotation)
 */
router.get('/:username/followers', optionalAuth, followController.getFollowers.bind(followController));

/**
 * @route   GET /api/users/:username/following
 * @desc    List users that :username follows
 * @access  Public (with optional auth for isFollowing annotation)
 */
router.get('/:username/following', optionalAuth, followController.getFollowing.bind(followController));

export default router;
