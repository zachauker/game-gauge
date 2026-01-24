import { AuthService } from '../../services/auth.service';
import { hashPassword, comparePasswords } from '../../utils/password.util';
import { generateToken } from '../../utils/jwt.util';
import { ConflictError, UnauthorizedError } from '../../utils/errors.util';
import { testUser } from '../setup';
import { prisma } from '../../config/database';

// Mock utils
jest.mock('../../utils/password.util');
jest.mock('../../utils/jwt.util');

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
      (prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(null) // findByEmail
        .mockResolvedValueOnce(null); // findByUsername
      (hashPassword as jest.Mock).mockResolvedValue('hashedPassword123');
      (prisma.user.create as jest.Mock).mockResolvedValue({
        ...testUser,
        email: registerData.email,
        username: registerData.username,
      });
      (generateToken as jest.Mock).mockReturnValue('test-token');

      // Act
      const result = await authService.register(registerData);

      // Assert
      expect(hashPassword).toHaveBeenCalledWith(registerData.password);
      expect(prisma.user.create).toHaveBeenCalled();
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('token', 'test-token');
    });

    it('should throw ConflictError if email already exists', async () => {
      // Arrange
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(testUser);

      // Act & Assert
      await expect(authService.register(registerData)).rejects.toThrow(ConflictError);
    });

    it('should throw ConflictError if username already exists', async () => {
      // Arrange
      (prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(null) // email check passes
        .mockResolvedValueOnce(testUser); // username check fails

      // Act & Assert
      await expect(authService.register(registerData)).rejects.toThrow(ConflictError);
    });
  });

  describe('login', () => {
    const loginData = {
      email: 'test@example.com',
      password: 'Password123',
    };

    it('should successfully login with correct credentials', async () => {
      // Arrange
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(testUser);
      (comparePasswords as jest.Mock).mockResolvedValue(true);
      (generateToken as jest.Mock).mockReturnValue('test-token');

      // Act
      const result = await authService.login(loginData);

      // Assert
      expect(comparePasswords).toHaveBeenCalledWith(loginData.password, testUser.password);
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('token', 'test-token');
    });

    it('should throw UnauthorizedError if user not found', async () => {
      // Arrange
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(authService.login(loginData)).rejects.toThrow(UnauthorizedError);
    });

    it('should throw UnauthorizedError if password is incorrect', async () => {
      // Arrange
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(testUser);
      (comparePasswords as jest.Mock).mockResolvedValue(false);

      // Act & Assert
      await expect(authService.login(loginData)).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('getProfile', () => {
    it('should return user profile without password', async () => {
      // Arrange
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(testUser);

      // Act
      const result = await authService.getProfile(testUser.id);

      // Assert
      expect(result).toBeDefined();
      expect(result).not.toHaveProperty('password');
    });

    it('should throw error if user not found', async () => {
      // Arrange
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(authService.getProfile('invalid-id')).rejects.toThrow();
    });
  });
});
