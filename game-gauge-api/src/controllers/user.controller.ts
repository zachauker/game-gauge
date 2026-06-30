import { Request, Response, NextFunction } from 'express';
import { userService } from '../services/user.service';
import { followService } from '../services/follow.service';
import { paginationSchema } from '../validators/social.validator';

export class UserController {
  /**
   * Get user profile by username
   * GET /api/users/:username
   */
  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const { username } = req.params;
      const profile = await userService.getProfile(username);

      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user statistics
   * GET /api/users/:username/stats
   */
  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { username } = req.params;

      // First get user profile to get ID
      const profile = await userService.getProfile(username);
      const [stats, followStats] = await Promise.all([
        userService.getUserStats(profile.id),
        followService.getFollowStats(profile.id, req.user?.userId),
      ]);

      res.json({ success: true, data: { ...stats, ...followStats } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current user profile (with private data)
   * GET /api/users/me
   */
  async getCurrentUser(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw Error('User not authenticated');
    }

    try {
      const profile = await userService.getCurrentUserProfile(req.user.userId);

      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update user profile
   * PATCH /api/users/me
   */
  async updateProfile(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new Error('User not authenticated');
    }
    try {
      const { firstName, lastName, bio, avatar } = req.body;

      const updatedUser = await userService.updateProfile(req.user.userId, {
        firstName,
        lastName,
        bio,
        avatar,
      });

      res.status(200).json({
        success: true,
        data: {
          id: updatedUser.id,
          username: updatedUser.username,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          bio: updatedUser.bio,
          avatar: updatedUser.avatar,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update username
   * PATCH /api/users/me/username
   */
  async updateUsername(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new Error('User not authenticated');
    }

    const { username } = req.body;

    if (!username) {
      throw new Error('Username is required');
    }

    try {
      const updatedUser = await userService.updateUsername(req.user.userId, username);

      res.status(200).json({
        success: true,
        data: {
          id: updatedUser.id,
          username: updatedUser.username,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Search users
   * GET /api/users/search
   */
  async searchUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const query = req.query.q as string;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!query) {
        return res.status(400).json({
          success: false,
          error: { message: 'Search query is required' },
        });
      }

      const users = await userService.searchUsers(query, limit);

      res.status(200).json({
        success: true,
        data: users,
      });
    } catch (error) {
      next(error);
    }
    return next();
  }

  /**
   * Get user ratings
   * GET /api/users/:username/ratings
   */
  async getUserRatings(req: Request, res: Response, next: NextFunction) {
    try {
      const { username } = req.params;
      const { page, limit } = paginationSchema.parse(req.query);
      const result = await userService.getUserRatings(username, page, limit);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user reviews
   * GET /api/users/:username/reviews
   */
  async getUserReviews(req: Request, res: Response, next: NextFunction) {
    try {
      const { username } = req.params;
      const { page, limit } = paginationSchema.parse(req.query);
      const result = await userService.getUserReviews(username, page, limit);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController();
