import { Router } from 'express';
import authRoutes from './auth.routes';
import gameRoutes from './game.routes';
import ratingRoutes from './rating.routes';
import reviewRoutes from './review.routes';
import igdbRoutes from './igdb.routes';
import listRoutes from './list.routes';
import userRoutes from './user.routes';

const router = Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/games', gameRoutes);
router.use('/ratings', ratingRoutes);
router.use('/reviews', reviewRoutes);
router.use('/igdb', igdbRoutes);
router.use('/lists', listRoutes);
router.use('/users', userRoutes);

// Health check endpoint for Railway
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

export default router;
