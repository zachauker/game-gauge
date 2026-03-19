import { prisma } from '../config/database';
import { UserFollow } from '@prisma/client';

export interface FollowUser {
  id: string;
  username: string;
  avatar: string | null;
  bio: string | null;
}

export interface PaginatedFollowResult {
  users: FollowUser[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

class FollowRepository {
  /**
   * Create a follow relationship
   */
  async follow(followerId: string, followingId: string): Promise<UserFollow> {
    return prisma.userFollow.create({
      data: { followerId, followingId },
    });
  }

  /**
   * Delete a follow relationship
   */
  async unfollow(followerId: string, followingId: string): Promise<UserFollow> {
    return prisma.userFollow.delete({
      where: {
        followerId_followingId: { followerId, followingId },
      },
    });
  }

  /**
   * Check if followerId is following followingId
   */
  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const count = await prisma.userFollow.count({
      where: { followerId, followingId },
    });
    return count > 0;
  }

  /**
   * Get users who follow userId (their followers)
   */
  async getFollowers(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedFollowResult> {
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      prisma.userFollow.findMany({
        where: { followingId: userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          follower: {
            select: { id: true, username: true, avatar: true, bio: true },
          },
        },
      }),
      prisma.userFollow.count({ where: { followingId: userId } }),
    ]);

    return {
      users: rows.map((r) => r.follower),
      total,
      page,
      limit,
      hasMore: skip + rows.length < total,
    };
  }

  /**
   * Get users that userId follows
   */
  async getFollowing(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedFollowResult> {
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      prisma.userFollow.findMany({
        where: { followerId: userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          following: {
            select: { id: true, username: true, avatar: true, bio: true },
          },
        },
      }),
      prisma.userFollow.count({ where: { followerId: userId } }),
    ]);

    return {
      users: rows.map((r) => r.following),
      total,
      page,
      limit,
      hasMore: skip + rows.length < total,
    };
  }

  /**
   * Get follower and following counts for a user
   */
  async getCounts(userId: string): Promise<{ followerCount: number; followingCount: number }> {
    const [followerCount, followingCount] = await Promise.all([
      prisma.userFollow.count({ where: { followingId: userId } }),
      prisma.userFollow.count({ where: { followerId: userId } }),
    ]);
    return { followerCount, followingCount };
  }

  /**
   * Get IDs of users that userId follows (for feed queries)
   */
  async getFollowingIds(userId: string): Promise<string[]> {
    const rows = await prisma.userFollow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    return rows.map((r) => r.followingId);
  }

  /**
   * Suggested users: most-followed users that userId hasn't followed yet
   */
  async getSuggested(userId: string, limit: number): Promise<FollowUser[]> {
    // Users with most followers, excluding self and already-followed
    const alreadyFollowing = await this.getFollowingIds(userId);
    const exclude = [userId, ...alreadyFollowing];

    return prisma.user.findMany({
      where: { id: { notIn: exclude } },
      select: { id: true, username: true, avatar: true, bio: true },
      take: limit,
      orderBy: {
        followers: { _count: 'desc' },
      },
    });
  }
}

export const followRepository = new FollowRepository();
