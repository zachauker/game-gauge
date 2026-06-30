import { followService } from '../../services/follow.service';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors.util';
import { testUser, testOtherUser, testFollow } from '../setup';

// ── Repository mocks ───────────────────────────────────────────────────────

jest.mock('../../repositories/follow.repository', () => ({
  followRepository: {
    follow: jest.fn(),
    unfollow: jest.fn(),
    isFollowing: jest.fn(),
    getCounts: jest.fn(),
    getFollowers: jest.fn(),
    getFollowing: jest.fn(),
    getFollowingIds: jest.fn(),
    getSuggested: jest.fn(),
  },
}));

jest.mock('../../repositories/user.repository', () => ({
  userRepository: {
    findByUsername: jest.fn(),
  },
}));

// Notification service is fire-and-forget — mock the whole thing
jest.mock('../../services/notification.service', () => ({
  notificationService: { create: jest.fn().mockResolvedValue(undefined) },
}));

// Activity service is fire-and-forget — mock the whole thing
jest.mock('../../services/activity.service', () => ({
  activityService: {
    recordEvent: jest.fn().mockResolvedValue(undefined),
    pruneEvents: jest.fn().mockResolvedValue(undefined),
  },
  ActivityType: {
    FOLLOWED_USER: 'FOLLOWED_USER',
  },
}));

import { followRepository } from '../../repositories/follow.repository';
import { userRepository } from '../../repositories/user.repository';
import { activityService } from '../../services/activity.service';
import { notificationService } from '../../services/notification.service';

// ─── Tests ────────────────────────────────────────────────────────────────

describe('FollowService', () => {
  // ── followUser ────────────────────────────────────────────────────────────

  describe('followUser', () => {
    const counts = { followerCount: 1, followingCount: 0 };

    beforeEach(() => {
      (userRepository.findByUsername as jest.Mock).mockResolvedValue(testOtherUser);
      (followRepository.isFollowing as jest.Mock).mockResolvedValue(false);
      (followRepository.follow as jest.Mock).mockResolvedValue(testFollow);
      (followRepository.getCounts as jest.Mock).mockResolvedValue(counts);
    });

    it('follows a user successfully and returns follow state + counts', async () => {
      const result = await followService.followUser(testUser.id, testOtherUser.username);

      expect(followRepository.follow).toHaveBeenCalledWith(testUser.id, testOtherUser.id);
      expect(result).toEqual({ following: true, ...counts });
    });

    it('records a FOLLOWED_USER activity event', async () => {
      await followService.followUser(testUser.id, testOtherUser.username);

      expect(activityService.recordEvent).toHaveBeenCalledWith(
        testUser.id,
        'FOLLOWED_USER',
        expect.objectContaining({ targetId: testOtherUser.id })
      );
    });

    it('throws NotFoundError when target user does not exist', async () => {
      (userRepository.findByUsername as jest.Mock).mockResolvedValue(null);

      await expect(followService.followUser(testUser.id, 'ghost')).rejects.toThrow(NotFoundError);

      expect(followRepository.follow).not.toHaveBeenCalled();
    });

    it('throws ValidationError when user tries to follow themselves', async () => {
      (userRepository.findByUsername as jest.Mock).mockResolvedValue(testUser);

      await expect(followService.followUser(testUser.id, testUser.username)).rejects.toThrow(
        ValidationError
      );
    });

    it('throws ConflictError when already following the user', async () => {
      (followRepository.isFollowing as jest.Mock).mockResolvedValue(true);

      await expect(followService.followUser(testUser.id, testOtherUser.username)).rejects.toThrow(
        ConflictError
      );

      expect(followRepository.follow).not.toHaveBeenCalled();
    });
  });

  // ── unfollowUser ──────────────────────────────────────────────────────────

  describe('unfollowUser', () => {
    const counts = { followerCount: 0, followingCount: 0 };

    beforeEach(() => {
      (userRepository.findByUsername as jest.Mock).mockResolvedValue(testOtherUser);
      (followRepository.isFollowing as jest.Mock).mockResolvedValue(true);
      (followRepository.unfollow as jest.Mock).mockResolvedValue(testFollow);
      (followRepository.getCounts as jest.Mock).mockResolvedValue(counts);
    });

    it('unfollows successfully and returns updated state', async () => {
      const result = await followService.unfollowUser(testUser.id, testOtherUser.username);

      expect(followRepository.unfollow).toHaveBeenCalledWith(testUser.id, testOtherUser.id);
      expect(result).toEqual({ following: false, ...counts });
    });

    it('prunes the FOLLOWED_USER activity event on unfollow', async () => {
      await followService.unfollowUser(testUser.id, testOtherUser.username);

      expect(activityService.pruneEvents).toHaveBeenCalledWith(testOtherUser.id, 'FOLLOWED_USER');
    });

    it('throws NotFoundError when target user does not exist', async () => {
      (userRepository.findByUsername as jest.Mock).mockResolvedValue(null);

      await expect(followService.unfollowUser(testUser.id, 'ghost')).rejects.toThrow(NotFoundError);
    });

    it('throws ConflictError when not currently following the user', async () => {
      (followRepository.isFollowing as jest.Mock).mockResolvedValue(false);

      await expect(followService.unfollowUser(testUser.id, testOtherUser.username)).rejects.toThrow(
        ConflictError
      );

      expect(followRepository.unfollow).not.toHaveBeenCalled();
    });

    it('does not fire a notification on unfollow', async () => {
      await followService.unfollowUser(testUser.id, testOtherUser.username);

      expect(notificationService.create).not.toHaveBeenCalled();
    });
  });

  // ── getFollowers ──────────────────────────────────────────────────────────

  describe('getFollowers', () => {
    const paginatedResult = {
      users: [{ id: testUser.id, username: testUser.username, avatar: null, bio: null }],
      total: 1,
      page: 1,
      limit: 20,
      hasMore: false,
    };

    beforeEach(() => {
      (userRepository.findByUsername as jest.Mock).mockResolvedValue(testOtherUser);
      (followRepository.getFollowers as jest.Mock).mockResolvedValue(paginatedResult);
      (followRepository.getFollowingIds as jest.Mock).mockResolvedValue([]);
    });

    it('throws NotFoundError for unknown username', async () => {
      (userRepository.findByUsername as jest.Mock).mockResolvedValue(null);

      await expect(followService.getFollowers('ghost', 1, 20)).rejects.toThrow(NotFoundError);
    });

    it('returns paginated followers', async () => {
      const result = await followService.getFollowers(testOtherUser.username, 1, 20);
      expect(result.users).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('annotates isFollowing when a viewerId is provided', async () => {
      (followRepository.getFollowingIds as jest.Mock).mockResolvedValue([testUser.id]);

      const result = await followService.getFollowers(
        testOtherUser.username,
        1,
        20,
        testOtherUser.id
      );

      expect(result.users[0]).toHaveProperty('isFollowing', true);
    });

    it('sets isFollowing false for users the viewer does not follow', async () => {
      (followRepository.getFollowingIds as jest.Mock).mockResolvedValue([]);

      const result = await followService.getFollowers(
        testOtherUser.username,
        1,
        20,
        testOtherUser.id
      );

      expect(result.users[0]).toHaveProperty('isFollowing', false);
    });
  });

  // ── getFollowing ──────────────────────────────────────────────────────────

  describe('getFollowing', () => {
    const paginatedResult = {
      users: [{ id: testOtherUser.id, username: testOtherUser.username, avatar: null, bio: null }],
      total: 1,
      page: 1,
      limit: 20,
      hasMore: false,
    };

    beforeEach(() => {
      (userRepository.findByUsername as jest.Mock).mockResolvedValue(testUser);
      (followRepository.getFollowing as jest.Mock).mockResolvedValue(paginatedResult);
      (followRepository.getFollowingIds as jest.Mock).mockResolvedValue([]);
    });

    it('returns paginated following list', async () => {
      const result = await followService.getFollowing(testUser.username, 1, 20);
      expect(result.users).toHaveLength(1);
    });

    it('throws NotFoundError for unknown username', async () => {
      (userRepository.findByUsername as jest.Mock).mockResolvedValue(null);

      await expect(followService.getFollowing('ghost', 1, 20)).rejects.toThrow(NotFoundError);
    });
  });

  // ── getFollowStats ────────────────────────────────────────────────────────

  describe('getFollowStats', () => {
    beforeEach(() => {
      (followRepository.getCounts as jest.Mock).mockResolvedValue({
        followerCount: 10,
        followingCount: 5,
      });
      (followRepository.isFollowing as jest.Mock).mockResolvedValue(false);
    });

    it('returns counts without isFollowing/isFollowedBy for own profile', async () => {
      const result = await followService.getFollowStats(testUser.id, testUser.id);

      expect(result.followerCount).toBe(10);
      expect(result.followingCount).toBe(5);
      // No cross-checks needed for self
      expect(followRepository.isFollowing).not.toHaveBeenCalled();
    });

    it('returns isFollowing and isFollowedBy for another viewer', async () => {
      (followRepository.isFollowing as jest.Mock)
        .mockResolvedValueOnce(true) // viewer → profile
        .mockResolvedValueOnce(false); // profile → viewer

      const result = await followService.getFollowStats(testOtherUser.id, testUser.id);

      expect(result.isFollowing).toBe(true);
      expect(result.isFollowedBy).toBe(false);
    });
  });

  // ── getSuggestedUsers ─────────────────────────────────────────────────────

  describe('getSuggestedUsers', () => {
    it('delegates to the repository with correct limit', async () => {
      (followRepository.getSuggested as jest.Mock).mockResolvedValue([testOtherUser]);

      const result = await followService.getSuggestedUsers(testUser.id, 5);

      expect(followRepository.getSuggested).toHaveBeenCalledWith(testUser.id, 5);
      expect(result).toEqual([testOtherUser]);
    });
  });
});
