import { activityRepository, PaginatedActivityResult } from '../repositories/activity.repository';
import { followRepository } from '../repositories/follow.repository';
import { logger } from '../utils/logger.util';
import { Prisma } from '@prisma/client';

// ─── Event type constants ──────────────────────────────────────────────────

export const ActivityType = {
  RATED_GAME: 'RATED_GAME',
  REVIEWED_GAME: 'REVIEWED_GAME',
  ADDED_TO_LIST: 'ADDED_TO_LIST',
  COMPLETED_GAME: 'COMPLETED_GAME',
  STARTED_GAME: 'STARTED_GAME',
  FOLLOWED_USER: 'FOLLOWED_USER',
  CREATED_LIST: 'CREATED_LIST',
} as const;

export type ActivityTypeValue = (typeof ActivityType)[keyof typeof ActivityType];

export interface RecordEventOptions {
  gameId?: string;
  targetId?: string;
  meta?: Prisma.InputJsonValue; // was Record<string, unknown>
}

// ─── Service ───────────────────────────────────────────────────────────────

class ActivityService {
  /**
   * Fire-and-forget event recording.
   * Wraps the write in a try/catch so a failed write never breaks the caller.
   */
  async recordEvent(
    userId: string,
    type: ActivityTypeValue,
    options: RecordEventOptions = {}
  ): Promise<void> {
    try {
      await activityRepository.create({
        userId,
        type,
        gameId: options.gameId,
        targetId: options.targetId,
        meta: options.meta,
      });
    } catch (err) {
      // Non-fatal — log and move on
      logger.error(
        `[ActivityService] Failed to record event: ${JSON.stringify({ userId, type, err })}`
      );
    }
  }

  /**
   * Personalised feed for the authenticated user.
   * Includes own events + events from followed users.
   */
  async getFeed(userId: string, page: number, limit: number): Promise<PaginatedActivityResult> {
    const followingIds = await followRepository.getFollowingIds(userId);
    return activityRepository.getFeedForUser(userId, followingIds, page, limit);
  }

  /**
   * Single user's public activity (for profile Activity tab).
   */
  async getUserActivity(
    userId: string,
    page: number,
    limit: number
  ): Promise<PaginatedActivityResult> {
    return activityRepository.getUserActivity(userId, page, limit);
  }

  /**
   * Platform-wide recent activity (global feed tab).
   */
  async getPlatformActivity(page: number, limit: number): Promise<PaginatedActivityResult> {
    return activityRepository.getRecentPlatformActivity(page, limit);
  }

  /**
   * Prune feed events when source content is deleted.
   * Called by review/rating/list services on their delete paths.
   */
  async pruneEvents(targetId: string, type: ActivityTypeValue): Promise<void> {
    try {
      await activityRepository.deleteByTarget(targetId, type);
    } catch (err) {
      logger.error(
        `[ActivityService] Failed to prune events: ${JSON.stringify({ targetId, type, err })}`
      );
    }
  }
}

export const activityService = new ActivityService();
