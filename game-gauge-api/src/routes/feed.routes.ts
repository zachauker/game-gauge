import { Router } from 'express';
import { activityController } from '../controllers/activity.controller';
import { interactionController } from '../controllers/interaction.controller';
import { authenticate, optionalAuth } from '../middleware/auth.middleware';

const router = Router();

// ── Feed endpoints ────────────────────────────────────────────────────────────

router.get('/', authenticate, activityController.getFeed.bind(activityController));
router.get('/global', optionalAuth, activityController.getGlobalFeed.bind(activityController));

// ── Per-event interaction endpoints ──────────────────────────────────────────

router.post(
  '/events/:eventId/reactions',
  authenticate,
  interactionController.toggleReaction.bind(interactionController)
);
router.get(
  '/events/:eventId/comments',
  optionalAuth,
  interactionController.getComments.bind(interactionController)
);
router.post(
  '/events/:eventId/comments',
  authenticate,
  interactionController.addComment.bind(interactionController)
);
router.delete(
  '/events/:eventId/comments/:commentId',
  authenticate,
  interactionController.deleteComment.bind(interactionController)
);

export default router;
