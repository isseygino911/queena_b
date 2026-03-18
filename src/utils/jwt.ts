/**
 * JWT token generation and verification utilities
 */

import jwt from 'jsonwebtoken';

export interface TokenPayload {
  userId: number;
  email: string;
  isAdmin: boolean;
}

/**
 * Generate a short-lived access token (15 minutes)
 */
export const generateAccessToken = (payload: TokenPayload): string =>
  jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: (process.env.JWT_EXPIRES_IN || '15m') as jwt.SignOptions['expiresIn'],
  });

/**
 * Generate a long-lived refresh token (7 days)
 */
export const generateRefreshToken = (payload: TokenPayload): string =>
  jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'],
  });

/**
 * Verify an access token
 */
export const verifyAccessToken = (token: string): TokenPayload =>
  jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;

/**
 * Verify a refresh token
 */
export const verifyRefreshToken = (token: string): TokenPayload =>
  jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as TokenPayload;
