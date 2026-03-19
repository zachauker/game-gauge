import { followRepository } from '../repositories/follow.repository';
import { userRepository } from '../repositories/user.repository';
import { activityService, ActivityType } from './activity.service';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../utils/errors.util';

class FollowService {
  /**
   * Follow a user.
   * Returns follow counts for the followed user so the client can update state.
   */
  async followUser(followerId: string, followingUsername: string) {
    const target = await userRepository.findByUsername(followingUsername);
    if (!target) throw new NotFoundError('User not found');

    if (followerId === target.id) {
      throw new ValidationError('You cannot follow yourself');
    }

    const alreadyFollowing = await followRepository.isFollowing(followerId, target.id);
    if (alreadyFollowing) throw new ConflictError('Already following this user');

    await followRepository.follow(followerId, target.id);

    // Record activity event (fire-and-forget)
    await activityService.recordEvent(followerId, ActivityType.FOLLOWED_USER, {
      targetId: target.id,
      meta: { username: target.username, avatar: target.avatar },
    });

    const counts = await followRepository.getCounts(target.id);
    return {
      following: true,
      ...counts,
    };
  }

  /**
   * Unfollow a user.
   */
  async unfollowUser(followerId: string, followingUsername: string) {
    const target = await userRepository.findByUsername(followingUsername);
    if (!target) throw new NotFoundError('User not found');

    const isFollowing = await followRepository.isFollowing(followerId, target.id);
    if (!isFollowing) throw new ConflictError('Not following this user');

    await followRepository.unfollow(followerId, target.id);

    // Prune the FOLLOWED_USER activity event
    await activityService.pruneEvents(target.id, ActivityType.FOLLOWED_USER);

    const counts = await followRepository.getCounts(target.id);
    return {
      following: false,
      ...counts,
    };
  }

  /**
   * Get paginated followers list for a user profile.
   */
  async getFollowers(
    username: string,
    page: number,
    limit: number,
    viewerId?: string,
  ) {
    const user = await userRepository.findByUsername(username);
    if (!user) throw new NotFoundError('User not found');

    const result = await followRepository.getFollowers(user.id, page, limit);

    // Annotate each user with isFollowing if a viewer is logged in
    if (viewerId) {
      const followingIds = await followRepository.getFollowingIds(viewerId);
      const followingSet = new Set(followingIds);
      result.users = result.users.map((u) => ({
        ...u,
        isFollowing: followingSet.has(u.id),
      })) as typeof result.users;
    }

    return result;
  }

  /**
   * Get paginated following list for a user profile.
   */
  async getFollowing(
    username: string,
    page: number,
    limit: number,
    viewerId?: string,
  ) {
    const user = await userRepository.findByUsername(username);
    if (!user) throw new NotFoundError('User not found');

    const result = await followRepository.getFollowing(user.id, page, limit);

    if (viewerId) {
      const followingIds = await followRepository.getFollowingIds(viewerId);
      const followingSet = new Set(followingIds);
      result.users = result.users.map((u) => ({
        ...u,
        isFollowing: followingSet.has(u.id),
      })) as typeof result.users;
    }

    return result;
  }

  /**
   * Get follow stats for a profile, optionally including viewer's follow state.
   */
  async getFollowStats(
    profileUserId: string,
    viewerId?: string,
  ) {
    const counts = await followRepository.getCounts(profileUserId);

    let isFollowing = false;
    let isFollowedBy = false;

    if (viewerId && viewerId !== profileUserId) {
      [isFollowing, isFollowedBy] = await Promise.all([
        followRepository.isFollowing(viewerId, profileUserId),
        followRepository.isFollowing(profileUserId, viewerId),
      ]);
    }

    return { ...counts, isFollowing, isFollowedBy };
  }

  /**
   * Suggested users to follow (most-followed, not yet following).
   */
  async getSuggestedUsers(userId: string, limit = 5) {
    return followRepository.getSuggested(userId, limit);
  }
}

export const followService = new FollowService();
