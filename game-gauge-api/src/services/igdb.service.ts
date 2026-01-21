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
  genres?: Array<{
    id: number;
    name: string;
  }>;
  platforms?: Array<{
    id: number;
    name: string;
    abbreviation?: string;
  }>;
  involved_companies?: Array<{
    company: {
      id: number;
      name: string;
    };
    developer: boolean;
    publisher: boolean;
  }>;
  rating?: number; // 0-100
  rating_count?: number;
  aggregated_rating?: number; // Metacritic-like
  aggregated_rating_count?: number;
  screenshots?: Array<{
    id: number;
    url: string;
    image_id: string;
  }>;
  videos?: Array<{
    id: number;
    video_id: string;
    name?: string;
  }>;
  websites?: Array<{
    id: number;
    url: string;
    category: number;
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
      return this.accessToken;
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
  async searchGames(query: string, limit: number = 10): Promise<IGDBSearchResult[]> {
    const apicalypseQuery = `
      search "${query}";
      fields name, cover.url, cover.image_id, first_release_date, rating, platforms.name, platforms.abbreviation;
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
}

export const igdbService = new IGDBService();
