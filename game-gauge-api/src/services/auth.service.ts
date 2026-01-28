import { userRepository } from '../repositories/user.repository';
import { hashPassword, comparePassword } from '../utils/password.util';
import { generateToken } from '../utils/jwt.util';
import { BadRequestError, ConflictError, UnauthorizedError } from '../utils/errors.util';
import { RegisterInput, LoginInput } from '../validators/auth.validator';
import bcrypt from 'bcrypt';

export class AuthService {
  async register(data: RegisterInput) {
    // Check if user already exists
    const existingUserByEmail = await userRepository.findByEmail(data.email);
    if (existingUserByEmail) {
      throw new ConflictError('Email already registered');
    }

    const existingUserByUsername = await userRepository.findByUsername(data.username);
    if (existingUserByUsername) {
      throw new ConflictError('Username already taken');
    }

    // Hash password
    const hashedPassword = await hashPassword(data.password);

    // Create user
    const user = await userRepository.create({
      ...data,
      password: hashedPassword,
    });

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    // Return user without password
    return {
      user: userRepository.excludePassword(user),
      token,
    };
  }

  async login(data: LoginInput) {
    // Find user
    const user = await userRepository.findByEmail(data.email);
    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Verify password
    const isValidPassword = await comparePassword(data.password, user.password);
    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    // Return user without password
    return {
      user: userRepository.excludePassword(user),
      token,
    };
  }

  async getCurrentUser(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    return userRepository.excludePassword(user);
  }

  /**
   * Change user password
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    // Get user with password
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    // Check if new password is same as current
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      throw new BadRequestError('New password must be different from current password');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await userRepository.update(userId, {
      password: hashedPassword,
    });

    return { message: 'Password changed successfully' };
  }
}

export const authService = new AuthService();
