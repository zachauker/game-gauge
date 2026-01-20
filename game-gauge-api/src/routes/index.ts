import { Router } from 'express';
import authRoutes from './auth.routes';
import gameRoutes from './game.routes';

const router = Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/games', gameRoutes);

// Placeholder routes - we'll add these next
// router.use('/reviews', reviewsRoutes);
// router.use('/lists', listsRoutes);

export default router;
