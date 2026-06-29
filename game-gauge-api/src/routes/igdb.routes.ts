import { Router } from 'express';
import { igdbController } from '../controllers/igdb.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * Public routes (no authentication required)
 */

/**
 * @route   GET /api/igdb/search
 * @desc    Search for games in IGDB
 * @access  Public
 * @query   q (required) - Search query
 * @query   limit (optional) - Number of results (1-50, default 10)
 */
router.get('/search', igdbController.search.bind(igdbController));

/**
 * @route   GET /api/igdb/popular
 * @desc    Get popular/highly-rated games from IGDB
 * @access  Public
 * @query   limit (optional) - Number of results (default 20)
 */
router.get('/popular', igdbController.getPopular.bind(igdbController));

/**
 * @route   GET /api/igdb/recent
 * @desc    Get recently released games from IGDB
 * @access  Public
 * @query   limit (optional) - Number of results (default 20)
 */
router.get('/recent', igdbController.getRecent.bind(igdbController));

/**
 * @route   GET /api/igdb/games/:igdbId
 * @desc    Get detailed game information from IGDB by IGDB ID
 * @access  Public
 * @param   igdbId - IGDB game ID
 */
router.get('/games/:igdbId', igdbController.getGameById.bind(igdbController));

/**
 * @route   GET /api/igdb/media/:igdbId
 * @desc    Get screenshots and videos for a game (live from source, not cached)
 * @access  Public
 */
router.get('/media/:igdbId', igdbController.getGameMedia.bind(igdbController));

/**
 * @route   GET /api/igdb/similar/:igdbId
 * @desc    Get similar games from IGDB for a given IGDB game ID.
 *          Returns up to 8 games with an inDatabase flag for each.
 * @access  Public
 * @param   igdbId - IGDB game ID of the source game
 */
router.get('/similar/:igdbId', igdbController.getSimilarGames.bind(igdbController));

/**
 * Protected routes (authentication required)
 */

/**
 * @route   POST /api/igdb/import
 * @desc    Import a game from IGDB to our database
 * @access  Private
 * @body    { igdbId: number }
 */
router.post('/import', authenticate, igdbController.importGame.bind(igdbController));

/**
 * @route   POST /api/igdb/refresh/:gameId
 * @desc    Refresh game data from IGDB (admin/maintenance)
 * @access  Private (TODO: Admin only)
 * @param   gameId - Our internal game ID (UUID)
 */
router.post('/refresh/:gameId', authenticate, igdbController.refreshGame.bind(igdbController));

export default router;
