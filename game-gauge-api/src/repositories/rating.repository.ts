import { prisma } from '../config/database';
import { Rating } from '@prisma/client';

export interface RatingWithUser extends Rating {
  user: {
    id: string;
    username: string;
    avatar: string | null;
  };
}

export interface RatingStats {
  averageScore: number;
  totalRatings: number;
  distribution: {
    score: number;
    count: number;
  }[];
}

export interface PaginatedRatings {
  data: RatingWithUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class RatingRepository {
  /**
   * Create or update a rating (upsert)
   * If user already rated this game, update their rating
   */
  async upsert(userId: string, gameId: string, score: number): Promise<Rating> {
    return prisma.rating.upsert({
      where: {
        userId_gameId: {
          userId,
          gameId,
        },
      },
      create: {
        userId,
        gameId,
        score,
      },
      update: {
        score,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Find user's rating for a specific game
   */
  async findByUserAndGame(userId: string, gameId: string): Promise<Rating | null> {
    return prisma.rating.findUnique({
      where: {
        userId_gameId: {
          userId,
          gameId,
        },
      },
    });
  }

  /**
   * Get all ratings for a game with pagination
   */
  async findByGame(gameId: string, page: number, limit: number): Promise<PaginatedRatings> {
    const skip = (page - 1) * limit;

    const [ratings, total] = await Promise.all([
      prisma.rating.findMany({
        where: { gameId },
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
        },
      }),
      prisma.rating.count({ where: { gameId } }),
    ]);

    return {
      data: ratings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get all ratings by a user
   */
  async findByUser(userId: string, page: number, limit: number): Promise<PaginatedRatings> {
    const skip = (page - 1) * limit;

    const [ratings, total] = await Promise.all([
      prisma.rating.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
        },
      }),
      prisma.rating.count({ where: { userId } }),
    ]);

    return {
      data: ratings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Delete a rating
   */
  async delete(userId: string, gameId: string): Promise<Rating> {
    return prisma.rating.delete({
      where: {
        userId_gameId: {
          userId,
          gameId,
        },
      },
    });
  }

  /**
   * Get rating statistics for a game
   * Returns average score, total count, and distribution (how many 1s, 2s, etc.)
   */
  async getStats(gameId: string): Promise<RatingStats> {
    const ratings = await prisma.rating.findMany({
      where: { gameId },
      select: {
        score: true,
      },
    });

    if (ratings.length === 0) {
      return {
        averageScore: 0,
        totalRatings: 0,
        distribution: [],
      };
    }

    // Calculate average
    const sum = ratings.reduce((acc, r) => acc + r.score, 0);
    const averageScore = sum / ratings.length;

    // Calculate distribution (count of each score 1-10)
    const distribution: { score: number; count: number }[] = [];
    for (let score = 1; score <= 10; score++) {
      const count = ratings.filter((r) => r.score === score).length;
      if (count > 0) {
        distribution.push({ score, count });
      }
    }

    return {
      averageScore: Math.round(averageScore * 10) / 10, // Round to 1 decimal
      totalRatings: ratings.length,
      distribution,
    };
  }

  /**
   * Check if user has rated a game
   */
  async hasUserRated(userId: string, gameId: string): Promise<boolean> {
    const count = await prisma.rating.count({
      where: {
        userId,
        gameId,
      },
    });
    return count > 0;
  }

  /**
   * Get average rating for a game
   */
  async getAverageRating(gameId: string): Promise<number> {
    const result = await prisma.rating.aggregate({
      where: { gameId },
      _avg: {
        score: true,
      },
    });

    return result._avg.score || 0;
  }

  /**
   * Get user's recent ratings (for profile, activity feed, etc.)
   */
  async getRecentByUser(userId: string, limit: number = 10): Promise<RatingWithUser[]> {
    return prisma.rating.findMany({
      where: { userId },
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        game: {
          select: {
            id: true,
            title: true,
            slug: true,
            coverImage: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
    });
  }
}

export const ratingRepository = new RatingRepository();
