import { SteamAuthService } from '../../services/steam-auth.service';
import { ConflictError, BadRequestError, NotFoundError } from '../../utils/errors.util';
import { testUser, testSteamOnlyUser, testLinkedUser, testSteamProfile } from '../setup';

// Mock JWT utility
jest.mock('../../utils/jwt.util', () => ({
  generateToken: jest.fn().mockReturnValue('mock-jwt-token'),
}));

// Mock the repository — matching the pattern used in auth.service.test.ts
jest.mock('../../repositories/user.repository', () => ({
  userRepository: {
    findByEmail: jest.fn(),
    findByUsername: jest.fn(),
    findById: jest.fn(),
    findBySteamId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    excludePassword: jest.fn((user: any) => {
      if (!user) return user;
      const { password, ...rest } = user;
      return rest;
    }),
  },
}));

import { generateToken } from '../../utils/jwt.util';
import { userRepository } from '../../repositories/user.repository';

describe('SteamAuthService', () => {
  let service: SteamAuthService;

  beforeEach(() => {
    service = new SteamAuthService();
    jest.clearAllMocks();
    // Re-set the default for generateToken since clearAllMocks resets it
    (generateToken as jest.Mock).mockReturnValue('mock-jwt-token');
  });

  // ────────────────────────────────────────────
  // findOrCreateUser
  // ────────────────────────────────────────────
  describe('findOrCreateUser', () => {
    it('should return existing user when Steam ID is already linked', async () => {
      (userRepository.findBySteamId as jest.Mock).mockResolvedValue(testSteamOnlyUser);
      (userRepository.update as jest.Mock).mockResolvedValue({
        ...testSteamOnlyUser,
        steamUsername: testSteamProfile.username,
      });

      const result = await service.findOrCreateUser(testSteamProfile);

      expect(userRepository.findBySteamId).toHaveBeenCalledWith(testSteamProfile.steamId);
      expect(userRepository.update).toHaveBeenCalledWith(
        testSteamOnlyUser.id,
        expect.objectContaining({
          steamUsername: testSteamProfile.username,
          steamAvatar: testSteamProfile.avatar,
        })
      );
      expect(result.isNewUser).toBe(false);
      expect(result.token).toBe('mock-jwt-token');
      expect(result.user).not.toHaveProperty('password');
    });

    it('should create a new user when Steam ID is not found', async () => {
      (userRepository.findBySteamId as jest.Mock).mockResolvedValue(null);
      // generateUniqueUsername calls findByUsername — first call returns null (available)
      (userRepository.findByUsername as jest.Mock).mockResolvedValue(null);

      const createdUser = {
        ...testSteamOnlyUser,
        id: 'new-steam-user-id',
        steamId: testSteamProfile.steamId,
        steamUsername: testSteamProfile.username,
        steamAvatar: testSteamProfile.avatar,
        steamProfileUrl: testSteamProfile.profileUrl,
        username: 'newsteamuser',
      };
      (userRepository.create as jest.Mock).mockResolvedValue(createdUser);

      const result = await service.findOrCreateUser(testSteamProfile);

      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          steamId: testSteamProfile.steamId,
          steamUsername: testSteamProfile.username,
          steamAvatar: testSteamProfile.avatar,
          steamProfileUrl: testSteamProfile.profileUrl,
        })
      );
      expect(result.isNewUser).toBe(true);
      expect(result.token).toBe('mock-jwt-token');
    });

    it('should generate a unique username when display name collides', async () => {
      (userRepository.findBySteamId as jest.Mock).mockResolvedValue(null);
      // First username check: taken. Second: available.
      (userRepository.findByUsername as jest.Mock)
        .mockResolvedValueOnce(testUser) // 'newsteamuser' is taken
        .mockResolvedValueOnce(null); // 'newsteamuser1' is available

      const createdUser = {
        ...testSteamOnlyUser,
        id: 'new-unique-user-id',
        username: 'newsteamuser1',
        steamId: testSteamProfile.steamId,
      };
      (userRepository.create as jest.Mock).mockResolvedValue(createdUser);

      const result = await service.findOrCreateUser(testSteamProfile);

      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'newsteamuser1',
        })
      );
      expect(result.isNewUser).toBe(true);
    });

    it('should issue a JWT with empty email for Steam-only users', async () => {
      (userRepository.findBySteamId as jest.Mock).mockResolvedValue(null);
      (userRepository.findByUsername as jest.Mock).mockResolvedValue(null);

      const createdUser = {
        ...testSteamOnlyUser,
        steamId: testSteamProfile.steamId,
        email: null,
      };
      (userRepository.create as jest.Mock).mockResolvedValue(createdUser);

      await service.findOrCreateUser(testSteamProfile);

      expect(generateToken).toHaveBeenCalledWith({
        userId: createdUser.id,
        email: '',
      });
    });

    it('should update Steam profile data on returning login', async () => {
      const existingUser = {
        ...testSteamOnlyUser,
        steamUsername: 'OldName',
        avatar: 'https://avatars.steamstatic.com/old_full.jpg',
      };
      (userRepository.findBySteamId as jest.Mock).mockResolvedValue(existingUser);
      (userRepository.update as jest.Mock).mockResolvedValue({
        ...existingUser,
        steamUsername: testSteamProfile.username,
        steamAvatar: testSteamProfile.avatar,
        avatar: testSteamProfile.avatar,
      });

      await service.findOrCreateUser(testSteamProfile);

      expect(userRepository.update).toHaveBeenCalledWith(
        existingUser.id,
        expect.objectContaining({
          steamUsername: testSteamProfile.username,
          steamAvatar: testSteamProfile.avatar,
        })
      );
    });

    it('should NOT overwrite a custom (non-Steam) avatar on returning login', async () => {
      const userWithCustomAvatar = {
        ...testSteamOnlyUser,
        avatar: 'https://example.com/my-custom-avatar.png', // not a Steam URL
      };
      (userRepository.findBySteamId as jest.Mock).mockResolvedValue(userWithCustomAvatar);
      (userRepository.update as jest.Mock).mockResolvedValue(userWithCustomAvatar);

      await service.findOrCreateUser(testSteamProfile);

      // The update call should NOT include `avatar` in the data
      const updateData = (userRepository.update as jest.Mock).mock.calls[0][1];
      expect(updateData).not.toHaveProperty('avatar');
    });

    it('should update main avatar when current avatar is a Steam URL', async () => {
      const userWithSteamAvatar = {
        ...testSteamOnlyUser,
        avatar: 'https://avatars.steamstatic.com/old_avatar_full.jpg',
      };
      (userRepository.findBySteamId as jest.Mock).mockResolvedValue(userWithSteamAvatar);
      (userRepository.update as jest.Mock).mockResolvedValue({
        ...userWithSteamAvatar,
        avatar: testSteamProfile.avatar,
      });

      await service.findOrCreateUser(testSteamProfile);

      const updateData = (userRepository.update as jest.Mock).mock.calls[0][1];
      expect(updateData).toHaveProperty('avatar', testSteamProfile.avatar);
    });

    it('should update main avatar when user has no avatar set', async () => {
      const userWithNoAvatar = {
        ...testSteamOnlyUser,
        avatar: null,
      };
      (userRepository.findBySteamId as jest.Mock).mockResolvedValue(userWithNoAvatar);
      (userRepository.update as jest.Mock).mockResolvedValue({
        ...userWithNoAvatar,
        avatar: testSteamProfile.avatar,
      });

      await service.findOrCreateUser(testSteamProfile);

      const updateData = (userRepository.update as jest.Mock).mock.calls[0][1];
      expect(updateData).toHaveProperty('avatar', testSteamProfile.avatar);
    });
  });

  // ────────────────────────────────────────────
  // linkSteamAccount
  // ────────────────────────────────────────────
  describe('linkSteamAccount', () => {
    it('should link a Steam account to an existing user', async () => {
      (userRepository.findById as jest.Mock).mockResolvedValue(testUser);
      (userRepository.findBySteamId as jest.Mock).mockResolvedValue(null);

      const updatedUser = {
        ...testUser,
        steamId: testSteamProfile.steamId,
        steamUsername: testSteamProfile.username,
      };
      (userRepository.update as jest.Mock).mockResolvedValue(updatedUser);

      const result = await service.linkSteamAccount(testUser.id, testSteamProfile);

      expect(userRepository.update).toHaveBeenCalledWith(
        testUser.id,
        expect.objectContaining({
          steamId: testSteamProfile.steamId,
          steamUsername: testSteamProfile.username,
          steamAvatar: testSteamProfile.avatar,
          steamProfileUrl: testSteamProfile.profileUrl,
        })
      );
      expect(result).not.toHaveProperty('password');
    });

    it('should throw NotFoundError if user does not exist', async () => {
      (userRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(service.linkSteamAccount('nonexistent-id', testSteamProfile)).rejects.toThrow(
        NotFoundError
      );
    });

    it('should throw ConflictError if Steam ID is already linked to another account', async () => {
      (userRepository.findById as jest.Mock).mockResolvedValue(testUser);
      // findBySteamId returns a different user who already owns this Steam ID
      (userRepository.findBySteamId as jest.Mock).mockResolvedValue(testSteamOnlyUser);

      await expect(
        service.linkSteamAccount(testUser.id, {
          ...testSteamProfile,
          steamId: testSteamOnlyUser.steamId!,
        })
      ).rejects.toThrow(ConflictError);
    });

    it('should throw ConflictError if user already has a different Steam account linked', async () => {
      const userWithSteam = {
        ...testUser,
        steamId: '76561198000000099', // already has a Steam account
      };
      (userRepository.findById as jest.Mock).mockResolvedValue(userWithSteam);
      (userRepository.findBySteamId as jest.Mock).mockResolvedValue(null);

      const differentSteamProfile = {
        ...testSteamProfile,
        steamId: '76561198000000100', // different from what's already linked
      };

      await expect(
        service.linkSteamAccount(userWithSteam.id, differentSteamProfile)
      ).rejects.toThrow(ConflictError);
    });

    it('should succeed when re-linking the same Steam ID', async () => {
      const userWithSteam = {
        ...testUser,
        steamId: testSteamProfile.steamId,
      };
      (userRepository.findById as jest.Mock).mockResolvedValue(userWithSteam);
      // findBySteamId returns the same user (not a conflict)
      (userRepository.findBySteamId as jest.Mock).mockResolvedValue(userWithSteam);
      (userRepository.update as jest.Mock).mockResolvedValue(userWithSteam);

      const result = await service.linkSteamAccount(userWithSteam.id, testSteamProfile);
      expect(result).toBeDefined();
      expect(userRepository.update).toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────
  // unlinkSteamAccount
  // ────────────────────────────────────────────
  describe('unlinkSteamAccount', () => {
    it('should unlink Steam from a user with email/password', async () => {
      (userRepository.findById as jest.Mock).mockResolvedValue(testLinkedUser);

      const unlinkedUser = {
        ...testLinkedUser,
        steamId: null,
        steamUsername: null,
        steamAvatar: null,
        steamProfileUrl: null,
      };
      (userRepository.update as jest.Mock).mockResolvedValue(unlinkedUser);

      const result = await service.unlinkSteamAccount(testLinkedUser.id);

      expect(userRepository.update).toHaveBeenCalledWith(testLinkedUser.id, {
        steamId: null,
        steamUsername: null,
        steamAvatar: null,
        steamProfileUrl: null,
      });
      expect(result).not.toHaveProperty('password');
    });

    it('should throw NotFoundError if user does not exist', async () => {
      (userRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(service.unlinkSteamAccount('nonexistent-id')).rejects.toThrow(NotFoundError);
    });

    it('should throw BadRequestError if no Steam account is linked', async () => {
      (userRepository.findById as jest.Mock).mockResolvedValue(testUser); // no steamId

      await expect(service.unlinkSteamAccount(testUser.id)).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError if user has no email (would lose access)', async () => {
      (userRepository.findById as jest.Mock).mockResolvedValue(testSteamOnlyUser);

      await expect(service.unlinkSteamAccount(testSteamOnlyUser.id)).rejects.toThrow(
        BadRequestError
      );
    });

    it('should throw BadRequestError if user has email but no password', async () => {
      const emailButNoPassword = {
        ...testSteamOnlyUser,
        email: 'user@example.com',
        password: null,
      };
      (userRepository.findById as jest.Mock).mockResolvedValue(emailButNoPassword);

      await expect(service.unlinkSteamAccount(emailButNoPassword.id)).rejects.toThrow(
        BadRequestError
      );
    });

    it('should not allow unlink if user has password but no email', async () => {
      const passwordButNoEmail = {
        ...testSteamOnlyUser,
        email: null,
        password: 'hashedPassword',
      };
      (userRepository.findById as jest.Mock).mockResolvedValue(passwordButNoEmail);

      await expect(service.unlinkSteamAccount(passwordButNoEmail.id)).rejects.toThrow(
        BadRequestError
      );
    });
  });

  // ────────────────────────────────────────────
  // getSteamStatus
  // ────────────────────────────────────────────
  describe('getSteamStatus', () => {
    it('should return linked status for a user with Steam', async () => {
      (userRepository.findById as jest.Mock).mockResolvedValue(testLinkedUser);

      const status = await service.getSteamStatus(testLinkedUser.id);

      expect(userRepository.findById).toHaveBeenCalledWith(testLinkedUser.id);
      expect(status.isLinked).toBe(true);
      expect(status.steamId).toBe(testLinkedUser.steamId);
      expect(status.steamUsername).toBe(testLinkedUser.steamUsername);
      expect(status.steamAvatar).toBe(testLinkedUser.steamAvatar);
      expect(status.steamProfileUrl).toBe(testLinkedUser.steamProfileUrl);
    });

    it('should return unlinked status for a user without Steam', async () => {
      (userRepository.findById as jest.Mock).mockResolvedValue(testUser);

      const status = await service.getSteamStatus(testUser.id);

      expect(status.isLinked).toBe(false);
      expect(status.steamId).toBeNull();
      expect(status.steamUsername).toBeNull();
    });

    it('should throw NotFoundError if user does not exist', async () => {
      (userRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(service.getSteamStatus('nonexistent-id')).rejects.toThrow(NotFoundError);
    });
  });
});
