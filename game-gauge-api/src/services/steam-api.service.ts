import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger.util';

// ──────────────────────────────────────────────
// Steam Web API response types
// ──────────────────────────────────────────────

export interface SteamOwnedGame {
  appid: number;
  name?: string;
  playtime_forever: number;
  playtime_2weeks?: number;
  img_icon_url?: string;
  playtime_windows_forever?: number;
  playtime_mac_forever?: number;
  playtime_linux_forever?: number;
  rtime_last_played?: number;
}

export interface SteamOwnedGamesResponse {
  response: {
    game_count?: number;
    games?: SteamOwnedGame[];
  };
}

export interface SteamRecentGame {
  appid: number;
  name: string;
  playtime_2weeks: number;
  playtime_forever: number;
  img_icon_url?: string;
}

export interface SteamRecentGamesResponse {
  response: {
    total_count?: number;
    games?: SteamRecentGame[];
  };
}

export interface SteamWishlistItem {
  appid: number;
  priority: number;
  date_added: number;
}

export interface SteamWishlistResponse {
  response: {
    items?: SteamWishlistItem[];
  };
}

export interface SteamPlayerSummary {
  steamid: string;
  personaname: string;
  profileurl: string;
  avatar: string;
  avatarmedium: string;
  avatarfull: string;
  personastate: number;
  communityvisibilitystate: number;
  lastlogoff?: number;
  timecreated?: number;
  loccountrycode?: string;
}

export interface SteamPlayerSummariesResponse {
  response: {
    players: SteamPlayerSummary[];
  };
}

export interface SteamLevelResponse {
  response: {
    player_level?: number;
  };
}

export interface SteamAchievement {
  apiname: string;
  achieved: number; // 1 = unlocked, 0 = locked
  unlocktime: number; // unix timestamp (0 if not achieved)
  name?: string;
  description?: string;
}

export interface SteamPlayerAchievementsResponse {
  playerstats: {
    steamID: string;
    gameName: string;
    achievements?: SteamAchievement[];
    success: boolean;
    error?: string;
  };
}

/**
 * Low-level wrapper around the Steam Web API.
 * All methods return raw Steam data — transformation happens in the sync service.
 */
export class SteamApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.steampowered.com',
      timeout: 15_000,
    });
  }

  // ──────────────────────────────────────────────
  // IPlayerService
  // ──────────────────────────────────────────────

  /**
   * Get all games owned by a player.
   * Returns appid, name, playtime.  Profile must be public.
   */
  async getOwnedGames(steamId: string): Promise<SteamOwnedGame[]> {
    try {
      const { data } = await this.client.get<SteamOwnedGamesResponse>(
        '/IPlayerService/GetOwnedGames/v1',
        {
          params: {
            key: env.STEAM_API_KEY,
            steamid: steamId,
            include_appinfo: true,
            include_played_free_games: true,
            format: 'json',
          },
        }
      );

      if (!data.response.games) {
        logger.warn(`Steam GetOwnedGames returned empty for ${steamId} — profile may be private`);
        return [];
      }

      logger.info(`Steam: fetched ${data.response.game_count} owned games for ${steamId}`);
      return data.response.games;
    } catch (error: any) {
      logger.error(`Steam GetOwnedGames failed for ${steamId}:`, error.message);
      throw new Error(`Failed to fetch Steam library: ${error.message}`);
    }
  }

  /**
   * Get games played in the last 2 weeks.
   */
  async getRecentlyPlayedGames(steamId: string, count: number = 0): Promise<SteamRecentGame[]> {
    try {
      const { data } = await this.client.get<SteamRecentGamesResponse>(
        '/IPlayerService/GetRecentlyPlayedGames/v1',
        {
          params: {
            key: env.STEAM_API_KEY,
            steamid: steamId,
            count,
            format: 'json',
          },
        }
      );

      if (!data.response.games) {
        logger.warn(`Steam GetRecentlyPlayedGames returned empty for ${steamId}`);
        return [];
      }

      logger.info(`Steam: fetched ${data.response.total_count} recent games for ${steamId}`);
      return data.response.games;
    } catch (error: any) {
      logger.error(`Steam GetRecentlyPlayedGames failed for ${steamId}:`, error.message);
      throw new Error(`Failed to fetch recent Steam games: ${error.message}`);
    }
  }

  /**
   * Get the player's Steam Level.
   */
  async getSteamLevel(steamId: string): Promise<number | null> {
    try {
      const { data } = await this.client.get<SteamLevelResponse>(
        '/IPlayerService/GetSteamLevel/v1',
        {
          params: { key: env.STEAM_API_KEY, steamid: steamId, format: 'json' },
        }
      );
      return data.response.player_level ?? null;
    } catch (error: any) {
      logger.error(`Steam GetSteamLevel failed for ${steamId}:`, error.message);
      return null;
    }
  }

  // ──────────────────────────────────────────────
  // ISteamUserStats
  // ──────────────────────────────────────────────

  /**
   * Get a player's achievement list for a specific game.
   * Returns an empty array if the game has no achievements, the profile is
   * private, or the user has never launched the game.
   */
  async getPlayerAchievements(steamId: string, appId: number): Promise<SteamAchievement[]> {
    try {
      const { data } = await this.client.get<SteamPlayerAchievementsResponse>(
        '/ISteamUserStats/GetPlayerAchievements/v1',
        {
          params: {
            key: env.STEAM_API_KEY,
            steamid: steamId,
            appid: appId,
            format: 'json',
          },
        }
      );

      if (!data.playerstats.success || !data.playerstats.achievements) {
        logger.warn(
          `Steam GetPlayerAchievements returned no data for appId ${appId} / ${steamId}: ${data.playerstats.error ?? 'unknown'}`
        );
        return [];
      }

      logger.info(
        `Steam: fetched ${data.playerstats.achievements.length} achievements for appId ${appId}`
      );
      return data.playerstats.achievements;
    } catch (error: any) {
      logger.error(`Steam GetPlayerAchievements failed for appId ${appId}:`, error.message);
      // Non-fatal — caller handles empty result gracefully
      return [];
    }
  }

  // ──────────────────────────────────────────────
  // IWishlistService
  // ──────────────────────────────────────────────

  async getWishlist(steamId: string): Promise<SteamWishlistItem[]> {
    try {
      const { data } = await this.client.get<SteamWishlistResponse>(
        '/IWishlistService/GetWishlist/v1',
        {
          params: { key: env.STEAM_API_KEY, steamid: steamId, format: 'json' },
        }
      );

      if (!data.response.items) {
        logger.warn(`Steam GetWishlist returned empty for ${steamId}`);
        return [];
      }

      logger.info(`Steam: fetched ${data.response.items.length} wishlist items for ${steamId}`);
      return data.response.items;
    } catch (error: any) {
      logger.error(`Steam GetWishlist failed for ${steamId}:`, error.message);
      throw new Error(`Failed to fetch Steam wishlist: ${error.message}`);
    }
  }

  // ──────────────────────────────────────────────
  // ISteamUser
  // ──────────────────────────────────────────────

  async getPlayerSummary(steamId: string): Promise<SteamPlayerSummary | null> {
    logger.info(
      `Steam API key present: ${!!env.STEAM_API_KEY}, length: ${env.STEAM_API_KEY?.length}`
    );
    try {
      const { data } = await this.client.get<SteamPlayerSummariesResponse>(
        '/ISteamUser/GetPlayerSummaries/v2',
        {
          params: { key: env.STEAM_API_KEY, steamids: steamId, format: 'json' },
        }
      );

      if (!data.response.players || data.response.players.length === 0) return null;
      return data.response.players[0];
    } catch (error: any) {
      logger.error(
        `Steam GetPlayerSummaries FULL ERROR: ${JSON.stringify({
          status: error.response?.status,
          data: error.response?.data,
          code: error.code,
          message: error.message,
          url: error.config?.url,
          params: error.config?.params,
        })}`
      );
      return null;
    }
  }

  /**
   * Check if a player's profile (game details) is public.
   * communityvisibilitystate: 1 = Private, 3 = Public
   */
  async isProfilePublic(steamId: string): Promise<boolean> {
    const summary = await this.getPlayerSummary(steamId);
    return summary?.communityvisibilitystate === 3;
  }

  // ──────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────

  /**
   * Build a Steam app icon URL from the appid and icon hash.
   */
  static getIconUrl(appId: number, iconHash: string): string {
    if (!iconHash) return '';
    return `https://media.steampowered.com/steamcommunity/public/images/apps/${appId}/${iconHash}.jpg`;
  }

  /**
   * Map personastate int to a human-readable status.
   */
  static getOnlineStatus(state: number): string {
    const statuses: Record<number, string> = {
      0: 'Offline',
      1: 'Online',
      2: 'Busy',
      3: 'Away',
      4: 'Snooze',
      5: 'Looking to Trade',
      6: 'Looking to Play',
    };
    return statuses[state] ?? 'Unknown';
  }
}

export const steamApiService = new SteamApiService();
