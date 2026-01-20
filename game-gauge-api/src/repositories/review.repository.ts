import { prisma } from '../config/database';
import { Review, Prisma } from '@prisma/client';

export interface ReviewWithUser extends Review {
  user: {
    id: string;
    username: string;
    avatar: string | null;
  };
}

export interface PaginatedReviews {
  data: ReviewWithUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class ReviewRepository {
  /**
   * Create a new review
   */
  async create(data: Prisma.ReviewCreateInput): Promise<Review> {
    return prisma.review.create({
      data,
    });
  }

  /**
   * Find review by ID
   */
  async findById(id: string): Promise<ReviewWithUser | null> {
    return prisma.review.findUnique({
      where: { id },
      include: {
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

  /**
   * Find user's review for a specific game
   */
  async findByUserAndGame(userId: string, gameId: string): Promise<Review | null> {
    return prisma.review.findUnique({
      where: {
        userId_gameId: {
          userId,
          gameId,
        },
      },
    });
  }

  /**
   * Get all reviews for a game with pagination
   */
  async findByGame(
    gameId: string,
    page: number,
    limit: number,
    sortBy: 'createdAt' | 'updatedAt' = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc'
  ): Promise<PaginatedReviews> {
    const skip = (page - 1) * limit;

    const orderBy: Prisma.ReviewOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where: { gameId },
        skip,
        take: limit,
        orderBy,
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
      prisma.review.count({ where: { gameId } }),
    ]);

    return {
      data: reviews,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get all reviews by a user
   */
  async findByUser(
    userId: string,
    page: number,
    limit: number,
    sortBy: 'createdAt' | 'updatedAt' = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc'
  ): Promise<PaginatedReviews> {
    const skip = (page - 1) * limit;

    const orderBy: Prisma.ReviewOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy,
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
      prisma.review.count({ where: { userId } }),
    ]);

    return {
      data: reviews,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update a review
   */
  async update(id: string, content: string): Promise<Review> {
    return prisma.review.update({
      where: { id },
      data: {
        content,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Delete a review
   */
  async delete(id: string): Promise<Review> {
    return prisma.review.delete({
      where: { id },
    });
  }

  /**
   * Check if review exists
   */
  async exists(id: string): Promise<boolean> {
    const count = await prisma.review.count({
      where: { id },
    });
    return count > 0;
  }

  /**
   * Check if user has reviewed a game
   */
  async hasUserReviewed(userId: string, gameId: string): Promise<boolean> {
    const count = await prisma.review.count({
      where: {
        userId,
        gameId,
      },
    });
    return count > 0;
  }

  /**
   * Get recent reviews by user (for profile, activity feed)
   */
  async getRecentByUser(userId: string, limit: number = 10): Promise<ReviewWithUser[]> {
    return prisma.review.findMany({
      where: { userId },
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
    });
  }

  /**
   * Get recent reviews across the platform (for homepage, activity feed)
   */
  async getRecentReviews(limit: number = 10): Promise<ReviewWithUser[]> {
    return prisma.review.findMany({
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
    });
  }

  /**
   * Get review count for a game
   */
  async getGameReviewCount(gameId: string): Promise<number> {
    return prisma.review.count({
      where: { gameId },
    });
  }

  /**
   * Get review count for a user
   */
  async getUserReviewCount(userId: string): Promise<number> {
    return prisma.review.count({
      where: { userId },
    });
  }
}

export const reviewRepository = new ReviewRepository();
