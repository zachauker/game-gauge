import { steamApiService, SteamApiService, SteamOwnedGame } from './steam-api.service';
import { igdbService } from './igdb.service';
import { gameImportService } from './gameImport.service';
import { userRepository } from '../repositories/user.repository';
import {
  steamMappingRepository,
  steamLibrarySyncRepository,
} from '../repositories/steam-sync.repository';
import { BadRequestError, NotFoundError } from '../utils/errors.util';
import { logger } from '../utils/logger.util';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface SyncResult {
  totalGames: number;
  matchedGames: number;
  unmatchedGames: number;
  newlyImported: number;
  syncDuration: number; // milliseconds
}

export interface SteamProfileInfo {
  steamId: string;
  personaName: string;
  profileUrl: string;
  avatarFull: string;
  onlineStatus: string;
  isPublic: boolean;
  steamLevel: number | null;
  memberSince: Date | null;
  lastLogoff: Date | null;
  country: string | null;
}

// ──────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────

export class SteamSyncService {
  /**
   * Full library sync: fetch all owned games from Steam, match to IGDB, cache in DB.
   * This is the heavyweight operation — should be triggered explicitly by the user.
   */
  async syncLibrary(userId: string): Promise<SyncResult> {
    const startTime = Date.now();

    // 1. Get user's Steam ID
    const steamId = await this.requireSteamId(userId);

    // 2. Check if profile is public
    const isPublic = await steamApiService.isProfilePublic(steamId);
    if (!isPublic) {
      throw new BadRequestError(
        'Your Steam profile or game details are set to private. ' +
          'Please make them public in Steam Settings → Privacy to sync your library.'
      );
    }

    // 3. Fetch owned games from Steam
    const steamGames = await steamApiService.getOwnedGames(steamId);
    if (steamGames.length === 0) {
      throw new BadRequestError(
        'No games found in your Steam library. Make sure your game details are set to public.'
      );
    }

    logger.info(`Steam sync: ${steamGames.length} games for user ${userId}`);

    // 4. Match Steam games to IGDB / Game Gauge games
    const matchResults = await this.matchSteamGames(steamGames);

    // 5. Save all library entries to the cache
    const entries = steamGames.map((sg) => {
      const mapping = matchResults.get(sg.appid);
      return {
        userId,
        steamAppId: sg.appid,
        gameId: mapping?.gameId ?? null,
        name: sg.name ?? `App ${sg.appid}`,
        playtimeForever: sg.playtime_forever ?? 0,
        playtimeRecent: sg.playtime_2weeks ?? 0,
        iconUrl: sg.img_icon_url ? SteamApiService.getIconUrl(sg.appid, sg.img_icon_url) : null,
        lastPlayed: sg.rtime_last_played ? new Date(sg.rtime_last_played * 1000) : null,
      };
    });

    await steamLibrarySyncRepository.upsertMany(entries);

    // 6. Remove games no longer in the user's library (refunds, etc.)
    const currentAppIds = steamGames.map((g) => g.appid);
    await steamLibrarySyncRepository.removeStaleEntries(userId, currentAppIds);

    // 7. Compute stats
    const matched = entries.filter((e) => e.gameId !== null).length;
    const newlyImported =
      matchResults.size > 0
        ? Array.from(matchResults.values()).filter((m) => m.newlyImported).length
        : 0;

    const result: SyncResult = {
      totalGames: steamGames.length,
      matchedGames: matched,
      unmatchedGames: steamGames.length - matched,
      newlyImported,
      syncDuration: Date.now() - startTime,
    };

    logger.info(
      `Steam sync complete for user ${userId}: ${result.matchedGames}/${result.totalGames} matched, ` +
        `${result.newlyImported} newly imported, took ${result.syncDuration}ms`
    );

    return result;
  }

  /**
   * Lightweight sync: only fetch and update recently played games.
   * Much faster than a full sync — good for periodic background refresh.
   */
  async syncRecentlyPlayed(userId: string): Promise<SyncResult> {
    const startTime = Date.now();
    const steamId = await this.requireSteamId(userId);

    const recentGames = await steamApiService.getRecentlyPlayedGames(steamId);
    if (recentGames.length === 0) {
      return {
        totalGames: 0,
        matchedGames: 0,
        unmatchedGames: 0,
        newlyImported: 0,
        syncDuration: Date.now() - startTime,
      };
    }

    // Convert to the same shape as owned games for matching
    const asOwnedGames: SteamOwnedGame[] = recentGames.map((rg) => ({
      appid: rg.appid,
      name: rg.name,
      playtime_forever: rg.playtime_forever,
      playtime_2weeks: rg.playtime_2weeks,
      img_icon_url: rg.img_icon_url,
    }));

    const matchResults = await this.matchSteamGames(asOwnedGames);

    const entries = asOwnedGames.map((sg) => {
      const mapping = matchResults.get(sg.appid);
      return {
        userId,
        steamAppId: sg.appid,
        gameId: mapping?.gameId ?? null,
        name: sg.name ?? `App ${sg.appid}`,
        playtimeForever: sg.playtime_forever ?? 0,
        playtimeRecent: sg.playtime_2weeks ?? 0,
        iconUrl: sg.img_icon_url ? SteamApiService.getIconUrl(sg.appid, sg.img_icon_url) : null,
        lastPlayed: null, // not available from recent endpoint
      };
    });

    await steamLibrarySyncRepository.upsertMany(entries);

    const matched = entries.filter((e) => e.gameId !== null).length;

    return {
      totalGames: recentGames.length,
      matchedGames: matched,
      unmatchedGames: recentGames.length - matched,
      newlyImported: Array.from(matchResults.values()).filter((m) => m.newlyImported).length,
      syncDuration: Date.now() - startTime,
    };
  }

  /**
   * Get the user's cached Steam library.
   */
  async getLibrary(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      sortBy?: 'playtimeForever' | 'playtimeRecent' | 'name' | 'lastPlayed';
      sortOrder?: 'asc' | 'desc';
      matchedOnly?: boolean;
    } = {}
  ) {
    await this.requireSteamId(userId);

    const syncStatus = await steamLibrarySyncRepository.getSyncStatus(userId);

    if (syncStatus.totalGames === 0) {
      return {
        syncStatus,
        data: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
      };
    }

    const result = await steamLibrarySyncRepository.getUserLibrary(userId, options);

    return {
      syncStatus,
      ...result,
    };
  }

  /**
   * Get recently played games from cache.
   */
  async getRecentlyPlayed(userId: string, limit: number = 20) {
    await this.requireSteamId(userId);
    return steamLibrarySyncRepository.getRecentlyPlayed(userId, limit);
  }

  /**
   * Get the user's Steam wishlist (fetched live — not cached).
   */
  async getWishlist(userId: string) {
    const steamId = await this.requireSteamId(userId);

    const wishlistItems = await steamApiService.getWishlist(steamId);

    if (wishlistItems.length === 0) {
      return [];
    }

    // Try to match wishlist items to known mappings
    const appIds = wishlistItems.map((item) => item.appid);
    const existingMappings = await steamMappingRepository.findManyBySteamAppIds(appIds);
    const mappingMap = new Map(existingMappings.map((m) => [m.steamAppId, m]));

    return wishlistItems.map((item) => {
      const mapping = mappingMap.get(item.appid);
      return {
        steamAppId: item.appid,
        name: mapping?.gameName ?? `App ${item.appid}`,
        priority: item.priority,
        dateAdded: new Date(item.date_added * 1000),
        gameId: mapping?.gameId ?? null,
        igdbId: mapping?.igdbId ?? null,
        matched: mapping?.matched ?? false,
        storeUrl: `https://store.steampowered.com/app/${item.appid}`,
      };
    });
  }

  /**
   * Get the user's Steam profile summary (live fetch).
   */
  async getProfile(userId: string): Promise<SteamProfileInfo> {
    const steamId = await this.requireSteamId(userId);

    const [summary, level] = await Promise.all([
      steamApiService.getPlayerSummary(steamId),
      steamApiService.getSteamLevel(steamId),
    ]);

    if (!summary) {
      throw new NotFoundError('Steam profile not found');
    }

    return {
      steamId: summary.steamid,
      personaName: summary.personaname,
      profileUrl: summary.profileurl,
      avatarFull: summary.avatarfull,
      onlineStatus: SteamApiService.getOnlineStatus(summary.personastate),
      isPublic: summary.communityvisibilitystate === 3,
      steamLevel: level,
      memberSince: summary.timecreated ? new Date(summary.timecreated * 1000) : null,
      lastLogoff: summary.lastlogoff ? new Date(summary.lastlogoff * 1000) : null,
      country: summary.loccountrycode ?? null,
    };
  }

  /**
   * Get sync status metadata (for showing in UI before/after sync).
   */
  async getSyncStatus(userId: string) {
    await this.requireSteamId(userId);
    return steamLibrarySyncRepository.getSyncStatus(userId);
  }

  // ──────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────

  /**
   * Get and validate user's Steam ID, or throw.
   */
  private async requireSteamId(userId: string): Promise<string> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    if (!user.steamId) {
      throw new BadRequestError('No Steam account linked. Please link your Steam account first.');
    }
    return user.steamId;
  }

  /**
   * Match an array of Steam games to IGDB games.
   * Uses the global SteamAppMapping cache to avoid redundant IGDB queries.
   *
   * Returns a Map of steamAppId → { gameId, newlyImported }
   */
  private async matchSteamGames(
    steamGames: SteamOwnedGame[]
  ): Promise<Map<number, { gameId: string | null; newlyImported: boolean }>> {
    const results = new Map<number, { gameId: string | null; newlyImported: boolean }>();

    const appIds = steamGames.map((g) => g.appid);

    // 1. Check existing mappings in our cache
    const existingMappings = await steamMappingRepository.findManyBySteamAppIds(appIds);
    const cachedMap = new Map(existingMappings.map((m) => [m.steamAppId, m]));

    const unmappedGames: SteamOwnedGame[] = [];

    for (const sg of steamGames) {
      const cached = cachedMap.get(sg.appid);
      if (cached) {
        results.set(sg.appid, { gameId: cached.gameId, newlyImported: false });
      } else {
        unmappedGames.push(sg);
      }
    }

    if (unmappedGames.length === 0) {
      return results;
    }

    logger.info(`Steam sync: ${unmappedGames.length} unmapped games to look up in IGDB`);

    // 2. Batch lookup unmapped games via IGDB external_games endpoint
    // IGDB allows up to 500 items per request, process in batches
    const BATCH_SIZE = 500;

    for (let i = 0; i < unmappedGames.length; i += BATCH_SIZE) {
      const batch = unmappedGames.slice(i, i + BATCH_SIZE);
      const batchAppIds = batch.map((g) => g.appid);

      try {
        const igdbMatches = await this.lookupSteamAppsInIGDB(batchAppIds);

        // Process matches — import into Game Gauge and save mappings
        const mappingsToSave = [];

        for (const sg of batch) {
          const igdbId = igdbMatches.get(sg.appid);
          let gameId: string | null = null;
          let newlyImported = false;

          if (igdbId) {
            try {
              const game = await gameImportService.getOrImportGame(igdbId);
              gameId = game.id;
              // Check if this was newly created (not previously in our DB)
              newlyImported = true; // Simplified — getOrImportGame handles dedup
            } catch (error: any) {
              logger.warn(
                `Failed to import IGDB game ${igdbId} for Steam app ${sg.appid}: ${error.message}`
              );
            }
          }

          mappingsToSave.push({
            steamAppId: sg.appid,
            igdbId: igdbId ?? null,
            gameId,
            gameName: sg.name ?? `App ${sg.appid}`,
            matched: gameId !== null,
          });

          results.set(sg.appid, { gameId, newlyImported });
        }

        // Save all mappings to cache
        await steamMappingRepository.upsertMany(mappingsToSave);
      } catch (error: any) {
        logger.error(`IGDB batch lookup failed for batch starting at index ${i}: ${error.message}`);

        // Save unmatched mappings so we don't retry immediately
        const failedMappings = batch.map((sg) => ({
          steamAppId: sg.appid,
          igdbId: null,
          gameId: null,
          gameName: sg.name ?? `App ${sg.appid}`,
          matched: false,
        }));
        await steamMappingRepository.upsertMany(failedMappings);

        for (const sg of batch) {
          results.set(sg.appid, { gameId: null, newlyImported: false });
        }
      }
    }

    return results;
  }

  /**
   * Query IGDB's external_games endpoint to find IGDB IDs for Steam AppIDs.
   * Category 1 = Steam in IGDB's external_games schema.
   *
   * Returns Map<steamAppId, igdbGameId>
   */
  private async lookupSteamAppsInIGDB(steamAppIds: number[]): Promise<Map<number, number>> {
    const results = new Map<number, number>();

    if (steamAppIds.length === 0) return results;

    // IGDB external_games: uid is the Steam AppID (as string), category 1 = Steam
    const uids = steamAppIds.map((id) => `"${id}"`).join(',');
    const query = `
      fields game, uid, category;
      where category = 1 & uid = (${uids});
      limit 500;
    `;

    try {
      const externalGames = await igdbService.queryExternalGames(query);

      for (const eg of externalGames) {
        const steamAppId = parseInt(eg.uid, 10);
        if (!isNaN(steamAppId) && eg.game) {
          results.set(steamAppId, eg.game);
        }
      }

      logger.info(`IGDB external_games: matched ${results.size}/${steamAppIds.length} Steam apps`);
    } catch (error: any) {
      logger.error(`IGDB external_games query failed: ${error.message}`);
    }

    return results;
  }
}

export const steamSyncService = new SteamSyncService();
