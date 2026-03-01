import { Router } from 'express';
import { steamSyncController } from '../controllers/steam-sync.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All Steam data routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/steam/sync/library
 * @desc    Trigger a full Steam library sync (fetches all owned games,
 *          matches them to IGDB, imports into Game Gauge)
 * @access  Private
 * @note    This can take 10-30s for large libraries. Consider showing
 *          a progress indicator on the frontend.
 */
router.post('/sync/library', steamSyncController.syncLibrary.bind(steamSyncController));

/**
 * @route   POST /api/steam/sync/recent
 * @desc    Sync only recently played games (last 2 weeks).
 *          Much lighter than a full sync.
 * @access  Private
 */
router.post('/sync/recent', steamSyncController.syncRecent.bind(steamSyncController));

/**
 * @route   GET /api/steam/sync/status
 * @desc    Get sync metadata (last sync time, game counts, match rate)
 * @access  Private
 */
router.get('/sync/status', steamSyncController.getSyncStatus.bind(steamSyncController));

/**
 * @route   GET /api/steam/library
 * @desc    Get the user's cached Steam library (from last sync)
 * @access  Private
 * @query   page (default 1), limit (default 50, max 200),
 *          sortBy (playtimeForever|playtimeRecent|name|lastPlayed),
 *          sortOrder (asc|desc), matchedOnly (true|false)
 */
router.get('/library', steamSyncController.getLibrary.bind(steamSyncController));

/**
 * @route   GET /api/steam/recent
 * @desc    Get recently played games from the sync cache
 * @access  Private
 * @query   limit (default 20, max 100)
 */
router.get('/recent', steamSyncController.getRecentlyPlayed.bind(steamSyncController));

/**
 * @route   GET /api/steam/wishlist
 * @desc    Get the user's Steam wishlist (live fetch from Steam API)
 * @access  Private
 */
router.get('/wishlist', steamSyncController.getWishlist.bind(steamSyncController));

/**
 * @route   GET /api/steam/profile
 * @desc    Get Steam profile summary (online status, level, visibility)
 * @access  Private
 */
router.get('/profile', steamSyncController.getProfile.bind(steamSyncController));

export default router;
