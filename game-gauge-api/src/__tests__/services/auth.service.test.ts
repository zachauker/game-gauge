import { AuthService } from '../../services/auth.service';
import { ConflictError, UnauthorizedError, BadRequestError } from '../../utils/errors.util';
import { testUser } from '../setup';
import { userRepository } from '../../repositories/user.repository';

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
    update: jest.fn(),
    excludePassword: jest.fn((user) => {
      const { password, ...rest } = user;
      return rest;
    }),
  },
}));

jest.mock('bcrypt');

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
    const mockUser = { ...testUser, password: 'hashed-current-password' };
    const currentPassword = 'CurrentPass123!';
    const newPassword = 'NewPass123!';

    it('should successfully change password with valid credentials', async () => {
      (userRepository.findById as jest.Mock).mockResolvedValue(mockUser);
      (comparePassword as jest.Mock)
        .mockResolvedValueOnce(true) // current password is correct
        .mockResolvedValueOnce(false); // new password is different
      (hashPassword as jest.Mock).mockResolvedValue('hashed-new-password');
      (userRepository.update as jest.Mock).mockResolvedValue({
        ...mockUser,
        password: 'hashed-new-password',
      });

      const result = await authService.changePassword(mockUser.id, currentPassword, newPassword);

      expect(result).toEqual({ message: 'Password changed successfully' });
      expect(userRepository.findById).toHaveBeenCalledWith(mockUser.id);
      expect(comparePassword).toHaveBeenNthCalledWith(1, currentPassword, mockUser.password);
      expect(comparePassword).toHaveBeenNthCalledWith(2, newPassword, mockUser.password);
      expect(hashPassword).toHaveBeenCalledWith(newPassword);
      expect(userRepository.update).toHaveBeenCalledWith(mockUser.id, {
        password: 'hashed-new-password',
      });
    });

    it('should throw UnauthorizedError if user not found', async () => {
      (userRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        authService.changePassword(mockUser.id, currentPassword, newPassword)
      ).rejects.toThrow(UnauthorizedError);

      expect(comparePassword).not.toHaveBeenCalled();
      expect(hashPassword).not.toHaveBeenCalled();
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedError if current password is incorrect', async () => {
      (userRepository.findById as jest.Mock).mockResolvedValue(mockUser);
      (comparePassword as jest.Mock).mockResolvedValue(false);

      await expect(
        authService.changePassword(mockUser.id, 'WrongPassword123!', newPassword)
      ).rejects.toThrow(UnauthorizedError);

      expect(hashPassword).not.toHaveBeenCalled();
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('should throw BadRequestError if new password is same as current', async () => {
      (userRepository.findById as jest.Mock).mockResolvedValue(mockUser);
      (comparePassword as jest.Mock)
        .mockResolvedValueOnce(true) // current password is correct
        .mockResolvedValueOnce(true); // new password matches current

      await expect(
        authService.changePassword(mockUser.id, currentPassword, currentPassword)
      ).rejects.toThrow(BadRequestError);

      expect(hashPassword).not.toHaveBeenCalled();
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('should handle repository update errors', async () => {
      (userRepository.findById as jest.Mock).mockResolvedValue(mockUser);
      (comparePassword as jest.Mock).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      (hashPassword as jest.Mock).mockResolvedValue('hashed-new-password');
      (userRepository.update as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(
        authService.changePassword(mockUser.id, currentPassword, newPassword)
      ).rejects.toThrow('Database error');
    });
  });
});
