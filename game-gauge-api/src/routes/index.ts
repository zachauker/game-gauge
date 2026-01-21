import { Router } from 'express';
import authRoutes from './auth.routes';
import gameRoutes from './game.routes';
import ratingRoutes from './rating.routes';
import reviewRoutes from './review.routes';
import igdbRoutes from './igdb.routes';
import listRoutes from './list.routes';

const router = Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/games', gameRoutes);
router.use('/ratings', ratingRoutes);
router.use('/reviews', reviewRoutes);
router.use('/igdb', igdbRoutes);
router.use('/lists', listRoutes);

export default router;
