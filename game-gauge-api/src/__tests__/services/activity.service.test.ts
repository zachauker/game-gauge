import { activityService, ActivityType } from '../../services/activity.service';
import {
  testUser,
  testOtherUser,
  testGame,
  testActivityEvent,
  testUserInclude,
  testGameInclude,
} from '../setup';

jest.mock('../../repositories/activity.repository', () => ({
  activityRepository: {
    create: jest.fn(),
    getFeedForUser: jest.fn(),
    getUserActivity: jest.fn(),
    getRecentPlatformActivity: jest.fn(),
    deleteByTarget: jest.fn(),
  },
}));

jest.mock('../../repositories/follow.repository', () => ({
  followRepository: {
    getFollowingIds: jest.fn(),
  },
}));

jest.mock('../../repositories/interaction.repository', () => ({
  interactionRepository: {
    getBulkReactionData: jest.fn(),
    getBulkCommentCounts: jest.fn(),
  },
}));

import { activityRepository } from '../../repositories/activity.repository';
import { followRepository } from '../../repositories/follow.repository';
import { interactionRepository } from '../../repositories/interaction.repository';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const makeEventRow = (overrides = {}) => ({
  ...testActivityEvent,
  user: testUserInclude,
  game: testGameInclude,
  ...overrides,
});

const paginatedResult = (events: unknown[] = []) => ({
  events,
  total: events.length,
  page: 1,
  limit: 20,
  hasMore: false,
});

const noReactions = () =>
  (interactionRepository.getBulkReactionData as jest.Mock).mockResolvedValue(
    new Map([[testActivityEvent.id, { count: 0, hasReacted: false }]])
  );

const noComments = () =>
  (interactionRepository.getBulkCommentCounts as jest.Mock).mockResolvedValue(
    new Map([[testActivityEvent.id, 0]])
  );

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('ActivityService', () => {
  describe('recordEvent', () => {
    it('writes an event to the repository with all options', async () => {
      (activityRepository.create as jest.Mock).mockResolvedValue(testActivityEvent);

      await activityService.recordEvent(testUser.id, ActivityType.REVIEWED_GAME, {
        gameId: testGame.id,
        targetId: 'review-id',
        meta: { score: 8 },
      });

      expect(activityRepository.create).toHaveBeenCalledWith({
        userId: testUser.id,
        type: 'REVIEWED_GAME',
        gameId: testGame.id,
        targetId: 'review-id',
        meta: { score: 8 },
      });
    });

    it('is fire-and-forget — does not throw when the repository fails', async () => {
      (activityRepository.create as jest.Mock).mockRejectedValue(new Error('DB error'));
      await expect(
        activityService.recordEvent(testUser.id, ActivityType.RATED_GAME)
      ).resolves.toBeUndefined();
    });

    it('records a minimal event with no options', async () => {
      (activityRepository.create as jest.Mock).mockResolvedValue(testActivityEvent);
      await activityService.recordEvent(testUser.id, ActivityType.FOLLOWED_USER);
      expect(activityRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: testUser.id, type: 'FOLLOWED_USER' })
      );
    });
  });

  describe('getFeed', () => {
    beforeEach(() => {
      (followRepository.getFollowingIds as jest.Mock).mockResolvedValue([testOtherUser.id]);
      (activityRepository.getFeedForUser as jest.Mock).mockResolvedValue(
        paginatedResult([makeEventRow()])
      );
      noReactions();
      noComments();
    });

    it('fetches following ids then retrieves the paginated feed', async () => {
      await activityService.getFeed(testUser.id, 1, 20);
      expect(followRepository.getFollowingIds).toHaveBeenCalledWith(testUser.id);
      expect(activityRepository.getFeedForUser).toHaveBeenCalledWith(
        testUser.id,
        [testOtherUser.id],
        1,
        20
      );
    });

    it('passes an empty followingIds array when the user follows nobody', async () => {
      (followRepository.getFollowingIds as jest.Mock).mockResolvedValue([]);
      (activityRepository.getFeedForUser as jest.Mock).mockResolvedValue(paginatedResult());
      noReactions();
      noComments();
      await activityService.getFeed(testUser.id, 1, 20);
      expect(activityRepository.getFeedForUser).toHaveBeenCalledWith(testUser.id, [], 1, 20);
    });

    it('hydrates likeCount, hasLiked, and commentCount onto every event', async () => {
      (interactionRepository.getBulkReactionData as jest.Mock).mockResolvedValue(
        new Map([[testActivityEvent.id, { count: 5, hasReacted: true }]])
      );
      (interactionRepository.getBulkCommentCounts as jest.Mock).mockResolvedValue(
        new Map([[testActivityEvent.id, 3]])
      );
      const result = await activityService.getFeed(testUser.id, 1, 20);
      expect(result.events[0].likeCount).toBe(5);
      expect(result.events[0].hasLiked).toBe(true);
      expect(result.events[0].commentCount).toBe(3);
    });

    it('defaults interaction fields to 0 / false when event has no interactions', async () => {
      const result = await activityService.getFeed(testUser.id, 1, 20);
      expect(result.events[0].likeCount).toBe(0);
      expect(result.events[0].hasLiked).toBe(false);
      expect(result.events[0].commentCount).toBe(0);
    });

    it('calls bulk hydration methods with the correct event ids', async () => {
      await activityService.getFeed(testUser.id, 1, 20);
      const expectedIds = [testActivityEvent.id];
      expect(interactionRepository.getBulkReactionData).toHaveBeenCalledWith(
        expectedIds,
        testUser.id
      );
      expect(interactionRepository.getBulkCommentCounts).toHaveBeenCalledWith(expectedIds);
    });

    it('skips hydration calls when the result set is empty', async () => {
      (activityRepository.getFeedForUser as jest.Mock).mockResolvedValue(paginatedResult([]));
      await activityService.getFeed(testUser.id, 1, 20);
      expect(interactionRepository.getBulkReactionData).not.toHaveBeenCalled();
      expect(interactionRepository.getBulkCommentCounts).not.toHaveBeenCalled();
    });
  });

  describe('getUserActivity', () => {
    beforeEach(() => {
      (activityRepository.getUserActivity as jest.Mock).mockResolvedValue(
        paginatedResult([makeEventRow()])
      );
      noReactions();
      noComments();
    });

    it('delegates to the repository with correct args', async () => {
      await activityService.getUserActivity(testUser.id, 1, 20);
      expect(activityRepository.getUserActivity).toHaveBeenCalledWith(testUser.id, 1, 20);
    });

    it('hydrates interaction counts onto events', async () => {
      (interactionRepository.getBulkReactionData as jest.Mock).mockResolvedValue(
        new Map([[testActivityEvent.id, { count: 2, hasReacted: false }]])
      );
      (interactionRepository.getBulkCommentCounts as jest.Mock).mockResolvedValue(
        new Map([[testActivityEvent.id, 1]])
      );
      const result = await activityService.getUserActivity(testUser.id, 1, 20);
      expect(result.events[0].likeCount).toBe(2);
      expect(result.events[0].commentCount).toBe(1);
    });

    it('does not pass a viewerId to getBulkReactionData (public activity view)', async () => {
      await activityService.getUserActivity(testUser.id, 1, 20);
      expect(interactionRepository.getBulkReactionData).toHaveBeenCalledWith(
        expect.any(Array),
        undefined
      );
    });
  });

  describe('getPlatformActivity', () => {
    beforeEach(() => {
      (activityRepository.getRecentPlatformActivity as jest.Mock).mockResolvedValue(
        paginatedResult([makeEventRow()])
      );
      noReactions();
      noComments();
    });

    it('delegates to the repository', async () => {
      await activityService.getPlatformActivity(1, 20);
      expect(activityRepository.getRecentPlatformActivity).toHaveBeenCalledWith(1, 20);
    });

    it('hydrates interaction counts onto all events', async () => {
      const result = await activityService.getPlatformActivity(1, 20);
      expect(result.events[0]).toHaveProperty('likeCount');
      expect(result.events[0]).toHaveProperty('commentCount');
      expect(result.events[0]).toHaveProperty('hasLiked');
    });
  });

  describe('pruneEvents', () => {
    it('calls deleteByTarget with the correct args', async () => {
      (activityRepository.deleteByTarget as jest.Mock).mockResolvedValue(undefined);
      await activityService.pruneEvents('review-id', ActivityType.REVIEWED_GAME);
      expect(activityRepository.deleteByTarget).toHaveBeenCalledWith('review-id', 'REVIEWED_GAME');
    });

    it('does not throw when the delete fails (non-fatal)', async () => {
      (activityRepository.deleteByTarget as jest.Mock).mockRejectedValue(new Error('DB error'));
      await expect(
        activityService.pruneEvents('review-id', ActivityType.REVIEWED_GAME)
      ).resolves.toBeUndefined();
    });
  });

  describe('ActivityType', () => {
    it('exports all expected event type constants', () => {
      expect(ActivityType).toMatchObject({
        RATED_GAME: 'RATED_GAME',
        REVIEWED_GAME: 'REVIEWED_GAME',
        ADDED_TO_LIST: 'ADDED_TO_LIST',
        COMPLETED_GAME: 'COMPLETED_GAME',
        STARTED_GAME: 'STARTED_GAME',
        FOLLOWED_USER: 'FOLLOWED_USER',
        CREATED_LIST: 'CREATED_LIST',
      });
    });
  });
});
