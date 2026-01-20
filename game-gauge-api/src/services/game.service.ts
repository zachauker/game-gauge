import { gameRepository } from '../repositories/game.repository';
import { ConflictError, NotFoundError } from '../utils/errors.util';
import { generateSlug, generateUniqueSlug } from '../utils/slug.util';
import { CreateGameInput, ListGamesQuery, UpdateGameInput } from '../validators/game.validator';

export class GameService {
  /**
   * Create a new game
   */
  async create(data: CreateGameInput) {
    // Generate slug from title
    const baseSlug = generateSlug(data.title);
    const slug = await generateUniqueSlug(
      baseSlug,
      gameRepository.isSlugAvailable.bind(gameRepository)
    );

    // Check if game with same IGDB ID already exists
    if (data.igdbId) {
      const existingGame = await gameRepository.findByIgdbId(data.igdbId);
      if (existingGame) {
        throw new ConflictError('A game with this IGDB ID already exists');
      }
    }

    return await gameRepository.create({
      ...data,
      slug,
    });
  }

  /**
   * Get all games with pagination, search, and filters
   */
  async findAll(query: ListGamesQuery) {
    return gameRepository.findAll(query);
  }

  /**
   * Get a single game by ID
   */
  async findById(id: string) {
    const game = await gameRepository.findById(id);

    if (!game) {
      throw new NotFoundError('Game not found');
    }

    return game;
  }

  /**
   * Get a single game by slug (SEO-friendly)
   */
  async findBySlug(slug: string) {
    const game = await gameRepository.findBySlug(slug);

    if (!game) {
      throw new NotFoundError('Game not found');
    }

    return game;
  }

  /**
   * Update a game
   */
  async update(id: string, data: UpdateGameInput) {
    // Check if game exists
    const existingGame = await gameRepository.findById(id);
    if (!existingGame) {
      throw new NotFoundError('Game not found');
    }

    // If title is being updated, regenerate slug
    let slug: string | undefined;
    if (data.title) {
      const baseSlug = generateSlug(data.title);
      slug = await generateUniqueSlug(
        baseSlug,
        gameRepository.isSlugAvailable.bind(gameRepository),
        id // Exclude current game from slug availability check
      );
    }

    // Check IGDB ID conflict (if being updated)
    if (data.igdbId && data.igdbId !== existingGame.igdbId) {
      const gameWithSameIgdbId = await gameRepository.findByIgdbId(data.igdbId);
      if (gameWithSameIgdbId && gameWithSameIgdbId.id !== id) {
        throw new ConflictError('A game with this IGDB ID already exists');
      }
    }

    const updatedGame = await gameRepository.update(id, {
      ...data,
      ...(slug && { slug }),
    });

    return updatedGame;
  }

  /**
   * Delete a game
   */
  async delete(id: string) {
    // Check if game exists
    const exists = await gameRepository.exists(id);
    if (!exists) {
      throw new NotFoundError('Game not found');
    }

    // Delete the game (will cascade delete reviews, ratings, list items)
    await gameRepository.delete(id);

    return { message: 'Game deleted successfully' };
  }

  /**
   * Get top-rated games
   */
  async getTopRated(limit: number = 10) {
    return gameRepository.findTopRated(limit);
  }

  /**
   * Get recently added games
   */
  async getRecent(limit: number = 10) {
    return gameRepository.findRecent(limit);
  }
}

export const gameService = new GameService();
