import { Router } from 'express';
import { listController } from '../controllers/list.controller';
import { authenticate, optionalAuth } from '../middleware/auth.middleware';

const router = Router();

// ─── Static named routes (must come before /:id) ─────────────────────────────

/**
 * @route   GET /api/lists/defaults
 * @desc    Get the three default list IDs for the current user
 * @access  Private
 */
router.get('/defaults', authenticate, listController.getDefaults.bind(listController));

/**
 * @route   GET /api/lists/public
 * @desc    Get public lists (discovery)
 * @access  Public
 */
router.get('/public', listController.getPublicLists.bind(listController));

/**
 * @route   GET /api/lists/popular
 * @desc    Get popular lists (by item count)
 * @access  Public
 */
router.get('/popular', listController.getPopularLists.bind(listController));

/**
 * @route   GET /api/lists/me
 * @desc    Get all lists for the current user
 * @access  Private
 */
router.get('/me', authenticate, listController.getMyLists.bind(listController));

// ─── User-scoped lists ────────────────────────────────────────────────────────

/**
 * @route   GET /api/lists/user/:userId
 * @desc    Get all lists by a specific user
 * @access  Public (public lists only unless owner)
 */
router.get('/user/:userId', optionalAuth, listController.getUserLists.bind(listController));

// ─── Single list CRUD ─────────────────────────────────────────────────────────

/**
 * @route   GET /api/lists/:id
 * @access  Public (if public) / Private (if private, owner only)
 */
router.get('/:id', optionalAuth, listController.findById.bind(listController));

/**
 * @route   POST /api/lists
 * @access  Private
 */
router.post('/', authenticate, listController.create.bind(listController));

/**
 * @route   PATCH /api/lists/:id
 * @access  Private (owner only)
 */
router.patch('/:id', authenticate, listController.update.bind(listController));

/**
 * @route   DELETE /api/lists/:id
 * @access  Private (owner only)
 */
router.delete('/:id', authenticate, listController.delete.bind(listController));

// ─── List item management ─────────────────────────────────────────────────────

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
 * @desc    Update a list item (notes, order, progressPct, progressNote)
 * @access  Private (owner only)
 */
router.patch(
  '/:id/games/:gameId',
  authenticate,
  listController.updateListItem.bind(listController)
);

/**
 * @route   POST /api/lists/:id/games/:gameId/sync-achievements
 * @desc    Refresh Steam achievement cache for a Currently Playing item
 * @access  Private (owner only, Steam account required)
 */
router.post(
  '/:id/games/:gameId/sync-achievements',
  authenticate,
  listController.syncAchievements.bind(listController)
);

/**
 * @route   POST /api/lists/:id/reorder
 * @desc    Reorder items in a list
 * @access  Private (owner only)
 */
router.post('/:id/reorder', authenticate, listController.reorderItems.bind(listController));

/**
 * @route   POST /api/lists/completed/add
 * @desc    Mark a game as completed — moves it from Currently Playing,
 *          records completionType, and optionally saves rating + review
 * @access  Private
 */
router.post('/completed/add', authenticate, listController.completeGame.bind(listController));

export default router;
