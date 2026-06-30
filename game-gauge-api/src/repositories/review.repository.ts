import { prisma } from '../config/database';
import { Review, Prisma } from '@prisma/client';

export interface ReviewWithUser extends Review {
  user: {
    id: string;
    username: string;
    avatar: string | null;
  };
  _count?: {
    helpfulVotes: number;
  };
  game?: {
    id: string;
    title: string;
    coverImage: string | null;
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

export interface ProfileReviewItem {
  id: string;
  content: string;
  spoilers: boolean;
  createdAt: Date;
  game: { id: string; title: string; slug: string; coverImage: string | null };
  _count: { helpfulVotes: number };
}

export interface ProfileReviewPage {
  items: ProfileReviewItem[];
  total: number;
  page: number;
  hasMore: boolean;
}

export class ReviewRepository {
  /**
   * Create a new review
   */
  async create(data: {
    content: string;
    userId: string;
    gameId: string;
    ratingId?: string;
    spoilers?: boolean;
  }): Promise<Review> {
    return prisma.review.create({
      data: {
        content: data.content,
        userId: data.userId,
        gameId: data.gameId,
        ratingId: data.ratingId,
        spoilers: data.spoilers || false,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        rating: {
          select: {
            id: true,
            score: true,
          },
        },
        _count: {
          select: {
            helpfulVotes: true,
          },
        },
      },
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
        _count: {
          select: {
            helpfulVotes: true,
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
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        rating: {
          select: {
            id: true,
            score: true,
          },
        },
        _count: {
          select: {
            helpfulVotes: true,
          },
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
    sortBy: 'createdAt' | 'updatedAt' | 'helpfulCount' = 'helpfulCount',
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
          _count: {
            select: {
              helpfulVotes: true,
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
    sortBy: 'createdAt' | 'updatedAt' | 'helpfulCount' = 'createdAt',
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
      orderBy: { createdAt: 'desc' },
      include: {
        game: {
          // ← THIS IS MISSING
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
        _count: {
          select: {
            helpfulVotes: true,
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
        game: {
          // ← THIS IS MISSING
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
        _count: {
          select: {
            helpfulVotes: true,
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

  /**
   * Update review content and/or spoiler flag
   */
  async updateContent(id: string, data: { content?: string; spoilers?: boolean }): Promise<Review> {
    return prisma.review.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        rating: {
          select: {
            id: true,
            score: true,
          },
        },
        _count: {
          select: {
            helpfulVotes: true,
          },
        },
      },
    });
  }

  /**
   * Add helpful vote to review
   */
  async addHelpfulVote(reviewId: string, userId: string): Promise<void> {
    await prisma.$transaction([
      // Create the vote
      prisma.reviewHelpful.create({
        data: {
          reviewId,
          userId,
        },
      }),
      // Increment the count
      prisma.review.update({
        where: { id: reviewId },
        data: {
          helpfulCount: {
            increment: 1,
          },
        },
      }),
    ]);
  }

  /**
   * Remove helpful vote from review
   */
  async removeHelpfulVote(reviewId: string, userId: string): Promise<void> {
    await prisma.$transaction([
      // Delete the vote
      prisma.reviewHelpful.delete({
        where: {
          userId_reviewId: {
            userId,
            reviewId,
          },
        },
      }),
      // Decrement the count
      prisma.review.update({
        where: { id: reviewId },
        data: {
          helpfulCount: {
            decrement: 1,
          },
        },
      }),
    ]);
  }

  /**
   * Check if user has voted helpful on a review
   */
  async hasUserVotedHelpful(reviewId: string, userId: string): Promise<boolean> {
    const vote = await prisma.reviewHelpful.findUnique({
      where: {
        userId_reviewId: {
          userId,
          reviewId,
        },
      },
    });
    return !!vote;
  }

  /**
   * Get paginated reviews for a user profile (includes game data)
   */
  async findByUserProfile(userId: string, page: number, limit: number): Promise<ProfileReviewPage> {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      prisma.review.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          content: true,
          spoilers: true,
          createdAt: true,
          game: { select: { id: true, title: true, slug: true, coverImage: true } },
          _count: { select: { helpfulVotes: true } },
        },
      }),
      prisma.review.count({ where: { userId } }),
    ]);
    return { items, total, page, hasMore: skip + items.length < total };
  }

  /**
   * Get user's helpful votes for multiple reviews
   */
  async getUserHelpfulVotes(userId: string, reviewIds: string[]): Promise<string[]> {
    const votes = await prisma.reviewHelpful.findMany({
      where: {
        userId,
        reviewId: {
          in: reviewIds,
        },
      },
      select: {
        reviewId: true,
      },
    });
    return votes.map((v) => v.reviewId);
  }
}

export const reviewRepository = new ReviewRepository();
