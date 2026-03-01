import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger.util';

// ──────────────────────────────────────────────
// Steam Web API response types
// ──────────────────────────────────────────────

export interface SteamOwnedGame {
  appid: number;
  name?: string;
  playtime_forever: number;        // total minutes played
  playtime_2weeks?: number;        // minutes played in last 2 weeks
  img_icon_url?: string;
  playtime_windows_forever?: number;
  playtime_mac_forever?: number;
  playtime_linux_forever?: number;
  rtime_last_played?: number;      // unix timestamp (only returned for own key)
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
  date_added: number;              // unix timestamp
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
  personastate: number;            // 0=Offline, 1=Online, 2=Busy, 3=Away, 4=Snooze, 5=Looking to trade, 6=Looking to play
  communityvisibilitystate: number; // 1=Private, 3=Public
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

/**
 * Low-level wrapper around the Steam Web API.
 * All methods return raw Steam data — transformation happens in the sync service.
 *
 * Key constraints:
 * - 100,000 calls per rolling 24 hours
 * - GetOwnedGames / GetRecentlyPlayedGames require the user's profile to be **public**
 * - rtime_last_played is only returned when the API key belongs to the queried user
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
            count, // 0 = all recently played
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
          params: {
            key: env.STEAM_API_KEY,
            steamid: steamId,
            format: 'json',
          },
        }
      );

      return data.response.player_level ?? null;
    } catch (error: any) {
      logger.error(`Steam GetSteamLevel failed for ${steamId}:`, error.message);
      return null;
    }
  }

  // ──────────────────────────────────────────────
  // IWishlistService
  // ──────────────────────────────────────────────

  /**
   * Get the player's wishlist.
   * Note: This endpoint does not require an API key but we pass it anyway.
   * The wishlist must be public.
   */
  async getWishlist(steamId: string): Promise<SteamWishlistItem[]> {
    try {
      const { data } = await this.client.get<SteamWishlistResponse>(
        '/IWishlistService/GetWishlist/v1',
        {
          params: {
            key: env.STEAM_API_KEY,
            steamid: steamId,
            format: 'json',
          },
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

  /**
   * Get player profile summary (visibility, name, avatar, online status).
   */
  async getPlayerSummary(steamId: string): Promise<SteamPlayerSummary | null> {
    try {
      const { data } = await this.client.get<SteamPlayerSummariesResponse>(
        '/ISteamUser/GetPlayerSummaries/v2',
        {
          params: {
            key: env.STEAM_API_KEY,
            steamids: steamId,
            format: 'json',
          },
        }
      );

      if (!data.response.players || data.response.players.length === 0) {
        return null;
      }

      return data.response.players[0];
    } catch (error: any) {
      logger.error(`Steam GetPlayerSummaries failed for ${steamId}:`, error.message);
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
