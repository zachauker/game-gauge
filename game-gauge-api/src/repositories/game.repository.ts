import { prisma } from '../config/database';
import { Game, Prisma } from '@prisma/client';
import { ListGamesQuery } from '../validators/game.validator';

export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface SearchOptions {
  search?: string;
  genre?: string;
  platform?: string;
  sortBy?: 'title' | 'releaseDate' | 'createdAt' | 'metacritic';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class GameRepository {
  /**
   * Create a new game
   */
  async create(data: Prisma.GameCreateInput): Promise<Game> {
    return prisma.game.create({
      data,
    });
  }

  /**
   * Find game by ID
   */
  async findById(id: string): Promise<Game | null> {
    return prisma.game.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            reviews: true,
            ratings: true,
          },
        },
      },
    });
  }

  /**
   * Find game by slug (SEO-friendly URL)
   */
  async findBySlug(slug: string): Promise<Game | null> {
    return prisma.game.findUnique({
      where: { slug },
      include: {
        _count: {
          select: {
            reviews: true,
            ratings: true,
          },
        },
      },
    });
  }

  /**
   * Find game by IGDB ID (external API)
   */
  async findByIgdbId(igdbId: number): Promise<Game | null> {
    return prisma.game.findUnique({
      where: { igdbId },
    });
  }

  /**
   * Find all games with pagination, search, and filtering
   */
  async findAll(options: ListGamesQuery): Promise<PaginatedResult<Game>> {
    const {
      page,
      limit,
      search,
      genre,
      platform,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = options;

    // Build where clause for filtering
    const where: Prisma.GameWhereInput = {};

    // Search by title
    if (search) {
      where.title = {
        contains: search,
        mode: 'insensitive', // Case-insensitive search
      };
    }

    // Filter by genre
    if (genre) {
      where.genres = {
        has: genre,
      };
    }

    // Filter by platform
    if (platform) {
      where.platforms = {
        has: platform,
      };
    }

    // Build orderBy clause
    const orderBy: Prisma.GameOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute queries in parallel
    const [games, total] = await Promise.all([
      prisma.game.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          _count: {
            select: {
              reviews: true,
              ratings: true,
            },
          },
        },
      }),
      prisma.game.count({ where }),
    ]);

    return {
      data: games,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update game by ID
   */
  async update(id: string, data: Prisma.GameUpdateInput): Promise<Game> {
    return prisma.game.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete game by ID
   */
  async delete(id: string): Promise<Game> {
    return prisma.game.delete({
      where: { id },
    });
  }

  /**
   * Check if game exists by ID
   */
  async exists(id: string): Promise<boolean> {
    const count = await prisma.game.count({
      where: { id },
    });
    return count > 0;
  }

  /**
   * Check if slug is available (for creating unique slugs)
   */
  async isSlugAvailable(slug: string, excludeId?: string): Promise<boolean> {
    const where: Prisma.GameWhereInput = { slug };

    // Exclude current game ID when updating
    if (excludeId) {
      where.id = { not: excludeId };
    }

    const count = await prisma.game.count({ where });
    return count === 0;
  }

  /**
   * Get games with highest ratings (for homepage, recommendations, etc.)
   */
  async findTopRated(limit: number = 10): Promise<Game[]> {
    // This is a complex query - we'll calculate average ratings
    const games = await prisma.game.findMany({
      take: limit,
      include: {
        ratings: {
          select: {
            score: true,
          },
        },
        _count: {
          select: {
            reviews: true,
            ratings: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc', // Default ordering
      },
    });

    // Calculate average ratings and sort
    const gamesWithAvgRating = games
      .map((game) => {
        const ratings = game.ratings;
        const avgRating =
          ratings.length > 0 ? ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length : 0;

        // Remove the ratings array from the result (we don't need to send it to client)
        const { ratings: _, ...gameWithoutRatings } = game;

        return {
          ...gameWithoutRatings,
          avgRating,
        };
      })
      .sort((a, b) => b.avgRating - a.avgRating)
      .slice(0, limit);

    return gamesWithAvgRating as any; // Type assertion since we modified the structure
  }

  /**
   * Get recently added games
   */
  async findRecent(limit: number = 10): Promise<Game[]> {
    return prisma.game.findMany({
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        _count: {
          select: {
            reviews: true,
            ratings: true,
          },
        },
      },
    });
  }
}

export const gameRepository = new GameRepository();
