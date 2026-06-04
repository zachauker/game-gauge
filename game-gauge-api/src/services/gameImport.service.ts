import { igdbService } from './igdb.service';
import { gameRepository } from '../repositories/game.repository';
import { generateSlug, generateUniqueSlug } from '../utils/slug.util';
import { NotFoundError } from '../utils/errors.util';
import { logger } from '../utils/logger.util';

/**
 * Service for importing and refreshing games from IGDB.
 * Games are only imported when a user first interacts with them
 * (rate, review, add to list) — lazy-import on demand.
 */
export class GameImportService {

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Extract all structured metadata from an IGDBGame object into the shape
   * expected by our database. Used by both importGame and refreshGame so
   * the logic stays in one place.
   */
  private extractMetadata(igdbGame: ReturnType<typeof igdbService.getGameById> extends Promise<infer T> ? Exclude<T, null> : never) {
    const developers  = igdbService.extractDevelopers(igdbGame);
    const publishers  = igdbService.extractPublishers(igdbGame);
    const websites    = igdbService.extractWebsites(igdbGame);
    const ageRating   = igdbService.extractAgeRating(igdbGame);

    const genres       = igdbGame.genres?.map((g) => g.name)              ?? [];
    const themes       = igdbGame.themes?.map((t) => t.name)              ?? [];
    const gameModes    = igdbGame.game_modes?.map((m) => m.name)          ?? [];
    const perspectives = igdbGame.player_perspectives?.map((p) => p.name) ?? [];
    const platforms    = igdbGame.platforms?.map((p) => p.name)           ?? [];

    // Primary franchise name (first entry if multiple)
    const franchise = igdbGame.franchises?.[0]?.name ?? undefined;

    const releaseDate  = igdbGame.first_release_date
      ? new Date(igdbGame.first_release_date * 1000)
      : undefined;

    const coverImage   = igdbGame.cover?.url;

    // IGDB aggregated_rating is critic score 0–100, stored as metacritic
    const metacritic   = igdbGame.aggregated_rating
      ? Math.round(igdbGame.aggregated_rating)
      : undefined;

    // IGDB community rating 0–100, normalised to 0–10 for consistency
    const igdbRating   = igdbGame.rating
      ? Math.round((igdbGame.rating / 10) * 10) / 10  // 1 decimal place
      : undefined;
    const igdbRatingCount = igdbGame.rating_count ?? undefined;

    return {
      title:            igdbGame.name,
      description:      igdbGame.summary || undefined,
      storyline:        igdbGame.storyline || undefined,
      releaseDate,
      developer:        developers[0],
      publisher:        publishers[0],
      genres,
      themes,
      gameModes,
      perspectives,
      platforms,
      coverImage,
      metacritic,
      franchise,
      ageRating,
      igdbRating,
      igdbRatingCount,
      websiteOfficial:  websites.official,
      websiteSteam:     websites.steam,
    };
  }

  // ── Public methods ───────────────────────────────────────────────────────

  /**
   * Import a game from IGDB by its IGDB ID.
   * If the game already exists in our DB, returns the existing record.
   */
  async importGame(igdbId: number) {
    const existingGame = await gameRepository.findByIgdbId(igdbId);
    if (existingGame) {
      logger.info(`Game ${igdbId} already in database`);
      return existingGame;
    }

    const igdbGame = await igdbService.getGameById(igdbId);
    if (!igdbGame) throw new NotFoundError(`Game with ID ${igdbId} not found`);

    logger.info(`Importing game: ${igdbGame.name} (ID: ${igdbId})`);

    const baseSlug = generateSlug(igdbGame.name);
    const slug     = await generateUniqueSlug(
      baseSlug,
      gameRepository.isSlugAvailable.bind(gameRepository)
    );

    const meta = this.extractMetadata(igdbGame);
    const game = await gameRepository.create({ igdbId, slug, ...meta });

    logger.info(`Imported: ${game.title} (${game.id})`);
    return game;
  }

  /**
   * Import multiple games by IGDB ID. Skips already-imported games silently.
   */
  async importGames(igdbIds: number[]) {
    const results = {
      imported: [] as string[],
      skipped:  [] as number[],
      failed:   [] as { igdbId: number; error: string }[],
    };

    for (const igdbId of igdbIds) {
      try {
        const game = await this.importGame(igdbId);
        if (game) results.imported.push(game.id);
      } catch (error: any) {
        if (error.message.includes('already in database')) {
          results.skipped.push(igdbId);
        } else {
          results.failed.push({ igdbId, error: error.message });
        }
      }
    }

    return results;
  }

  /**
   * Get a game from our DB, importing from IGDB if not present.
   */
  async getOrImportGame(igdbId: number) {
    return (await gameRepository.findByIgdbId(igdbId)) ?? this.importGame(igdbId);
  }

  /**
   * Refresh all metadata for an existing game from IGDB.
   * Useful for backfilling new fields on already-imported games.
   */
  async refreshGame(gameId: string) {
    const game = await gameRepository.findById(gameId);
    if (!game)        throw new NotFoundError('Game not found');
    if (!game.igdbId) throw new Error('Game has no associated external ID');

    const igdbGame = await igdbService.getGameById(game.igdbId);
    if (!igdbGame) throw new NotFoundError('Game data not found in external source');

    logger.info(`Refreshing: ${game.title} (ID: ${game.igdbId})`);

    const meta       = this.extractMetadata(igdbGame);
    const updatedGame = await gameRepository.update(gameId, meta);

    logger.info(`Refreshed: ${updatedGame.title}`);
    return updatedGame;
  }

  /**
   * Check whether a game is already in our database by IGDB ID.
   */
  async gameExistsInDatabase(igdbId: number): Promise<boolean> {
    return (await gameRepository.findByIgdbId(igdbId)) !== null;
  }
}

export const gameImportService = new GameImportService();
