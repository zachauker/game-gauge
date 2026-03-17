import { activityService, ActivityType } from '../../services/activity.service';

// ── Repository mocks ───────────────────────────────────────────────────────

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

import { activityRepository } from '../../repositories/activity.repository';
import { followRepository } from '../../repositories/follow.repository';
import {
  testUser,
  testOtherUser,
  testGame,
  testActivityEvent,
  testUserInclude,
  testGameInclude,
} from '../setup';

// ─── Helpers ──────────────────────────────────────────────────────────────

const paginatedResult = (events: unknown[] = []) => ({
  events,
  total: events.length,
  page: 1,
  limit: 20,
  hasMore: false,
});

const makeEventRow = (overrides = {}) => ({
  ...testActivityEvent,
  user: testUserInclude,
  game: testGameInclude,
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe('ActivityService', () => {
  // ── recordEvent ───────────────────────────────────────────────────────────

  describe('recordEvent', () => {
    it('writes an event to the repository', async () => {
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

    it('does not throw when the repository write fails (fire-and-forget)', async () => {
      (activityRepository.create as jest.Mock).mockRejectedValue(new Error('DB error'));

      // Should resolve without throwing
      await expect(
        activityService.recordEvent(testUser.id, ActivityType.RATED_GAME)
      ).resolves.toBeUndefined();
    });

    it('works with no options (minimal event)', async () => {
      (activityRepository.create as jest.Mock).mockResolvedValue(testActivityEvent);

      await activityService.recordEvent(testUser.id, ActivityType.FOLLOWED_USER);

      expect(activityRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: testUser.id, type: 'FOLLOWED_USER' })
      );
    });
  });

  // ── getFeed ───────────────────────────────────────────────────────────────

  describe('getFeed', () => {
    it('fetches following ids then retrieves paginated feed', async () => {
      (followRepository.getFollowingIds as jest.Mock).mockResolvedValue([testOtherUser.id]);
      (activityRepository.getFeedForUser as jest.Mock).mockResolvedValue(
        paginatedResult([makeEventRow()])
      );

      const result = await activityService.getFeed(testUser.id, 1, 20);

      expect(followRepository.getFollowingIds).toHaveBeenCalledWith(testUser.id);
      expect(activityRepository.getFeedForUser).toHaveBeenCalledWith(
        testUser.id,
        [testOtherUser.id],
        1,
        20
      );
      expect(result.events).toHaveLength(1);
    });

    it('passes empty followingIds when user follows nobody', async () => {
      (followRepository.getFollowingIds as jest.Mock).mockResolvedValue([]);
      (activityRepository.getFeedForUser as jest.Mock).mockResolvedValue(paginatedResult());

      await activityService.getFeed(testUser.id, 1, 20);

      expect(activityRepository.getFeedForUser).toHaveBeenCalledWith(testUser.id, [], 1, 20);
    });
  });

  // ── getUserActivity ───────────────────────────────────────────────────────

  describe('getUserActivity', () => {
    it('delegates to the repository with correct args', async () => {
      (activityRepository.getUserActivity as jest.Mock).mockResolvedValue(
        paginatedResult([makeEventRow()])
      );

      const result = await activityService.getUserActivity(testUser.id, 1, 20);

      expect(activityRepository.getUserActivity).toHaveBeenCalledWith(testUser.id, 1, 20);
      expect(result.events).toHaveLength(1);
    });
  });

  // ── getPlatformActivity ───────────────────────────────────────────────────

  describe('getPlatformActivity', () => {
    it('delegates to the repository', async () => {
      (activityRepository.getRecentPlatformActivity as jest.Mock).mockResolvedValue(
        paginatedResult([makeEventRow()])
      );

      const result = await activityService.getPlatformActivity(1, 20);

      expect(activityRepository.getRecentPlatformActivity).toHaveBeenCalledWith(1, 20);
      expect(result.events).toHaveLength(1);
    });
  });

  // ── pruneEvents ───────────────────────────────────────────────────────────

  describe('pruneEvents', () => {
    it('calls deleteByTarget with the correct args', async () => {
      (activityRepository.deleteByTarget as jest.Mock).mockResolvedValue(undefined);

      await activityService.pruneEvents('review-id', ActivityType.REVIEWED_GAME);

      expect(activityRepository.deleteByTarget).toHaveBeenCalledWith('review-id', 'REVIEWED_GAME');
    });

    it('does not throw if the delete fails (non-fatal)', async () => {
      (activityRepository.deleteByTarget as jest.Mock).mockRejectedValue(new Error('DB error'));

      await expect(
        activityService.pruneEvents('review-id', ActivityType.REVIEWED_GAME)
      ).resolves.toBeUndefined();
    });
  });

  // ── ActivityType constants ────────────────────────────────────────────────

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
