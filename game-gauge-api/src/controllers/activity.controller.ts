import { Request, Response, NextFunction } from 'express';
import { activityService } from '../services/activity.service';
import { userRepository } from '../repositories/user.repository';
import { NotFoundError } from '../utils/errors.util';
import { paginationSchema } from '../validators/social.validator';

export class ActivityController {
  /**
   * GET /api/feed
   * Personalised feed for the authenticated user. Auth required.
   */
  async getFeed(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const { page, limit } = paginationSchema.parse(req.query);
      const result = await activityService.getFeed(req.user.userId, page, limit);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/feed/global
   * Platform-wide recent activity. Public.
   */
  async getGlobalFeed(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit } = paginationSchema.parse(req.query);
      const result = await activityService.getPlatformActivity(page, limit);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/users/:username/activity
   * Single user's public activity log. Public.
   */
  async getUserActivity(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await userRepository.findByUsername(req.params.username as string);
      if (!user) throw new NotFoundError('User not found');

      const { page, limit } = paginationSchema.parse(req.query);
      const result = await activityService.getUserActivity(user.id, page, limit);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const activityController = new ActivityController();
