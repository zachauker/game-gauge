import { AuthService } from '../../services/auth.service';
import { hashPassword, comparePasswords } from '../../utils/password.util';
import { generateToken } from '../../utils/jwt.util';
import { ConflictError, UnauthorizedError } from '../../utils/errors.util';
import { testUser } from '../setup';

// Mock the entire repository module
jest.mock('../../repositories/user.repository');
jest.mock('../../utils/password.util');
jest.mock('../../utils/jwt.util');

import { UserRepository } from '../../repositories/user.repository';

describe('AuthService', () => {
  let authService: AuthService;
  let mockUserRepository: jest.Mocked<UserRepository>;

  beforeEach(() => {
    // Create a new instance of the mocked repository
    mockUserRepository = new UserRepository() as jest.Mocked<UserRepository>;
    authService = new AuthService();
    // Replace the private repository instance with our mock
    (authService as any).userRepository = mockUserRepository;
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
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.findByUsername.mockResolvedValue(null);
      (hashPassword as jest.Mock).mockResolvedValue('hashedPassword123');
      mockUserRepository.create.mockResolvedValue({
        ...testUser,
        email: registerData.email,
        username: registerData.username,
      });
      (generateToken as jest.Mock).mockReturnValue('test-token');

      // Act
      const result = await authService.register(registerData);

      // Assert
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(registerData.email);
      expect(mockUserRepository.findByUsername).toHaveBeenCalledWith(registerData.username);
      expect(hashPassword).toHaveBeenCalledWith(registerData.password);
      expect(mockUserRepository.create).toHaveBeenCalled();
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('token', 'test-token');
    });

    it('should throw ConflictError if email already exists', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(testUser);

      // Act & Assert
      await expect(authService.register(registerData)).rejects.toThrow(ConflictError);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(registerData.email);
    });

    it('should throw ConflictError if username already exists', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.findByUsername.mockResolvedValue(testUser);

      // Act & Assert
      await expect(authService.register(registerData)).rejects.toThrow(ConflictError);
      expect(mockUserRepository.findByUsername).toHaveBeenCalledWith(registerData.username);
    });
  });

  describe('login', () => {
    const loginData = {
      email: 'test@example.com',
      password: 'Password123',
    };

    it('should successfully login with correct credentials', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(testUser);
      (comparePasswords as jest.Mock).mockResolvedValue(true);
      (generateToken as jest.Mock).mockReturnValue('test-token');

      // Act
      const result = await authService.login(loginData);

      // Assert
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(loginData.email);
      expect(comparePasswords).toHaveBeenCalledWith(loginData.password, testUser.password);
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('token', 'test-token');
    });

    it('should throw UnauthorizedError if user not found', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(null);

      // Act & Assert
      await expect(authService.login(loginData)).rejects.toThrow(UnauthorizedError);
    });

    it('should throw UnauthorizedError if password is incorrect', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(testUser);
      (comparePasswords as jest.Mock).mockResolvedValue(false);

      // Act & Assert
      await expect(authService.login(loginData)).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('getProfile', () => {
    it('should return user profile without password', async () => {
      // Arrange
      mockUserRepository.findById.mockResolvedValue(testUser);

      // Act
      const result = await authService.getProfile(testUser.id);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledWith(testUser.id);
      expect(result).toBeDefined();
      expect(result).not.toHaveProperty('password');
    });

    it('should throw error if user not found', async () => {
      // Arrange
      mockUserRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(authService.getProfile('invalid-id')).rejects.toThrow();
    });
  });
});
