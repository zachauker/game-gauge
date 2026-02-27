import { prisma } from '../config/database';
import { User } from '@prisma/client';

export interface UserProfile {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  bio: string | null;
  avatar: string | null;
  createdAt: Date;
}

export interface UserStats {
  totalRatings: number;
  totalReviews: number;
  totalLists: number;
  averageRating: number;
  publicListsCount: number;
  recentActivity: {
    lastRatingDate: Date | null;
    lastReviewDate: Date | null;
  };
}

class UserRepository {
  /**
   * Create a new user (auth)
   */
  async create(data: {
    email?: string;
    username: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    steamId?: string;
    steamUsername?: string;
    steamAvatar?: string;
    steamProfileUrl?: string;
    avatar?: string;
  }): Promise<User> {
    return prisma.user.create({ data });
  }

  /**
   * Find user by email (auth)
   */
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  /**
   * Find user by username (auth)
   */
  async findByUsername(username: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { username },
    });
  }

  /**
   * Find user by ID (auth)
   */
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  /** Find user by Steam ID
   * @param steamId
   * */
  async findBySteamId(steamId: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { steamId },
    });
  }

  /**
   * Update user (auth)
   */
  async update(id: string, data: Partial<User>): Promise<User> {
    return prisma.user.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete user (auth)
   */
  async delete(id: string): Promise<User> {
    return prisma.user.delete({
      where: { id },
    });
  }

  /**
   * Exclude password from user object (auth)
   */
  excludePassword<T extends Partial<User>>(user: T): Omit<T, 'password'> {
    const { ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Get user profile with stats (public profile)
   */
  async getProfile(username: string | string[]): Promise<UserProfile | null> {
    return prisma.user.findUnique({
      where: { username: String(username) },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        bio: true,
        avatar: true,
        createdAt: true,
        _count: {
          select: {
            ratings: true,
            reviews: true,
            lists: true,
          },
        },
      },
    });
  }

  /**
   * Get detailed user statistics
   */
  async getUserStats(userId: string): Promise<UserStats> {
    const [ratings, reviews, lists, avgRating, lastRating, lastReview] = await Promise.all([
      // Total ratings count
      prisma.rating.count({ where: { userId } }),

      // Total reviews count
      prisma.review.count({ where: { userId } }),

      // Total lists count
      prisma.gameList.count({ where: { userId } }),

      // Average rating given
      prisma.rating.aggregate({
        where: { userId },
        _avg: { score: true },
      }),

      // Last rating date
      prisma.rating.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),

      // Last review date
      prisma.review.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    const publicListsCount = await prisma.gameList.count({
      where: {
        userId,
        isPublic: true,
      },
    });

    return {
      totalRatings: ratings,
      totalReviews: reviews,
      totalLists: lists,
      averageRating: avgRating._avg.score || 0,
      publicListsCount,
      recentActivity: {
        lastRatingDate: lastRating?.createdAt || null,
        lastReviewDate: lastReview?.createdAt || null,
      },
    };
  }

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    data: {
      firstName?: string;
      lastName?: string;
      bio?: string;
      avatar?: string;
    }
  ): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  /**
   * Update username
   */
  async updateUsername(userId: string, username: string): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: { username },
    });
  }

  /**
   * Get user's recent ratings
   */
  async getRecentRatings(userId: string, limit: number = 10) {
    return prisma.rating.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        game: {
          select: {
            id: true,
            title: true,
            slug: true,
            coverImage: true,
            releaseDate: true,
          },
        },
      },
    });
  }

  /**
   * Get user's recent reviews
   */
  async getRecentReviews(userId: string, limit: number = 10) {
    return prisma.review.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        game: {
          select: {
            id: true,
            title: true,
            slug: true,
            coverImage: true,
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
   * Search users by username
   */
  async searchByUsername(query: string, limit: number = 10): Promise<UserProfile[]> {
    return prisma.user.findMany({
      where: {
        username: {
          contains: query,
          mode: 'insensitive',
        },
      },
      take: limit,
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        bio: true,
        avatar: true,
        createdAt: true,
        _count: {
          select: {
            ratings: true,
            reviews: true,
            lists: true,
          },
        },
      },
    });
  }
}

export default UserRepository;

export const userRepository = new UserRepository();
