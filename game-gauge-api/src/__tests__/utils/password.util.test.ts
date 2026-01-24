import { hashPassword, comparePasswords } from '../../utils/password.util';
import bcrypt from 'bcrypt';

// Mock bcrypt
jest.mock('bcrypt');

describe('Password Utilities', () => {
  describe('hashPassword', () => {
    it('should hash password successfully', async () => {
      // Arrange
      const password = 'TestPassword123';
      const hashedPassword = 'hashedPassword123';
      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);

      // Act
      const result = await hashPassword(password);

      // Assert
      expect(bcrypt.hash).toHaveBeenCalledWith(password, 10);
      expect(result).toBe(hashedPassword);
    });

    it('should use correct salt rounds', async () => {
      // Arrange
      const password = 'TestPassword123';
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');

      // Act
      await hashPassword(password);

      // Assert
      expect(bcrypt.hash).toHaveBeenCalledWith(password, 10);
    });
  });

  describe('comparePasswords', () => {
    it('should return true for matching passwords', async () => {
      // Arrange
      const password = 'TestPassword123';
      const hashedPassword = 'hashedPassword123';
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      // Act
      const result = await comparePasswords(password, hashedPassword);

      // Assert
      expect(bcrypt.compare).toHaveBeenCalledWith(password, hashedPassword);
      expect(result).toBe(true);
    });

    it('should return false for non-matching passwords', async () => {
      // Arrange
      const password = 'WrongPassword';
      const hashedPassword = 'hashedPassword123';
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      // Act
      const result = await comparePasswords(password, hashedPassword);

      // Assert
      expect(result).toBe(false);
    });
  });
});
