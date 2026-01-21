import { igdbService, IGDBGame } from './igdb.service';
import { gameRepository } from '../repositories/game.repository';
import { generateSlug, generateUniqueSlug } from '../utils/slug.util';
import { ConflictError, NotFoundError } from '../utils/errors.util';
import { logger } from '../utils/logger.util';

/**
 * Service for importing games from IGDB into our database
 * Only imports when users interact with games (rate, review, add to list)
 */
export class GameImportService {
  /**
   * Import a game from IGDB by its IGDB ID
   * Returns our internal game record
   */
  async importGame(igdbId: number) {
    // Check if game already exists in our database
    const existingGame = await gameRepository.findByIgdbId(igdbId);
    if (existingGame) {
      logger.info(`Game ${igdbId} already in database`);
      return existingGame;
    }

    // Fetch game data from IGDB
    const igdbGame = await igdbService.getGameById(igdbId);
    if (!igdbGame) {
      throw new NotFoundError(`Game with IGDB ID ${igdbId} not found`);
    }

    logger.info(`Importing game: ${igdbGame.name} (IGDB ID: ${igdbId})`);

    // Generate unique slug
    const baseSlug = generateSlug(igdbGame.name);
    const slug = await generateUniqueSlug(
      baseSlug,
      gameRepository.isSlugAvailable.bind(gameRepository)
    );

    // Extract data from IGDB format
    const developers = igdbService.extractDevelopers(igdbGame);
    const publishers = igdbService.extractPublishers(igdbGame);
    const genres = igdbGame.genres?.map((g) => g.name) || [];
    const platforms = igdbGame.platforms?.map((p) => p.name) || [];

    // Convert release date
    const releaseDate = igdbGame.first_release_date
      ? new Date(igdbGame.first_release_date * 1000)
      : undefined;

    // Get cover image URL
    const coverImage = igdbGame.cover?.url;

    // Calculate metacritic-like score (IGDB aggregated_rating is 0-100)
    const metacritic = igdbGame.aggregated_rating
      ? Math.round(igdbGame.aggregated_rating)
      : undefined;

    // Create game in our database
    const game = await gameRepository.create({
      igdbId,
      title: igdbGame.name,
      slug,
      description: igdbGame.summary || igdbGame.storyline,
      releaseDate,
      developer: developers[0], // Primary developer
      publisher: publishers[0], // Primary publisher
      genres,
      platforms,
      coverImage,
      metacritic,
    });

    logger.info(`Successfully imported game: ${game.title} (ID: ${game.id})`);
    return game;
  }

  /**
   * Import multiple games from IGDB (batch import)
   * Useful for seeding database with popular games
   */
  async importGames(igdbIds: number[]) {
    const results = {
      imported: [] as string[],
      skipped: [] as number[],
      failed: [] as { igdbId: number; error: string }[],
    };

    for (const igdbId of igdbIds) {
      try {
        const game = await this.importGame(igdbId);
        if (game) {
          results.imported.push(game.id);
        }
      } catch (error: any) {
        if (error.message.includes('already in database')) {
          results.skipped.push(igdbId);
        } else {
          results.failed.push({
            igdbId,
            error: error.message,
          });
        }
      }
    }

    return results;
  }

  /**
   * Get or import a game (convenience method)
   * Returns game from our DB if exists, otherwise imports from IGDB
   */
  async getOrImportGame(igdbId: number) {
    // Try to find in our database first
    const existingGame = await gameRepository.findByIgdbId(igdbId);
    if (existingGame) {
      return existingGame;
    }

    // Not in database, import it
    return this.importGame(igdbId);
  }

  /**
   * Refresh game data from IGDB
   * Updates metadata for an existing game in our database
   */
  async refreshGame(gameId: string) {
    // Get game from our database
    const game = await gameRepository.findById(gameId);
    if (!game) {
      throw new NotFoundError('Game not found in database');
    }

    if (!game.igdbId) {
      throw new Error('Game does not have an IGDB ID');
    }

    // Fetch fresh data from IGDB
    const igdbGame = await igdbService.getGameById(game.igdbId);
    if (!igdbGame) {
      throw new NotFoundError(`Game not found in IGDB`);
    }

    logger.info(`Refreshing game: ${game.title} (IGDB ID: ${game.igdbId})`);

    // Extract updated data
    const developers = igdbService.extractDevelopers(igdbGame);
    const publishers = igdbService.extractPublishers(igdbGame);
    const genres = igdbGame.genres?.map((g) => g.name) || [];
    const platforms = igdbGame.platforms?.map((p) => p.name) || [];

    const releaseDate = igdbGame.first_release_date
      ? new Date(igdbGame.first_release_date * 1000)
      : undefined;

    const coverImage = igdbGame.cover?.url;
    const metacritic = igdbGame.aggregated_rating
      ? Math.round(igdbGame.aggregated_rating)
      : undefined;

    // Update game in database
    const updatedGame = await gameRepository.update(gameId, {
      title: igdbGame.name,
      description: igdbGame.summary || igdbGame.storyline,
      releaseDate,
      developer: developers[0],
      publisher: publishers[0],
      genres,
      platforms,
      coverImage,
      metacritic,
    });

    logger.info(`Successfully refreshed game: ${updatedGame.title}`);
    return updatedGame;
  }

  /**
   * Check if a game exists in our database by IGDB ID
   */
  async gameExistsInDatabase(igdbId: number): Promise<boolean> {
    const game = await gameRepository.findByIgdbId(igdbId);
    return game !== null;
  }
}

export const gameImportService = new GameImportService();
