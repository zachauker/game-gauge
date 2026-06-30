import { prisma } from '../config/database';
import { NotFoundError } from '../utils/errors.util';

export type NotificationType = 'FOLLOWED_YOU' | 'LIKED_EVENT' | 'COMMENTED_EVENT';

export interface NotificationWithRelations {
  id: string;
  type: NotificationType;
  read: boolean;
  createdAt: Date;
  actor: { id: string; username: string; avatar: string | null };
  event: {
    id: string;
    type: string;
    meta: Record<string, unknown> | null;
    game: { title: string; slug: string } | null;
  } | null;
}

const NOTIFICATION_INCLUDE = {
  actor: { select: { id: true, username: true, avatar: true } },
  event: {
    select: {
      id: true,
      type: true,
      meta: true,
      game: { select: { title: true, slug: true } },
    },
  },
} as const;

class NotificationRepository {
  async create(data: {
    userId: string;
    actorId: string;
    type: string;
    eventId?: string;
  }): Promise<void> {
    await prisma.notification.create({ data });
  }

  async findForUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ notifications: NotificationWithRelations[]; total: number }> {
    const skip = (page - 1) * limit;
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: NOTIFICATION_INCLUDE,
      }),
      prisma.notification.count({ where: { userId } }),
    ]);
    return { notifications: notifications as NotificationWithRelations[], total };
  }

  async countUnread(userId: string): Promise<number> {
    return prisma.notification.count({ where: { userId, read: false } });
  }

  async markRead(notificationId: string, userId: string): Promise<void> {
    const { count } = await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true },
    });
    if (count === 0) throw new NotFoundError('Notification not found');
  }

  async markAllRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }
}

export const notificationRepository = new NotificationRepository();
