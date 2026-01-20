import { Router } from 'express';
import authRoutes from './auth.routes';

const router = Router();

// Mount routes
router.use('/auth', authRoutes);

// Placeholder routes - we'll add these next
// router.use('/games', gamesRoutes);
// router.use('/reviews', reviewsRoutes);
// router.use('/lists', listsRoutes);

export default router;
