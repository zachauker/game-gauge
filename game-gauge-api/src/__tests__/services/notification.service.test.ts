import { NotificationService } from '../../services/notification.service';
import { testUser, testOtherUser, testNotification } from '../setup';

jest.mock('../../repositories/notification.repository', () => ({
  notificationRepository: {
    create: jest.fn(),
    findForUser: jest.fn(),
    countUnread: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
  },
}));

import { notificationRepository } from '../../repositories/notification.repository';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    service = new NotificationService();
  });

  describe('create', () => {
    it('creates a notification when actor and recipient differ', async () => {
      (notificationRepository.create as jest.Mock).mockResolvedValue(undefined);

      await service.create({
        userId: testOtherUser.id,
        actorId: testUser.id,
        type: 'LIKED_EVENT',
        eventId: 'some-event-id',
      });

      expect(notificationRepository.create).toHaveBeenCalledWith({
        userId: testOtherUser.id,
        actorId: testUser.id,
        type: 'LIKED_EVENT',
        eventId: 'some-event-id',
      });
    });

    it('does NOT create a notification when actor equals recipient', async () => {
      await service.create({
        userId: testUser.id,
        actorId: testUser.id,
        type: 'LIKED_EVENT',
        eventId: 'some-event-id',
      });

      expect(notificationRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('getForUser', () => {
    it('returns paginated notifications with pagination metadata', async () => {
      const mockData = {
        notifications: [testNotification],
        total: 1,
      };
      (notificationRepository.findForUser as jest.Mock).mockResolvedValue(mockData);

      const result = await service.getForUser(testUser.id, 1, 20);

      expect(notificationRepository.findForUser).toHaveBeenCalledWith(testUser.id, 1, 20);
      expect(result.notifications).toHaveLength(1);
      expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1 });
    });
  });

  describe('countUnread', () => {
    it('returns the unread notification count', async () => {
      (notificationRepository.countUnread as jest.Mock).mockResolvedValue(5);

      const result = await service.countUnread(testUser.id);

      expect(notificationRepository.countUnread).toHaveBeenCalledWith(testUser.id);
      expect(result).toBe(5);
    });
  });

  describe('markRead', () => {
    it('delegates to the repository', async () => {
      (notificationRepository.markRead as jest.Mock).mockResolvedValue(undefined);

      await service.markRead(testNotification.id, testUser.id);

      expect(notificationRepository.markRead).toHaveBeenCalledWith(
        testNotification.id,
        testUser.id
      );
    });
  });

  describe('markAllRead', () => {
    it('delegates to the repository', async () => {
      (notificationRepository.markAllRead as jest.Mock).mockResolvedValue(undefined);

      await service.markAllRead(testUser.id);

      expect(notificationRepository.markAllRead).toHaveBeenCalledWith(testUser.id);
    });
  });
});
