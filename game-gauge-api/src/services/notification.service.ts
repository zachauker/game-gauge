import { notificationRepository } from '../repositories/notification.repository';

interface CreateNotificationInput {
  userId: string;
  actorId: string;
  type: string;
  eventId?: string;
}

export class NotificationService {
  async create(data: CreateNotificationInput): Promise<void> {
    if (data.userId === data.actorId) return;
    await notificationRepository.create(data);
  }

  async getForUser(userId: string, page: number, limit: number) {
    const { notifications, total } = await notificationRepository.findForUser(userId, page, limit);
    return {
      notifications,
      pagination: { page, limit, total },
    };
  }

  async countUnread(userId: string): Promise<number> {
    return notificationRepository.countUnread(userId);
  }

  async markRead(notificationId: string, userId: string): Promise<void> {
    await notificationRepository.markRead(notificationId, userId);
  }

  async markAllRead(userId: string): Promise<void> {
    await notificationRepository.markAllRead(userId);
  }
}

export const notificationService = new NotificationService();
