import { AuthService } from '../../services/auth.service';
import { ConflictError, UnauthorizedError, BadRequestError } from '../../utils/errors.util';
import { testUser } from '../setup';
import { userRepository } from '../../repositories/user.repository';
import * as bcrypt from 'bcrypt';

jest.mock('../../utils/password.util', () => ({
  hashPassword: jest.fn(),
  comparePassword: jest.fn(),
}));

jest.mock('../../utils/jwt.util', () => ({
  generateToken: jest.fn(),
}));

// Mock the repository instead of prisma directly
jest.mock('../../repositories/user.repository', () => ({
  userRepository: {
    findByEmail: jest.fn(),
    findByUsername: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    excludePassword: jest.fn((user) => {
      const { password, ...rest } = user;
      return rest;
    }),
  },
}));

jest.mock('bcrypt');

const mockedUserRepository = userRepository as jest.Mocked<typeof userRepository>;
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

import { hashPassword, comparePassword } from '../../utils/password.util';
import { generateToken } from '../../utils/jwt.util';

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerData = {
      email: 'newuser@example.com',
      username: 'newuser',
      password: 'Password123',
      firstName: 'New',
      lastName: 'User',
    };

    it('should successfully register a new user', async () => {
      const newUser = {
        ...testUser,
        email: registerData.email,
        username: registerData.username,
        firstName: registerData.firstName,
        lastName: registerData.lastName,
      };

      (userRepository.findByEmail as jest.Mock).mockResolvedValue(null);
      (userRepository.findByUsername as jest.Mock).mockResolvedValue(null);
      (hashPassword as jest.Mock).mockResolvedValue('hashedPassword123');
      (userRepository.create as jest.Mock).mockResolvedValue(newUser);
      (generateToken as jest.Mock).mockReturnValue('mock-jwt-token');

      const result = await authService.register(registerData);

      expect(userRepository.findByEmail).toHaveBeenCalledWith(registerData.email);
      expect(userRepository.findByUsername).toHaveBeenCalledWith(registerData.username);
      expect(hashPassword).toHaveBeenCalledWith(registerData.password);
      expect(userRepository.create).toHaveBeenCalledWith({
        ...registerData,
        password: 'hashedPassword123',
      });
      expect(generateToken).toHaveBeenCalledWith({
        userId: newUser.id,
        email: newUser.email,
      });
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('token', 'mock-jwt-token');
      expect(result.user).not.toHaveProperty('password');
    });

    it('should throw ConflictError if email already exists', async () => {
      (userRepository.findByEmail as jest.Mock).mockResolvedValue(testUser);

      await expect(authService.register(registerData)).rejects.toThrow(ConflictError);
      await expect(authService.register(registerData)).rejects.toThrow('Email already registered');
    });

    it('should throw ConflictError if username already exists', async () => {
      (userRepository.findByEmail as jest.Mock).mockResolvedValue(null);
      (userRepository.findByUsername as jest.Mock).mockResolvedValue(testUser);

      await expect(authService.register(registerData)).rejects.toThrow(ConflictError);
      await expect(authService.register(registerData)).rejects.toThrow('Username already taken');
    });
  });

  describe('login', () => {
    const loginData = {
      email: testUser.email,
      password: 'Password123',
    };

    it('should successfully login with valid credentials', async () => {
      (userRepository.findByEmail as jest.Mock).mockResolvedValue(testUser);
      (comparePassword as jest.Mock).mockResolvedValue(true);
      (generateToken as jest.Mock).mockReturnValue('mock-jwt-token');

      const result = await authService.login(loginData);

      expect(userRepository.findByEmail).toHaveBeenCalledWith(loginData.email);
      expect(comparePassword).toHaveBeenCalledWith(loginData.password, testUser.password);
      expect(generateToken).toHaveBeenCalledWith({
        userId: testUser.id,
        email: testUser.email,
      });
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('token', 'mock-jwt-token');
      expect(result.user).not.toHaveProperty('password');
    });

    it('should throw UnauthorizedError if user not found', async () => {
      (userRepository.findByEmail as jest.Mock).mockResolvedValue(null);

      await expect(authService.login(loginData)).rejects.toThrow(UnauthorizedError);
      await expect(authService.login(loginData)).rejects.toThrow('Invalid credentials');
    });

    it('should throw UnauthorizedError if password is invalid', async () => {
      (userRepository.findByEmail as jest.Mock).mockResolvedValue(testUser);
      (comparePassword as jest.Mock).mockResolvedValue(false);

      await expect(authService.login(loginData)).rejects.toThrow(UnauthorizedError);
      await expect(authService.login(loginData)).rejects.toThrow('Invalid credentials');
    });
  });

  describe('getProfile', () => {
    it('should return user profile without password', async () => {
      (userRepository.findById as jest.Mock).mockResolvedValue(testUser);

      const result = await authService.getCurrentUser(testUser.id);

      expect(userRepository.findById).toHaveBeenCalledWith(testUser.id);
      expect(result).toBeDefined();
      expect(result).not.toHaveProperty('password');
    });

    it('should throw UnauthorizedError if user not found', async () => {
      (userRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(authService.getCurrentUser('invalid-id')).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('changePassword', () => {
    const mockUserId = 'user-123';
    const mockUser = {
      id: mockUserId,
      username: 'testuser',
      email: 'test@example.com',
      password: 'hashed-current-password',
      firstName: 'Test',
      lastName: 'User',
      bio: null,
      avatar: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    const currentPassword = 'CurrentPass123!';
    const newPassword = 'NewPass123!';

    it('should successfully change password with valid credentials', async () => {
      const newHashedPassword = 'hashed-new-password';

      mockedUserRepository.findById.mockResolvedValue(mockUser as any);
      mockedBcrypt.compare
        .mockResolvedValueOnce(true as never) // Current password is correct
        .mockResolvedValueOnce(false as never); // New password is different
      mockedBcrypt.hash.mockResolvedValue(newHashedPassword as never);
      mockedUserRepository.update.mockResolvedValue({
        ...mockUser,
        password: newHashedPassword,
      } as any);

      const result = await authService.changePassword(mockUserId, currentPassword, newPassword);

      expect(result).toEqual({ message: 'Password changed successfully' });
      expect(mockedUserRepository.findById).toHaveBeenCalledWith(mockUserId);
      expect(mockedBcrypt.compare).toHaveBeenCalledWith(currentPassword, mockUser.password);
      expect(mockedBcrypt.hash).toHaveBeenCalledWith(newPassword, 10);
      expect(mockedUserRepository.update).toHaveBeenCalledWith(mockUserId, {
        password: newHashedPassword,
      });
    });

    it('should throw UnauthorizedError if user not found', async () => {
      mockedUserRepository.findById.mockResolvedValue(null);

      await expect(
        authService.changePassword(mockUserId, currentPassword, newPassword)
      ).rejects.toThrow(UnauthorizedError);

      expect(mockedBcrypt.compare).not.toHaveBeenCalled();
      expect(mockedBcrypt.hash).not.toHaveBeenCalled();
      expect(mockedUserRepository.update).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedError if current password is incorrect', async () => {
      mockedUserRepository.findById.mockResolvedValue(mockUser as any);
      mockedBcrypt.compare.mockResolvedValue(false as never);

      await expect(
        authService.changePassword(mockUserId, 'WrongPassword123!', newPassword)
      ).rejects.toThrow(UnauthorizedError);

      expect(mockedBcrypt.hash).not.toHaveBeenCalled();
      expect(mockedUserRepository.update).not.toHaveBeenCalled();
    });

    it('should throw BadRequestError if new password is same as current', async () => {
      mockedUserRepository.findById.mockResolvedValue(mockUser as any);
      mockedBcrypt.compare
        .mockResolvedValueOnce(true as never) // Current password correct
        .mockResolvedValueOnce(true as never); // New password is same as current

      await expect(
        authService.changePassword(mockUserId, currentPassword, currentPassword)
      ).rejects.toThrow(BadRequestError);

      expect(mockedBcrypt.hash).not.toHaveBeenCalled();
      expect(mockedUserRepository.update).not.toHaveBeenCalled();
    });

    it('should hash the new password before storing', async () => {
      const newHashedPassword = 'hashed-new-password';

      mockedUserRepository.findById.mockResolvedValue(mockUser as any);
      mockedBcrypt.compare
        .mockResolvedValueOnce(true as never)
        .mockResolvedValueOnce(false as never);
      mockedBcrypt.hash.mockResolvedValue(newHashedPassword as never);
      mockedUserRepository.update.mockResolvedValue({
        ...mockUser,
        password: newHashedPassword,
      } as any);

      await authService.changePassword(mockUserId, currentPassword, newPassword);

      expect(mockedBcrypt.hash).toHaveBeenCalledWith(newPassword, 10);
      expect(mockedUserRepository.update).toHaveBeenCalledWith(mockUserId, {
        password: newHashedPassword,
      });
    });

    it('should use bcrypt salt rounds of 10', async () => {
      mockedUserRepository.findById.mockResolvedValue(mockUser as any);
      mockedBcrypt.compare
        .mockResolvedValueOnce(true as never)
        .mockResolvedValueOnce(false as never);
      mockedBcrypt.hash.mockResolvedValue('hashed' as never);
      mockedUserRepository.update.mockResolvedValue(mockUser as any);

      await authService.changePassword(mockUserId, currentPassword, newPassword);

      expect(mockedBcrypt.hash).toHaveBeenCalledWith(newPassword, 10);
    });

    it('should handle repository update errors', async () => {
      mockedUserRepository.findById.mockResolvedValue(mockUser as any);
      mockedBcrypt.compare
        .mockResolvedValueOnce(true as never)
        .mockResolvedValueOnce(false as never);
      mockedBcrypt.hash.mockResolvedValue('hashed' as never);
      mockedUserRepository.update.mockRejectedValue(new Error('Database error'));

      await expect(
        authService.changePassword(mockUserId, currentPassword, newPassword)
      ).rejects.toThrow('Database error');
    });
  });
});
