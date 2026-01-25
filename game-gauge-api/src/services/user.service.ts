import { userRepository, UserProfile, UserStats } from '../repositories/user.repository';
import { ConflictError, NotFoundError } from '../utils/errors.util';

export class UserService {
  /**
   * Get user profile by username
   */
  async getProfile(username: string | string[]): Promise<UserProfile> {
    const profile = await userRepository.getProfile(username);

    if (!profile) {
      throw new NotFoundError('User not found');
    }

    return profile;
  }

  /**
   * Get user statistics
   */
  async getUserStats(userId: string): Promise<UserStats> {
    // Verify user exists
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    return userRepository.getUserStats(userId);
  }

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    data: {
      firstName?: string;
      lastName?: string;
      bio?: string;
      avatar?: string;
    }
  ) {
    // Verify user exists
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Validate bio length
    if (data.bio && data.bio.length > 500) {
      throw new Error('Bio must be 500 characters or less');
    }

    return userRepository.updateProfile(userId, data);
  }

  /**
   * Update username
   */
  async updateUsername(userId: string, newUsername: string) {
    // Verify user exists
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Check if username is already taken
    const existingUser = await userRepository.findByUsername(newUsername);
    if (existingUser && existingUser.id !== userId) {
      throw new ConflictError('Username already taken');
    }

    // Validate username
    if (newUsername.length < 3 || newUsername.length > 30) {
      throw new Error('Username must be between 3 and 30 characters');
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(newUsername)) {
      throw new Error('Username can only contain letters, numbers, hyphens, and underscores');
    }

    return userRepository.updateUsername(userId, newUsername);
  }

  /**
   * Get user's recent activity
   */
  async getRecentActivity(username: string | string[], limit: number = 10) {
    const profile = await userRepository.getProfile(username);
    if (!profile) {
      throw new NotFoundError('User not found');
    }

    const [recentRatings, recentReviews] = await Promise.all([
      userRepository.getRecentRatings(profile.id, limit),
      userRepository.getRecentReviews(profile.id, limit),
    ]);

    return {
      ratings: recentRatings,
      reviews: recentReviews,
    };
  }

  /**
   * Search users
   */
  async searchUsers(query: string, limit: number = 10) {
    if (!query || query.trim().length < 2) {
      throw new Error('Search query must be at least 2 characters');
    }

    return userRepository.searchByUsername(query.trim(), limit);
  }

  /**
   * Get current user profile (with private info)
   */
  async getCurrentUserProfile(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const stats = await userRepository.getUserStats(userId);

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      bio: user.bio,
      avatar: user.avatar,
      createdAt: user.createdAt,
      stats,
    };
  }
}

export const userService = new UserService();
