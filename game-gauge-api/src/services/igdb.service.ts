import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger.util';

/**
 * IGDB API Response Types
 */
export interface IGDBGame {
  id: number;
  name: string;
  slug?: string;
  summary?: string;
  storyline?: string;
  url?: string;
  cover?: {
    id: number;
    url: string;
    image_id: string;
  };
  first_release_date?: number; // Unix timestamp
  release_dates?: Array<{
    id: number;
    date: number;
    platform: number;
    human: string;
  }>;
  genres?: Array<{ id: number; name: string }>;
  themes?: Array<{ id: number; name: string }>;
  game_modes?: Array<{ id: number; name: string }>;
  player_perspectives?: Array<{ id: number; name: string }>;
  franchises?: Array<{ id: number; name: string }>;
  age_ratings?: Array<{
    id: number;
    category: number; // 1=ESRB, 2=PEGI
    rating: number;   // ESRB: 6=RP,7=EC,8=E,9=E10+,10=T,11=M,12=AO | PEGI: 1=3,2=7,3=12,4=16,5=18
  }>;
  platforms?: Array<{
    id: number;
    name: string;
    abbreviation?: string;
  }>;
  involved_companies?: Array<{
    company: { id: number; name: string };
    developer: boolean;
    publisher: boolean;
  }>;
  rating?: number;              // IGDB community rating 0-100
  rating_count?: number;
  aggregated_rating?: number;   // Critic/aggregated score 0-100
  aggregated_rating_count?: number;
  screenshots?: Array<{
    id: number;
    url: string;
    image_id: string;
  }>;
  videos?: Array<{
    id: number;
    video_id: string; // YouTube video ID
    name?: string;
  }>;
  websites?: Array<{
    id: number;
    url: string;
    category: number; // 1=official,13=steam,16=reddit,5=twitter,9=youtube,etc.
  }>;
  similar_games?: number[];
}

export interface IGDBSearchResult {
  id: number;
  name: string;
  cover?: {
    url: string;
    image_id: string;
  };
  first_release_date?: number;
  rating?: number;
  platforms?: Array<{
    name: string;
    abbreviation?: string;
  }>;
  genres?: Array<{ id: number; name: string }>;
}

export interface IGDBExternalGame {
  id: number;
  game: number; // IGDB game ID
  category: number; // 1 = Steam, 5 = GOG, 11 = Epic, etc.
  uid: string; // External ID (Steam AppID as string)
}

/**
 * IGDB API Service
 * Wrapper for Twitch IGDB API v4
 * Docs: https://api-docs.igdb.com/
 */
export class IGDBService {
  private client: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.igdb.com/v4',
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  }

  /**
   * Get OAuth access token from Twitch
   * IGDB API requires Twitch OAuth token
   */
  private async getAccessToken(): Promise<string> {
    // Check if we have a valid token
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    try {
      const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
        params: {
          client_id: env.IGDB_CLIENT_ID,
          client_secret: env.IGDB_CLIENT_SECRET,
          grant_type: 'client_credentials',
        },
      });

      this.accessToken = response.data.access_token;
      // Token expires in seconds, convert to milliseconds and add buffer
      this.tokenExpiresAt = Date.now() + (response.data.expires_in - 300) * 1000;

      logger.info('IGDB access token obtained');
      return this.accessToken as string;
    } catch (error) {
      logger.error('Failed to get IGDB access token:', error);
      throw new Error('Failed to authenticate with IGDB API');
    }
  }

  /**
   * Make a request to IGDB API with automatic token refresh
   */
  private async request<T>(endpoint: string, query: string): Promise<T> {
    const token = await this.getAccessToken();

    try {
      const response = await this.client.post(endpoint, query, {
        headers: {
          'Client-ID': env.IGDB_CLIENT_ID,
          Authorization: `Bearer ${token}`,
        },
      });

      logger.info(
        `IGDB ${endpoint} status: ${response.status}, data type: ${typeof response.data}, isArray: ${Array.isArray(response.data)}, raw: ${JSON.stringify(response.data).substring(0, 500)}`
      );

      return response.data;
    } catch (error: any) {
      logger.error(`IGDB API error on ${endpoint}:`, error.response?.data || error.message);
      throw new Error(`IGDB API request failed: ${error.message}`);
    }
  }

  /**
   * Search for games by name
   * Returns simplified results suitable for search dropdown/list
   */
  async searchGames(
    query: string,
    limit: number = 10,
    genreId?: number
  ): Promise<IGDBSearchResult[]> {
    const genreClause = genreId ? `where genres = (${genreId});` : '';
    const apicalypseQuery = `
      search "${query}";
      fields name, cover.url, cover.image_id, first_release_date, rating, platforms.name, platforms.abbreviation, genres.name;
      ${genreClause}
      limit ${limit};
    `;

    const results = await this.request<IGDBGame[]>('/games', apicalypseQuery.trim());

    // Transform to search result format
    return results.map((game) => ({
      id: game.id,
      name: game.name,
      cover: game.cover
        ? {
            url: this.getImageUrl(game.cover.image_id, 'cover_big'),
            image_id: game.cover.image_id,
          }
        : undefined,
      first_release_date: game.first_release_date,
      rating: game.rating,
      platforms: game.platforms,
      genres: game.genres,
    }));
  }

  /**
   * Get detailed game information by IGDB ID
   */
  async getGameById(igdbId: number): Promise<IGDBGame | null> {
    const apicalypseQuery = `
      fields name, slug, summary, storyline, url,
             cover.url, cover.image_id,
             first_release_date,
             release_dates.date, release_dates.platform, release_dates.human,
             genres.name,
             themes.name,
             game_modes.name,
             player_perspectives.name,
             franchises.name,
             age_ratings.category, age_ratings.rating,
             platforms.name, platforms.abbreviation,
             involved_companies.company.name, involved_companies.developer, involved_companies.publisher,
             rating, rating_count, aggregated_rating, aggregated_rating_count,
             screenshots.url, screenshots.image_id,
             videos.video_id, videos.name,
             websites.url, websites.category,
             similar_games;
      where id = ${igdbId};
      limit 1;
    `;

    const results = await this.request<IGDBGame[]>('/games', apicalypseQuery.trim());

    if (results.length === 0) {
      return null;
    }

    const game = results[0];

    // Transform cover image URLs to high quality
    if (game.cover?.image_id) {
      game.cover.url = this.getImageUrl(game.cover.image_id, 'cover_big');
    }

    // Transform screenshot URLs
    if (game.screenshots) {
      game.screenshots = game.screenshots.map((screenshot) => ({
        ...screenshot,
        url: this.getImageUrl(screenshot.image_id, 'screenshot_big'),
      }));
    }

    return game;
  }

  /**
   * Get multiple games by IGDB IDs (batch request)
   */
  async getGamesByIds(igdbIds: number[]): Promise<IGDBGame[]> {
    if (igdbIds.length === 0) {
      return [];
    }

    const idsString = igdbIds.join(',');
    const apicalypseQuery = `
      fields name, slug, cover.url, cover.image_id, first_release_date, rating, platforms.name;
      where id = (${idsString});
      limit ${igdbIds.length};
    `;

    const results = await this.request<IGDBGame[]>('/games', apicalypseQuery.trim());

    // Transform cover URLs
    return results.map((game) => {
      if (game.cover?.image_id) {
        game.cover.url = this.getImageUrl(game.cover.image_id, 'cover_big');
      }
      return game;
    });
  }

  /**
   * Get popular/trending games
   * Based on rating and rating count
   */
  async getPopularGames(limit: number = 20): Promise<IGDBSearchResult[]> {
    const apicalypseQuery = `
      fields name, cover.url, cover.image_id, first_release_date, rating, platforms.name, platforms.abbreviation;
      where total_rating_count > 50;
      sort total_rating desc;
      limit ${limit};
    `;

    const results = await this.request<IGDBGame[]>('/games', apicalypseQuery.trim());

    return results.map((game) => ({
      id: game.id,
      name: game.name,
      cover: game.cover
        ? {
            url: this.getImageUrl(game.cover.image_id, 'cover_big'),
            image_id: game.cover.image_id,
          }
        : undefined,
      first_release_date: game.first_release_date,
      rating: game.rating,
      platforms: game.platforms,
    }));
  }

  /**
   * Get recently released games
   */
  async getRecentGames(limit: number = 20): Promise<IGDBSearchResult[]> {
    const now = Math.floor(Date.now() / 1000);
    const sixMonthsAgo = now - 15552000; // 180 days in seconds

    const apicalypseQuery = `
      fields name, cover.url, cover.image_id, first_release_date, rating, platforms.name, platforms.abbreviation;
      where first_release_date >= ${sixMonthsAgo} & first_release_date <= ${now};
      sort first_release_date desc;
      limit ${limit};
    `;

    const results = await this.request<IGDBGame[]>('/games', apicalypseQuery.trim());

    return results.map((game) => ({
      id: game.id,
      name: game.name,
      cover: game.cover
        ? {
            url: this.getImageUrl(game.cover.image_id, 'cover_big'),
            image_id: game.cover.image_id,
          }
        : undefined,
      first_release_date: game.first_release_date,
      rating: game.rating,
      platforms: game.platforms,
    }));
  }

  /**
   * Helper: Get properly formatted IGDB image URL
   * Image sizes: thumb, cover_small, cover_big, screenshot_med, screenshot_big, etc.
   */
  private getImageUrl(imageId: string, size: string = 'cover_big'): string {
    return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg`;
  }

  /**
   * Helper: Convert Unix timestamp to ISO date string
   */
  convertTimestampToDate(timestamp?: number): string | undefined {
    if (!timestamp) return undefined;
    return new Date(timestamp * 1000).toISOString();
  }

  /**
   * Helper: Extract developers from involved_companies
   */
  extractDevelopers(game: IGDBGame): string[] {
    if (!game.involved_companies) return [];
    return game.involved_companies.filter((ic) => ic.developer).map((ic) => ic.company.name);
  }

  /**
   * Helper: Extract publishers from involved_companies
   */
  extractPublishers(game: IGDBGame): string[] {
    if (!game.involved_companies) return [];
    return game.involved_companies.filter((ic) => ic.publisher).map((ic) => ic.company.name);
  }

  /**
   * Helper: Decode IGDB age_ratings into a human-readable string.
   * Prefers ESRB (category 1), falls back to PEGI (category 2).
   *
   * ESRB rating values: 6=RP, 7=EC, 8=E, 9=E10+, 10=T, 11=M, 12=AO
   * PEGI rating values: 1=3, 2=7, 3=12, 4=16, 5=18
   */
  extractAgeRating(game: IGDBGame): string | undefined {
    if (!game.age_ratings || game.age_ratings.length === 0) return undefined;

    const ESRB_MAP: Record<number, string> = {
      6: 'RP', 7: 'EC', 8: 'E', 9: 'E10+', 10: 'T', 11: 'M', 12: 'AO',
    };
    const PEGI_MAP: Record<number, string> = {
      1: 'PEGI 3', 2: 'PEGI 7', 3: 'PEGI 12', 4: 'PEGI 16', 5: 'PEGI 18',
    };

    const esrb = game.age_ratings.find((r) => r.category === 1);
    if (esrb) return ESRB_MAP[esrb.rating];

    const pegi = game.age_ratings.find((r) => r.category === 2);
    if (pegi) return PEGI_MAP[pegi.rating];

    return undefined;
  }

  /**
   * Helper: Extract official and Steam website URLs from IGDB websites array.
   * Website category reference: 1=official, 13=steam
   */
  extractWebsites(game: IGDBGame): { official?: string; steam?: string } {
    if (!game.websites) return {};
    const official = game.websites.find((w) => w.category === 1)?.url;
    const steam    = game.websites.find((w) => w.category === 13)?.url;
    return { official, steam };
  }

  /**
   * Query the IGDB external_games endpoint.
   * Used to map Steam AppIDs (and other store IDs) to IGDB game IDs.
   *
   * Category reference:
   *   1 = Steam, 5 = GOG, 10 = YouTube, 11 = Microsoft Store,
   *   13 = Apple App Store, 14 = Twitch, 15 = Android, 20 = Amazon,
   *   26 = Epic Game Store, 28 = Oculus, 36 = Xbox Marketplace
   *
   * Example query:
   *   fields game, uid, category;
   *   where category = 1 & uid = ("730", "570", "440");
   *   limit 500;
   */
  /**
   * Fetch similar games for a given IGDB game ID.
   *
   * Resolves in two queries:
   *   1. Fetch the parent game to extract its similar_games ID array
   *   2. Batch-fetch those IDs for cover/rating/platform data
   *
   * Returns an empty array if the game has no similar_games or the ID is invalid.
   */
  async getSimilarGames(igdbId: number, limit: number = 8): Promise<IGDBSearchResult[]> {
    // Step 1: get the parent game's similar_games IDs
    const parentQuery = `
      fields similar_games;
      where id = ${igdbId};
      limit 1;
    `;

    const parents = await this.request<{ id: number; similar_games?: number[] }[]>(
      '/games',
      parentQuery.trim()
    );

    const similarIds = parents[0]?.similar_games;
    if (!similarIds || similarIds.length === 0) return [];

    // Step 2: batch-fetch the similar games (cover, rating, platforms)
    const ids = similarIds.slice(0, limit);
    const batchQuery = `
      fields name, slug, cover.url, cover.image_id, first_release_date, rating, platforms.name, platforms.abbreviation;
      where id = (${ids.join(',')}) & cover != null;
      limit ${ids.length};
    `;

    const results = await this.request<IGDBSearchResult[]>('/games', batchQuery.trim());

    // Transform cover image URLs to the standard cover_big size
    return results.map((g) => ({
      ...g,
      cover: g.cover
        ? { ...g.cover, url: this.getImageUrl(g.cover.image_id, 'cover_big') }
        : undefined,
    }));
  }

  /**
   * Fetch all media (screenshots + videos) for a given IGDB game ID.
   * Returned as-is — not stored in our DB, served live on each page load.
   *
   * Screenshots are sized to screenshot_huge (1280×720) for lightbox display.
   */
  async getGameMedia(igdbId: number): Promise<{
    screenshots: Array<{ imageId: string; url: string }>;
    videos: Array<{ videoId: string; name: string }>;
  }> {
    const query = `
      fields screenshots.image_id, screenshots.url,
             videos.video_id, videos.name;
      where id = ${igdbId};
      limit 1;
    `;

    const results = await this.request<IGDBGame[]>('/games', query.trim());
    const game = results[0];

    if (!game) return { screenshots: [], videos: [] };

    const screenshots = (game.screenshots ?? []).map((s) => ({
      imageId: s.image_id,
      url:     this.getImageUrl(s.image_id, 'screenshot_huge'),
    }));

    const videos = (game.videos ?? []).map((v) => ({
      videoId: v.video_id,
      name:    v.name ?? 'Video',
    }));

    return { screenshots, videos };
  }

  async queryExternalGames(query: string): Promise<IGDBExternalGame[]> {
    logger.info(`queryExternalGames sending query: ${query.trim()}`);
    const result = this.request<IGDBExternalGame[]>('/external_games', query.trim());
    logger.info(`queryExternalGames response: ${JSON.stringify(result)}`);
    return result;
  }
}

export const igdbService = new IGDBService();
