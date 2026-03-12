import { userRepository } from '../repositories/user.repository';
import { hashPassword, comparePassword } from '../utils/password.util';
import { generateToken } from '../utils/jwt.util';
import { BadRequestError, ConflictError, UnauthorizedError } from '../utils/errors.util';
import { RegisterInput, LoginInput } from '../validators/auth.validator';
import { provisionDefaultLists } from './list-provisioning.service';

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

    // Provision default lists (Wishlist, Currently Playing, Completed)
    await provisionDefaultLists(user.id);

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email || '',
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

    // Steam-only users can't log in with email/password
    if (!user.password) {
      throw new UnauthorizedError(
        'This account uses Steam sign-in. Please use the "Sign in with Steam" button.'
      );
    }

    // Verify password
    const isValidPassword = await comparePassword(data.password, user.password);
    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email || '',
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

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    if (!user.password) {
      throw new UnauthorizedError(
        'This account uses Steam sign-in. Please use the "Sign in with Steam" button.'
      );
    }

    const isValidPassword = await comparePassword(currentPassword, user.password);
    if (!isValidPassword) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    if (currentPassword === newPassword) {
      throw new BadRequestError('New password must be different from current password');
    }

    const hashedPassword = await hashPassword(newPassword);
    await userRepository.update(userId, { password: hashedPassword });
  }
}

export const authService = new AuthService();
