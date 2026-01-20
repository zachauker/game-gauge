import { Router } from 'express';
import authRoutes from './auth.routes';
import gameRoutes from './game.routes';
import ratingRoutes from './rating.routes';
import reviewRoutes from './review.routes';

const router = Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/games', gameRoutes);
router.use('/ratings', ratingRoutes);
router.use('/reviews', reviewRoutes);

// Placeholder routes - we'll add these next
// router.use('/lists', listsRoutes);

export default router;
