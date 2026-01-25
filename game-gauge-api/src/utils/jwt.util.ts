import { sign, verify, SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from './logger.util';

export interface JwtPayload {
  userId: string;
  email: string;
}

const options = { expiresIn: env.JWT_EXPIRES_IN } as SignOptions;
export const generateToken = (payload: JwtPayload): string => {
  return sign(payload, env.JWT_SECRET, options);
};

export const verifyToken = (token: string): JwtPayload => {
  try {
    return verify(token, env.JWT_SECRET) as JwtPayload;
  } catch (error) {
    logger.error(error);
    throw new Error('Invalid token');
  }
};
