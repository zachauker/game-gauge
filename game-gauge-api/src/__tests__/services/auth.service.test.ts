import { AuthService } from '../../services/auth.service';
import { ConflictError, UnauthorizedError } from '../../utils/errors.util';
import { testUser } from '../setup';
import { prisma } from '../../config/database';

// Mock password and JWT utilities
jest.mock('../../utils/password.util', () => ({
  hashPassword: jest.fn(),
  comparePassword: jest.fn(),
}));

jest.mock('../../utils/jwt.util', () => ({
  generateToken: jest.fn(),
}));

import { hashPassword, comparePassword } from '../../utils/password.util';
import { generateToken } from '../../utils/jwt.util';

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
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
      // Arrange
      const newUser = {
        ...testUser,
        email: registerData.email,
        username: registerData.username,
        firstName: registerData.firstName,
        lastName: registerData.lastName,
      };

      (prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(null) // findByEmail returns null
        .mockResolvedValueOnce(null); // findByUsername returns null
      (hashPassword as jest.Mock).mockResolvedValue('hashedPassword123');
      (prisma.user.create as jest.Mock).mockResolvedValue(newUser);
      (generateToken as jest.Mock).mockReturnValue('mock-jwt-token');

      // Act
      const result = await authService.register(registerData);

      // Assert
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
      expect(hashPassword).toHaveBeenCalledWith(registerData.password);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: registerData.email,
          username: registerData.username,
          firstName: registerData.firstName,
          lastName: registerData.lastName,
          password: 'hashedPassword123',
        },
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
      // Arrange
      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(testUser); // Email exists

      // Act & Assert
      await expect(authService.register(registerData)).rejects.toThrow(ConflictError);
      await expect(authService.register(registerData)).rejects.toThrow('Email already registered');
    });

    it('should throw ConflictError if username already exists', async () => {
      // Arrange
      (prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(null) // Email doesn't exist
        .mockResolvedValueOnce(testUser); // Username exists

      // Act & Assert
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
      // Arrange
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(testUser);
      (comparePassword as jest.Mock).mockResolvedValue(true);
      (generateToken as jest.Mock).mockReturnValue('mock-jwt-token');

      // Act
      const result = await authService.login(loginData);

      // Assert
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: loginData.email },
      });
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
      // Arrange
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(authService.login(loginData)).rejects.toThrow(UnauthorizedError);
      await expect(authService.login(loginData)).rejects.toThrow('Invalid credentials');
    });

    it('should throw UnauthorizedError if password is invalid', async () => {
      // Arrange
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(testUser);
      (comparePassword as jest.Mock).mockResolvedValue(false);

      // Act & Assert
      await expect(authService.login(loginData)).rejects.toThrow(UnauthorizedError);
      await expect(authService.login(loginData)).rejects.toThrow('Invalid credentials');
    });
  });

  describe('getProfile', () => {
    it('should return user profile without password', async () => {
      // Arrange
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(testUser);

      // Act
      const result = await authService.getCurrentUser(testUser.id);

      // Assert
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: testUser.id },
      });
      expect(result).toBeDefined();
      expect(result).not.toHaveProperty('password');
    });

    it('should return null if user not found', async () => {
      // Arrange
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      // Act
      const result = await authService.getCurrentUser('invalid-id');

      // Assert
      expect(result).toBeNull();
    });
  });
});
