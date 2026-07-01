import { Router } from 'express';
import authRoutes from './auth.routes';
import gameRoutes from './game.routes';
import ratingRoutes from './rating.routes';
import reviewRoutes from './review.routes';
import igdbRoutes from './igdb.routes';
import listRoutes from './list.routes';
import userRoutes from './user.routes';
import steamAuthRoutes from './steam-auth.routes';
import steamSyncRoutes from './steam-sync.routes';
import followRoutes from './follow.routes';
import feedRoutes from './feed.routes';
import notificationRoutes from './notification.routes';
import conversationRoutes from './conversation.routes';

const router = Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/games', gameRoutes);
router.use('/auth', steamAuthRoutes);
router.use('/steam', steamSyncRoutes);
router.use('/ratings', ratingRoutes);
router.use('/reviews', reviewRoutes);
router.use('/igdb', igdbRoutes);
router.use('/lists', listRoutes);
router.use('/users', userRoutes);
router.use('/users', followRoutes); // follow/followers/following endpoints
router.use('/feed', feedRoutes); // personalised + global feed
router.use('/notifications', notificationRoutes);
router.use('/conversations', conversationRoutes);

// Health check endpoint for Railway
router.get('/health', (_req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

export default router;
