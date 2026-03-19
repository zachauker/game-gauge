import { activityRepository, PaginatedActivityResult } from '../repositories/activity.repository';
import { interactionRepository } from '../repositories/interaction.repository';
import { followRepository } from '../repositories/follow.repository';
import { logger } from '../utils/logger.util';
import { Prisma } from '@prisma/client';

// ─── Event type constants ──────────────────────────────────────────────────────

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
  meta?: Prisma.InputJsonValue;
}

// ─── Hydration helper ──────────────────────────────────────────────────────────

async function hydrateInteractions(
  result: PaginatedActivityResult,
  viewerId?: string
): Promise<PaginatedActivityResult> {
  if (result.events.length === 0) return result;

  const eventIds = result.events.map((e) => e.id);

  const [reactionData, commentCounts] = await Promise.all([
    interactionRepository.getBulkReactionData(eventIds, viewerId),
    interactionRepository.getBulkCommentCounts(eventIds),
  ]);

  return {
    ...result,
    events: result.events.map((event) => ({
      ...event,
      likeCount: reactionData.get(event.id)?.count ?? 0,
      hasLiked: reactionData.get(event.id)?.hasReacted ?? false,
      commentCount: commentCounts.get(event.id) ?? 0,
    })),
  };
}

// ─── Service ───────────────────────────────────────────────────────────────────

class ActivityService {
  /**
   * Fire-and-forget event recording.
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
      logger.error(
        `[ActivityService] Failed to record event: ${JSON.stringify({ userId, type, err })}`
      );
    }
  }

  async getFeed(userId: string, page: number, limit: number): Promise<PaginatedActivityResult> {
    const followingIds = await followRepository.getFollowingIds(userId);
    const raw = await activityRepository.getFeedForUser(userId, followingIds, page, limit);
    return hydrateInteractions(raw, userId);
  }

  async getUserActivity(
    userId: string,
    page: number,
    limit: number
  ): Promise<PaginatedActivityResult> {
    const raw = await activityRepository.getUserActivity(userId, page, limit);
    return hydrateInteractions(raw);
  }

  async getPlatformActivity(page: number, limit: number): Promise<PaginatedActivityResult> {
    const raw = await activityRepository.getRecentPlatformActivity(page, limit);
    return hydrateInteractions(raw);
  }

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
