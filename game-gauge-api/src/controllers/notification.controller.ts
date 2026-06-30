import { Request, Response, NextFunction } from 'express';
import { notificationService } from '../services/notification.service';
import { paginationSchema } from '../validators/social.validator';

export class NotificationController {
  async getNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const { page, limit } = paginationSchema.parse(req.query);
      const result = await notificationService.getForUser(req.user.userId, page, limit);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getUnreadCount(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const count = await notificationService.countUnread(req.user.userId);
      res.status(200).json({ success: true, data: { count } });
    } catch (error) {
      next(error);
    }
  }

  async markRead(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      await notificationService.markRead(req.params.id, req.user.userId);
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  async markAllRead(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      await notificationService.markAllRead(req.user.userId);
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  }
}

export const notificationController = new NotificationController();
