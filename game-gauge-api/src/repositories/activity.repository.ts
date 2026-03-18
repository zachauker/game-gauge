import { prisma } from '../config/database';
import { ActivityEvent, Prisma } from '@prisma/client';

export interface ActivityEventWithUser extends ActivityEvent {
  user: {
    id: string;
    username: string;
    avatar: string | null;
  };
  game: {
    id: string;
    title: string;
    coverImage: string | null;
    slug: string;
  } | null;
  // Interaction counts — hydrated in service layer
  likeCount?: number;
  commentCount?: number;
  hasLiked?: boolean;
}

export interface PaginatedActivityResult {
  events: ActivityEventWithUser[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface CreateActivityData {
  userId: string;
  type: string;
  gameId?: string;
  targetId?: string;
  meta?: Prisma.InputJsonValue;
}

const userInclude = {
  select: { id: true, username: true, avatar: true },
} as const;

const gameInclude = {
  select: { id: true, title: true, coverImage: true, slug: true },
} as const;

class ActivityRepository {
  async create(data: CreateActivityData): Promise<ActivityEvent> {
    return prisma.activityEvent.create({ data });
  }

  async getFeedForUser(
    userId: string,
    followingIds: string[],
    page: number,
    limit: number
  ): Promise<PaginatedActivityResult> {
    const skip = (page - 1) * limit;
    const userIds = [userId, ...followingIds];

    const [events, total] = await Promise.all([
      prisma.activityEvent.findMany({
        where: { userId: { in: userIds } },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: userInclude, game: gameInclude },
      }),
      prisma.activityEvent.count({ where: { userId: { in: userIds } } }),
    ]);

    return {
      events: events as ActivityEventWithUser[],
      total,
      page,
      limit,
      hasMore: skip + events.length < total,
    };
  }

  async getUserActivity(
    userId: string,
    page: number,
    limit: number
  ): Promise<PaginatedActivityResult> {
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      prisma.activityEvent.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: userInclude, game: gameInclude },
      }),
      prisma.activityEvent.count({ where: { userId } }),
    ]);

    return {
      events: events as ActivityEventWithUser[],
      total,
      page,
      limit,
      hasMore: skip + events.length < total,
    };
  }

  async getRecentPlatformActivity(page: number, limit: number): Promise<PaginatedActivityResult> {
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      prisma.activityEvent.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: userInclude, game: gameInclude },
      }),
      prisma.activityEvent.count(),
    ]);

    return {
      events: events as ActivityEventWithUser[],
      total,
      page,
      limit,
      hasMore: skip + events.length < total,
    };
  }

  async deleteByTarget(targetId: string, type: string): Promise<void> {
    await prisma.activityEvent.deleteMany({ where: { targetId, type } });
  }
}

export const activityRepository = new ActivityRepository();
