import { Router } from 'express';
import { activityController } from '../controllers/activity.controller';
import { authenticate, optionalAuth } from '../middleware/auth.middleware';

const router = Router();

/**
 * @route   GET /api/feed
 * @desc    Personalised activity feed for authenticated user
 * @access  Private
 */
router.get('/', authenticate, activityController.getFeed.bind(activityController));

/**
 * @route   GET /api/feed/global
 * @desc    Platform-wide recent activity
 * @access  Public
 */
router.get('/global', optionalAuth, activityController.getGlobalFeed.bind(activityController));

export default router;
