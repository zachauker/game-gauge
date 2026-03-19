import { Request, Response, NextFunction } from 'express';
import { followService } from '../services/follow.service';
import { paginationSchema } from '../validators/social.validator';

export class FollowController {
  /**
   * POST /api/users/:username/follow
   * Follow a user. Auth required.
   */
  async followUser(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const result = await followService.followUser(req.user.userId, req.params.username as string);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/users/:username/follow
   * Unfollow a user. Auth required.
   */
  async unfollowUser(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const result = await followService.unfollowUser(
        req.user.userId,
        req.params.username as string
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/users/:username/followers
   * Public — list users who follow :username.
   */
  async getFollowers(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit } = paginationSchema.parse(req.query);
      const result = await followService.getFollowers(
        req.params.username as string,
        page,
        limit,
        req.user?.userId
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/users/:username/following
   * Public — list users that :username follows.
   */
  async getFollowing(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit } = paginationSchema.parse(req.query);
      const result = await followService.getFollowing(
        req.params.username as string,
        page,
        limit,
        req.user?.userId
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/users/suggestions
   * Suggested users to follow. Auth required.
   */
  async getSuggestions(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 5;
      const users = await followService.getSuggestedUsers(req.user.userId, limit);
      res.status(200).json({ success: true, data: users });
    } catch (error) {
      next(error);
    }
  }
}

export const followController = new FollowController();
