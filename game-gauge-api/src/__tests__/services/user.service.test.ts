import { userService } from '../../services/user.service';
import { userRepository } from '../../repositories/user.repository';
import { NotFoundError } from '../../utils/errors.util';

// Mock the repository
jest.mock('../../repositories/user.repository');

const mockedUserRepository = userRepository as jest.Mocked<typeof userRepository>;

describe('UserService - Settings & Profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCurrentUserProfile', () => {
    const mockUserId = 'user-123';
    const mockUser = {
      id: mockUserId,
      username: 'testuser',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      bio: 'Test bio',
      avatar: null,
      password: 'hashed-password',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    const mockStats = {
      totalRatings: 10,
      totalReviews: 5,
      totalLists: 3,
      averageRating: 8.5,
      publicListsCount: 2,
      recentActivity: {
        lastRatingDate: new Date('2024-01-15'),
        lastReviewDate: new Date('2024-01-14'),
      },
    };

    it('should return current user profile with stats', async () => {
      mockedUserRepository.findById.mockResolvedValue(mockUser as any);
      mockedUserRepository.getUserStats.mockResolvedValue(mockStats as any);

      const result = await userService.getCurrentUserProfile(mockUserId);

      expect(result).toEqual({
        id: mockUserId,
        username: 'testuser',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        bio: 'Test bio',
        avatar: null,
        createdAt: mockUser.createdAt,
        stats: mockStats,
      });

      expect(mockedUserRepository.findById).toHaveBeenCalledWith(mockUserId);
      expect(mockedUserRepository.getUserStats).toHaveBeenCalledWith(mockUserId);
    });

    it('should throw NotFoundError if user does not exist', async () => {
      mockedUserRepository.findById.mockResolvedValue(null);

      await expect(userService.getCurrentUserProfile('non-existent-id')).rejects.toThrow(
        NotFoundError
      );

      expect(mockedUserRepository.findById).toHaveBeenCalledWith('non-existent-id');
      expect(mockedUserRepository.getUserStats).not.toHaveBeenCalled();
    });
  });

  describe('updateProfile', () => {
    const mockUserId = 'user-123';
    const mockUser = {
      id: mockUserId,
      username: 'testuser',
      email: 'test@example.com',
      firstName: 'Original',
      lastName: 'Name',
      bio: 'Original bio',
      avatar: null,
      password: 'hashed-password',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    it('should update user profile with valid data', async () => {
      const updateData = {
        firstName: 'Updated',
        lastName: 'User',
        bio: 'Updated bio',
      };

      const updatedUser = { ...mockUser, ...updateData };

      (userRepository.findById as jest.Mock).mockResolvedValue(mockUser);
      (userRepository.updateProfile as jest.Mock).mockResolvedValue(updatedUser);

      const result = await userService.updateProfile(mockUserId, updateData);

      expect(result).toBeDefined();
      expect(result).toEqual(updatedUser);
      expect(mockedUserRepository.updateProfile).toHaveBeenCalledWith(mockUserId, updateData);
    });

    it('should handle partial updates (only firstName)', async () => {
      const updateData = { firstName: 'John' };
      const updatedUser = { ...mockUser, firstName: 'John' };

      (userRepository.findById as jest.Mock).mockResolvedValue(mockUser);
      (userRepository.updateProfile as jest.Mock).mockResolvedValue(updatedUser);

      const result = await userService.updateProfile(mockUserId, updateData);

      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe(mockUser.lastName);
      expect(mockedUserRepository.updateProfile).toHaveBeenCalledWith(mockUserId, updateData);
    });

    it('should handle empty bio', async () => {
      const updateData = { bio: '' };
      const updatedUser = { ...mockUser, bio: '' };

      mockedUserRepository.findById.mockResolvedValue(mockUser as any);
      mockedUserRepository.updateProfile.mockResolvedValue(updatedUser as any);

      const result = await userService.updateProfile(mockUserId, updateData);

      expect(result.bio).toBe('');
    });

    it('should throw NotFoundError if user does not exist', async () => {
      mockedUserRepository.findById.mockResolvedValue(null);

      await expect(
        userService.updateProfile('non-existent-id', { firstName: 'Test' })
      ).rejects.toThrow(NotFoundError);
    });

    it('should validate bio length (max 500 characters)', async () => {
      const longBio = 'a'.repeat(501);

      mockedUserRepository.findById.mockResolvedValue(mockUser as any);

      await expect(userService.updateProfile(mockUserId, { bio: longBio })).rejects.toThrow();
    });
  });

  describe('updateUsername', () => {
    const mockUserId = 'user-123';
    const mockUser = {
      id: mockUserId,
      username: 'oldusername',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      bio: null,
      avatar: null,
      password: 'hashed-password',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    it('should update username with valid new username', async () => {
      const newUsername = 'newusername';
      const updatedUser = { ...mockUser, username: newUsername };

      (userRepository.findById as jest.Mock).mockResolvedValue(mockUser);
      (userRepository.findByUsername as jest.Mock).mockResolvedValue(null);
      (userRepository.updateUsername as jest.Mock).mockResolvedValue(updatedUser);

      const result = await userService.updateUsername(mockUserId, newUsername);

      expect(result.username).toBe(newUsername);
      expect(mockedUserRepository.findByUsername).toHaveBeenCalledWith(newUsername);
      expect(mockedUserRepository.updateUsername).toHaveBeenCalledWith(mockUserId, newUsername);
    });

    it('should throw BadRequestError if username is too short', async () => {
      mockedUserRepository.findById.mockResolvedValue(mockUser as any);

      await expect(userService.updateUsername(mockUserId, 'ab')).rejects.toThrow(Error);
    });

    it('should throw BadRequestError if username is too long', async () => {
      const longUsername = 'a'.repeat(31);

      mockedUserRepository.findById.mockResolvedValue(mockUser as any);

      await expect(userService.updateUsername(mockUserId, longUsername)).rejects.toThrow(Error);
    });

    it('should throw BadRequestError if username contains invalid characters', async () => {
      mockedUserRepository.findById.mockResolvedValue(mockUser as any);

      await expect(userService.updateUsername(mockUserId, 'user@name')).rejects.toThrow(Error);

      await expect(userService.updateUsername(mockUserId, 'user name')).rejects.toThrow(Error);

      await expect(userService.updateUsername(mockUserId, 'user!name')).rejects.toThrow(Error);
    });

    it('should allow valid username characters', async () => {
      const validUsernames = ['username', 'user_name', 'user-name', 'user123', 'user_123-test'];

      mockedUserRepository.findById.mockResolvedValue(mockUser as any);
      mockedUserRepository.findByUsername.mockResolvedValue(null);

      for (const username of validUsernames) {
        (userRepository.updateUsername as jest.Mock).mockResolvedValue({
          ...mockUser,
          username,
        } as any);
        const result = await userService.updateUsername(mockUserId, username);
        expect(result.username).toBe(username);
      }
    });

    it('should throw BadRequestError if username is already taken', async () => {
      const existingUser = {
        ...mockUser,
        id: 'different-user-id',
        username: 'takenusername',
      };

      mockedUserRepository.findById.mockResolvedValue(mockUser as any);
      mockedUserRepository.findByUsername.mockResolvedValue(existingUser as any);

      await expect(userService.updateUsername(mockUserId, 'takenusername')).rejects.toThrow(Error);

      expect(mockedUserRepository.update).not.toHaveBeenCalled();
    });

    it('should allow keeping the same username', async () => {
      const currentUsername = mockUser.username;

      mockedUserRepository.findById.mockResolvedValue(mockUser as any);
      mockedUserRepository.findByUsername.mockResolvedValue(mockUser as any);
      mockedUserRepository.updateUsername.mockResolvedValue(mockUser as any);

      const result = await userService.updateUsername(mockUserId, currentUsername);

      expect(result.username).toBe(currentUsername);
    });

    it('should throw NotFoundError if user does not exist', async () => {
      mockedUserRepository.findById.mockResolvedValue(null);

      await expect(userService.updateUsername('non-existent-id', 'newusername')).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('getProfile', () => {
    const mockUsername = 'testuser';
    const mockProfile = {
      id: 'user-123',
      username: mockUsername,
      firstName: 'Test',
      lastName: 'User',
      bio: 'Test bio',
      avatar: null,
      email: 'test@example.com',
      password: 'hashed',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date(),
      _count: {
        ratings: 10,
        reviews: 5,
        lists: 3,
      },
    };

    it('should return user profile by username', async () => {
      (userRepository.getProfile as jest.Mock).mockResolvedValue(mockProfile as any);

      const result = await userService.getProfile(mockUsername);

      expect(result.username).toBe(mockUsername);
      expect(userRepository.getProfile).toHaveBeenCalledWith(mockUsername);
    });

    it('should throw NotFoundError if username does not exist', async () => {
      mockedUserRepository.getProfile.mockResolvedValue(null);

      await expect(userService.getProfile('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });
});
