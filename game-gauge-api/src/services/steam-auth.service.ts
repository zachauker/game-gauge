import { userRepository } from '../repositories/user.repository';
import { generateToken } from '../utils/jwt.util';
import { logger } from '../utils/logger.util';

export interface SteamProfile {
  steamId: string;
  username: string;
  avatar: string;
  profileUrl: string;
}

export class SteamAuthService {
  /**
   * Find existing user by Steam ID, or create a new one.
   * If user exists, update their Steam profile data (name/avatar can change).
   */
  async findOrCreateUser(profile: SteamProfile) {
    // Check if a user with this Steam ID already exists
    let user = await userRepository.findBySteamId(profile.steamId);

    if (user) {
      // Update Steam profile data (display name, avatar may change)
      user = await userRepository.update(user.id, {
        steamUsername: profile.username,
        steamAvatar: profile.avatar,
        steamProfileUrl: profile.profileUrl,
        // Optionally update main avatar if they haven't set a custom one
        avatar: user.avatar || profile.avatar,
      });

      logger.info(`Steam login: existing user ${user.id}`);
    } else {
      // Create new user from Steam profile
      // Generate a unique username based on Steam display name
      const baseUsername = profile.username
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '')
        .slice(0, 20);
      const uniqueUsername = await this.generateUniqueUsername(baseUsername);

      user = await userRepository.create({
        username: uniqueUsername,
        steamId: profile.steamId,
        steamUsername: profile.username,
        steamAvatar: profile.avatar,
        steamProfileUrl: profile.profileUrl,
        avatar: profile.avatar,
        // No email or password for Steam-only users
      });

      logger.info(`Steam login: created new user ${user.id} for Steam ID ${profile.steamId}`);
    }

    const token = generateToken({
      userId: user.id,
      email: user.email || '',
    });

    return {
      user: userRepository.excludePassword(user),
      token,
      isNewUser: !user.email, // Flag so frontend knows to prompt for email
    };
  }

  /**
   * Link a Steam account to an existing Game Gauge user.
   * Used when a logged-in user wants to connect their Steam.
   */
  async linkSteamAccount(userId: string, profile: SteamProfile) {
    // Check if this Steam ID is already linked to another account
    const existingUser = await userRepository.findBySteamId(profile.steamId);
    if (existingUser && existingUser.id !== userId) {
      throw new Error('This Steam account is already linked to another user');
    }

    const user = await userRepository.update(userId, {
      steamId: profile.steamId,
      steamUsername: profile.username,
      steamAvatar: profile.avatar,
      steamProfileUrl: profile.profileUrl,
    });

    return userRepository.excludePassword(user);
  }

  /**
   * Unlink Steam from an account (only if they have email/password set)
   */
  async unlinkSteamAccount(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw new Error('User not found');
    if (!user.email || !user.password) {
      throw new Error('Cannot unlink Steam without email/password set — you would lose access');
    }

    return userRepository.update(userId, {
      steamId: null,
      steamUsername: null,
      steamAvatar: null,
      steamProfileUrl: null,
    });
  }

  private async generateUniqueUsername(base: string): Promise<string> {
    let username = base || 'steam_user';
    let suffix = 0;

    while (await userRepository.findByUsername(username)) {
      suffix++;
      username = `${base}${suffix}`;
    }

    return username;
  }
}

export const steamAuthService = new SteamAuthService();
