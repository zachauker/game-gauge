import { userRepository } from '../repositories/user.repository';
import { generateToken } from '../utils/jwt.util';
import { ConflictError, BadRequestError, NotFoundError } from '../utils/errors.util';
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
   * If user exists, update their Steam profile data (name/avatar can change on Steam).
   *
   * Returns the user, a JWT token, and a flag indicating if this is a brand-new user
   * (so the frontend can prompt them to complete their profile / add email).
   */
  async findOrCreateUser(profile: SteamProfile) {
    // 1. Check if a user with this Steam ID already exists
    let user = await userRepository.findBySteamId(profile.steamId);
    let isNewUser = false;

    if (user) {
      // Returning user — update Steam profile data (display name, avatar may have changed)
      user = await userRepository.update(user.id, {
        steamUsername: profile.username,
        steamAvatar: profile.avatar,
        steamProfileUrl: profile.profileUrl,
        // Update the main avatar only if the user hasn't uploaded a custom one
        // (we detect this by checking if their current avatar is a Steam URL)
        ...(this.isSteamAvatar(user.avatar) || !user.avatar ? { avatar: profile.avatar } : {}),
      });

      logger.info(`Steam login: returning user ${user.id} (${user.username})`);
    } else {
      // New user — create an account from their Steam profile
      const uniqueUsername = await this.generateUniqueUsername(profile.username);

      user = await userRepository.create({
        username: uniqueUsername,
        steamId: profile.steamId,
        steamUsername: profile.username,
        steamAvatar: profile.avatar,
        steamProfileUrl: profile.profileUrl,
        avatar: profile.avatar,
        // No email or password — Steam-only user
      });

      isNewUser = true;
      logger.info(
        `Steam login: created new user ${user.id} (${uniqueUsername}) for SteamID ${profile.steamId}`
      );
    }

    // 2. Generate JWT
    const token = generateToken({
      userId: user.id,
      email: user.email || '',
    });

    return {
      user: userRepository.excludePassword(user),
      token,
      isNewUser,
    };
  }

  /**
   * Link a Steam account to an existing (logged-in) Game Gauge user.
   * Used when a user with an email/password account wants to connect their Steam.
   */
  async linkSteamAccount(userId: string, profile: SteamProfile) {
    // Verify the user exists
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Check if this Steam ID is already linked to a different account
    const existingSteamUser = await userRepository.findBySteamId(profile.steamId);
    if (existingSteamUser && existingSteamUser.id !== userId) {
      throw new ConflictError('This Steam account is already linked to another Game Gauge account');
    }

    // Check if this user already has a different Steam account linked
    if (user.steamId && user.steamId !== profile.steamId) {
      throw new ConflictError(
        'Your account already has a different Steam account linked. Unlink it first.'
      );
    }

    // Link the Steam account
    const updatedUser = await userRepository.update(userId, {
      steamId: profile.steamId,
      steamUsername: profile.username,
      steamAvatar: profile.avatar,
      steamProfileUrl: profile.profileUrl,
    });

    logger.info(`Steam linked: user ${userId} -> SteamID ${profile.steamId}`);

    return userRepository.excludePassword(updatedUser);
  }

  /**
   * Unlink a Steam account from a user.
   * Only allowed if the user has email/password credentials set (otherwise they'd be locked out).
   */
  async unlinkSteamAccount(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (!user.steamId) {
      throw new BadRequestError('No Steam account is linked to your profile');
    }

    // Safety check: don't let them unlink if it's their only auth method
    if (!user.email || !user.password) {
      throw new BadRequestError(
        'Cannot unlink Steam — you need to set an email and password first, otherwise you will lose access to your account'
      );
    }

    const updatedUser = await userRepository.update(userId, {
      steamId: null,
      steamUsername: null,
      steamAvatar: null,
      steamProfileUrl: null,
    });

    logger.info(`Steam unlinked: user ${userId}`);

    return userRepository.excludePassword(updatedUser);
  }

  /**
   * Get the Steam profile info for a user (public data for display).
   */
  async getSteamStatus(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    return {
      isLinked: !!user.steamId,
      steamId: user.steamId,
      steamUsername: user.steamUsername,
      steamAvatar: user.steamAvatar,
      steamProfileUrl: user.steamProfileUrl,
    };
  }

  /**
   * Generate a unique username from a Steam display name.
   * Sanitizes the name to match our username rules (alphanumeric + underscore),
   * then appends a number if there's a collision.
   */
  private async generateUniqueUsername(steamDisplayName: string): Promise<string> {
    // Sanitize: lowercase, replace spaces with underscores, strip invalid chars
    let base = steamDisplayName
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 25); // Leave room for suffix

    // Ensure minimum length
    if (base.length < 3) {
      base = 'steam_user';
    }

    let username = base;
    let suffix = 0;

    while (await userRepository.findByUsername(username)) {
      suffix++;
      username = `${base}${suffix}`;
    }

    return username;
  }

  /**
   * Check if a URL looks like a Steam avatar URL.
   */
  private isSteamAvatar(url: string | null): boolean {
    if (!url) return false;
    return url.includes('steamcdn-a.akamaihd.net') || url.includes('avatars.steamstatic.com');
  }
}

export const steamAuthService = new SteamAuthService();
