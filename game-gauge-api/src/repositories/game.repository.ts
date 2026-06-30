import { prisma } from '../config/database';
import { Game, Prisma } from '@prisma/client';

export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface SearchOptions {
  search?: string;
  genre?: string;
  platform?: string;
  sortBy?: 'title' | 'releaseDate' | 'createdAt' | 'metacritic' | 'averageRating';
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
  async findAll(options: PaginationOptions & SearchOptions): Promise<PaginatedResult<Game>> {
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
   * Get top rated games (by average rating score)
   */
  async getTopRated(
    limit: number = 20,
    genre?: string
  ): Promise<Array<Game & { averageRating: number; ratingCount: number }>> {
    const genreFilter = genre
      ? Prisma.sql`AND g.genres @> ARRAY[${genre}]::text[]`
      : Prisma.empty;

    return prisma.$queryRaw<Array<Game & { averageRating: number; ratingCount: number }>>(
      Prisma.sql`
        SELECT
          g.*,
          COALESCE(AVG(r.score), 0) as "averageRating",
          COUNT(r.id)::int as "ratingCount"
        FROM "Game" g
        LEFT JOIN "Rating" r ON r."gameId" = g.id
        WHERE 1=1 ${genreFilter}
        GROUP BY g.id
        HAVING COUNT(r.id) >= 3
        ORDER BY AVG(r.score) DESC, COUNT(r.id) DESC
        LIMIT ${limit}
      `
    );
  }

  /**
   * Get trending games (most rated/reviewed recently)
   */
  async getTrending(
    days: number = 7,
    limit: number = 20,
    genre?: string
  ): Promise<Array<Game & { activityCount: number }>> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const genreFilter = genre
      ? Prisma.sql`AND g.genres @> ARRAY[${genre}]::text[]`
      : Prisma.empty;

    return prisma.$queryRaw<Array<Game & { activityCount: number }>>(
      Prisma.sql`
        SELECT
          g.*,
          (
            (SELECT COUNT(*)::int FROM "Rating" WHERE "gameId" = g.id AND "createdAt" >= ${cutoffDate}) +
            (SELECT COUNT(*)::int FROM "Review" WHERE "gameId" = g.id AND "createdAt" >= ${cutoffDate})
          ) as "activityCount"
        FROM "Game" g
        WHERE (
          (SELECT COUNT(*) FROM "Rating" WHERE "gameId" = g.id AND "createdAt" >= ${cutoffDate}) +
          (SELECT COUNT(*) FROM "Review" WHERE "gameId" = g.id AND "createdAt" >= ${cutoffDate})
        ) > 0 ${genreFilter}
        ORDER BY "activityCount" DESC
        LIMIT ${limit}
      `
    );
  }

  /**
   * Get recently reviewed games
   */
  async getRecentlyReviewed(limit: number = 20): Promise<Game[]> {
    const recentReviews = await prisma.review.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        gameId: true,
      },
      distinct: ['gameId'],
    });

    const gameIds = recentReviews.map((r) => r.gameId);

    return prisma.game.findMany({
      where: {
        id: { in: gameIds },
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

  /**
   * Get all unique genres from games
   */
  async getAllGenres(): Promise<string[]> {
    const games = await prisma.game.findMany({
      select: { genres: true },
      where: {
        genres: {
          isEmpty: false,
        },
      },
    });

    // Flatten and deduplicate genres
    const allGenres = games.flatMap((game) => game.genres);
    const uniqueGenres = [...new Set(allGenres)];

    return uniqueGenres.sort();
  }

  /**
   * Get all unique platforms from games
   */
  async getAllPlatforms(): Promise<string[]> {
    const games = await prisma.game.findMany({
      select: { platforms: true },
      where: {
        platforms: {
          isEmpty: false,
        },
      },
    });

    // Flatten and deduplicate platforms
    const allPlatforms = games.flatMap((game) => game.platforms);
    const uniquePlatforms = [...new Set(allPlatforms)];

    return uniquePlatforms.sort();
  }

  /**
   * Get games by genre with pagination
   */
  async findByGenre(
    genre: string | string[],
    options: PaginationOptions & { sortBy?: string; sortOrder?: 'asc' | 'desc' }
  ): Promise<PaginatedResult<Game>> {
    const { page, limit, sortBy = 'createdAt', sortOrder = 'desc' } = options;
    const skip = (page - 1) * limit;

    const where: Prisma.GameWhereInput = {
      genres: {
        has: genre as string,
      },
    };

    const orderBy: Prisma.GameOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

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
  /**
   * Return social context for a game page — which of the requesting user's
   * followed accounts have rated or reviewed this game.
   *
   * Returns an array of friend activity items ordered by rating score desc so
   * the highest ratings surface first in the UI.
   */
  async getFriendsActivity(gameId: string, requestingUserId: string) {
    // Resolve the set of user IDs that the requesting user follows
    const following = await prisma.userFollow.findMany({
      where: { followerId: requestingUserId },
      select: { followingId: true },
    });

    if (following.length === 0) return [];

    const followingIds = following.map((f) => f.followingId);

    // Fetch ratings (and optional review flag) for those users on this game
    const ratings = await prisma.rating.findMany({
      where: {
        gameId,
        userId: { in: followingIds },
      },
      include: {
        user: {
          select: { id: true, username: true, avatar: true },
        },
        // Check if a review also exists for this user+game pair
        game: { select: { id: true } },
      },
      orderBy: { score: 'desc' },
    });

    // Check which of those users also left a review
    const reviewerIds = new Set(
      (
        await prisma.review.findMany({
          where: { gameId, userId: { in: followingIds } },
          select: { userId: true },
        })
      ).map((r) => r.userId)
    );

    return ratings.map((r) => ({
      user:       r.user,
      score:      r.score,
      hasReview:  reviewerIds.has(r.userId),
      ratedAt:    r.createdAt,
    }));
  }

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

  /**
   * Find multiple games by their IGDB IDs, returning rating summary data.
   */
  async findByIgdbIds(
    igdbIds: number[]
  ): Promise<Array<{ igdbId: number; averageRating: number; ratingCount: number; slug: string }>> {
    if (igdbIds.length === 0) return [];

    return prisma.$queryRaw<
      Array<{ igdbId: number; averageRating: number; ratingCount: number; slug: string }>
    >(
      Prisma.sql`
        SELECT
          g."igdbId",
          g.slug,
          COALESCE(AVG(r.score), 0) as "averageRating",
          COUNT(r.id)::int as "ratingCount"
        FROM "Game" g
        LEFT JOIN "Rating" r ON r."gameId" = g.id
        WHERE g."igdbId" = ANY(${igdbIds}::int[])
        GROUP BY g."igdbId", g.slug
      `
    );
  }
}

export const gameRepository = new GameRepository();
