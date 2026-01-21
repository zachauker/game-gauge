import { Router } from 'express';
import { listController } from '../controllers/list.controller';
import { authenticate, optionalAuth } from '../middleware/auth.middleware';

const router = Router();

/**
 * Public routes
 */

/**
 * @route   GET /api/lists/public
 * @desc    Get public lists (discovery)
 * @access  Public
 * @note    Must be before /:id to avoid matching "public" as an ID
 */
router.get('/public', listController.getPublicLists.bind(listController));

/**
 * @route   GET /api/lists/popular
 * @desc    Get popular lists (by item count)
 * @access  Public
 * @note    Must be before /:id to avoid matching "popular" as an ID
 */
router.get('/popular', listController.getPopularLists.bind(listController));

/**
 * @route   GET /api/lists/user/:userId
 * @desc    Get all lists by a specific user
 * @access  Public (shows public lists only unless owner)
 */
router.get('/user/:userId', optionalAuth, listController.getUserLists.bind(listController));

/**
 * @route   GET /api/lists/:id
 * @desc    Get a single list by ID
 * @access  Public (if list is public) / Private (if list is private and user is owner)
 */
router.get('/:id', optionalAuth, listController.findById.bind(listController));

/**
 * Protected routes (authentication required)
 */

/**
 * @route   GET /api/lists/me
 * @desc    Get all lists by current user
 * @access  Private
 * @note    Must be after /public and /popular
 */
router.get('/me', authenticate, listController.getMyLists.bind(listController));

/**
 * @route   POST /api/lists
 * @desc    Create a new list
 * @access  Private
 */
router.post('/', authenticate, listController.create.bind(listController));

/**
 * @route   PATCH /api/lists/:id
 * @desc    Update a list
 * @access  Private (owner only)
 */
router.patch('/:id', authenticate, listController.update.bind(listController));

/**
 * @route   DELETE /api/lists/:id
 * @desc    Delete a list
 * @access  Private (owner only)
 */
router.delete('/:id', authenticate, listController.delete.bind(listController));

/**
 * List item management routes
 */

/**
 * @route   POST /api/lists/:id/games
 * @desc    Add a game to a list
 * @access  Private (owner only)
 */
router.post('/:id/games', authenticate, listController.addGame.bind(listController));

/**
 * @route   DELETE /api/lists/:id/games/:gameId
 * @desc    Remove a game from a list
 * @access  Private (owner only)
 */
router.delete('/:id/games/:gameId', authenticate, listController.removeGame.bind(listController));

/**
 * @route   PATCH /api/lists/:id/games/:gameId
 * @desc    Update a list item (notes, order)
 * @access  Private (owner only)
 */
router.patch('/:id/games/:gameId', authenticate, listController.updateListItem.bind(listController));

/**
 * @route   POST /api/lists/:id/reorder
 * @desc    Reorder items in a list
 * @access  Private (owner only)
 */
router.post('/:id/reorder', authenticate, listController.reorderItems.bind(listController));

export default router;
