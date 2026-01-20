import { Router } from 'express';
import { gameController } from '../controllers/game.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * Public routes (no authentication required)
 */

/**
 * @route   GET /api/games/top-rated
 * @desc    Get top-rated games
 * @access  Public
 * @note    Must be before /:id route to avoid matching "top-rated" as an ID
 */
router.get('/top-rated', gameController.getTopRated.bind(gameController));

/**
 * @route   GET /api/games/recent
 * @desc    Get recently added games
 * @access  Public
 * @note    Must be before /:id route to avoid matching "recent" as an ID
 */
router.get('/recent', gameController.getRecent.bind(gameController));

/**
 * @route   GET /api/games/slug/:slug
 * @desc    Get game by slug (SEO-friendly URL)
 * @access  Public
 */
router.get('/slug/:slug', gameController.findBySlug.bind(gameController));

/**
 * @route   GET /api/games
 * @desc    Get all games (with pagination, search, filters)
 * @access  Public
 */
router.get('/', gameController.findAll.bind(gameController));

/**
 * @route   GET /api/games/:id
 * @desc    Get single game by ID
 * @access  Public
 */
router.get('/:id', gameController.findById.bind(gameController));

/**
 * Protected routes (authentication required)
 * TODO: Add admin-only middleware for create/update/delete
 */

/**
 * @route   POST /api/games
 * @desc    Create a new game
 * @access  Private (TODO: Admin only)
 */
router.post('/', authenticate, gameController.create.bind(gameController));

/**
 * @route   PATCH /api/games/:id
 * @desc    Update a game
 * @access  Private (TODO: Admin only)
 */
router.patch('/:id', authenticate, gameController.update.bind(gameController));

/**
 * @route   DELETE /api/games/:id
 * @desc    Delete a game
 * @access  Private (TODO: Admin only)
 */
router.delete('/:id', authenticate, gameController.delete.bind(gameController));

export default router;
