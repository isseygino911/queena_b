/**
 * Authentication controller
 * Handles register, login, logout, token refresh, and user profile
 */

import { Request, Response } from 'express';
import pool from '../db/database';
import { hashPassword, comparePassword } from '../utils/hash';
import { 
  generateAccessToken, 
  generateRefreshToken, 
  verifyRefreshToken,
  TokenPayload 
} from '../utils/jwt';
import { asyncHandler } from '../middleware/asyncHandler';

// Cookie options for httpOnly cookies
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
};

// User response type (without sensitive data)
interface UserResponse {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
}

/**
 * Register a new user
 * POST /api/auth/register
 */
export const register = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { username, email, password } = req.body;

  // Validate input
  if (!username || !email || !password) {
    res.status(400).json({ message: 'Username, email, and password are required' });
    return;
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    res.status(400).json({ message: 'Invalid email format' });
    return;
  }

  // Validate password length
  if (password.length < 8) {
    res.status(400).json({ message: 'Password must be at least 8 characters' });
    return;
  }

  // Validate username length
  if (username.length < 3 || username.length > 50) {
    res.status(400).json({ message: 'Username must be between 3 and 50 characters' });
    return;
  }

  // Check for duplicate email or username
  const [existing] = await pool.execute(
    'SELECT id FROM users WHERE email = ? OR username = ?',
    [email.toLowerCase(), username]
  );
  
  if (Array.isArray(existing) && existing.length > 0) {
    res.status(409).json({ message: 'Email or username already registered' });
    return;
  }

  // Create user
  const passwordHash = await hashPassword(password);
  const [result] = await pool.execute(
    'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
    [username, email.toLowerCase(), passwordHash]
  );

  const userId = (result as { insertId: number }).insertId;
  
  const payload: TokenPayload = { 
    userId, 
    email: email.toLowerCase(), 
    isAdmin: false 
  };
  
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  // Store refresh token in DB
  await pool.execute(
    'UPDATE users SET refresh_token = ? WHERE id = ?',
    [refreshToken, userId]
  );

  const userResponse: UserResponse = {
    id: userId,
    username,
    email: email.toLowerCase(),
    is_admin: false,
  };

  res
    .cookie('accessToken', accessToken, { ...COOKIE_OPTS, maxAge: 15 * 60 * 1000 })
    .cookie('refreshToken', refreshToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 })
    .status(201)
    .json({ user: userResponse });
});

/**
 * Login user
 * POST /api/auth/login
 */
export const login = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ message: 'Email and password are required' });
    return;
  }

  const [rows] = await pool.execute(
    'SELECT id, username, email, password_hash, is_admin FROM users WHERE email = ?',
    [email.toLowerCase()]
  );

  const users = rows as Array<{
    id: number;
    username: string;
    email: string;
    password_hash: string;
    is_admin: boolean;
  }>;

  // Constant-time comparison: always compare even if user not found
  const dummyHash = '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
  const hash = users.length > 0 ? users[0].password_hash : dummyHash;
  const isValid = await comparePassword(password, hash);

  if (users.length === 0 || !isValid) {
    res.status(401).json({ message: 'Invalid credentials' });
    return;
  }

  const user = users[0];
  const payload: TokenPayload = { 
    userId: user.id, 
    email: user.email, 
    isAdmin: !!user.is_admin 
  };
  
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  // Store refresh token in DB
  await pool.execute(
    'UPDATE users SET refresh_token = ? WHERE id = ?',
    [refreshToken, user.id]
  );

  const userResponse: UserResponse = {
    id: user.id,
    username: user.username,
    email: user.email,
    is_admin: !!user.is_admin,
  };

  res
    .cookie('accessToken', accessToken, { ...COOKIE_OPTS, maxAge: 15 * 60 * 1000 })
    .cookie('refreshToken', refreshToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 })
    .json({ user: userResponse });
});

/**
 * Refresh access token
 * POST /api/auth/refresh
 */
export const refresh = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const token = req.cookies?.refreshToken;
  
  if (!token) {
    res.status(401).json({ message: 'No refresh token' });
    return;
  }

  const decoded = verifyRefreshToken(token);

  // Verify token matches DB (rotation check)
  const [rows] = await pool.execute(
    'SELECT id, username, email, is_admin, refresh_token FROM users WHERE id = ?',
    [decoded.userId]
  );

  const users = rows as Array<{
    id: number;
    username: string;
    email: string;
    is_admin: boolean;
    refresh_token: string | null;
  }>;

  if (users.length === 0 || users[0].refresh_token !== token) {
    res.status(401).json({ message: 'Invalid refresh token' });
    return;
  }

  const user = users[0];
  const payload: TokenPayload = { 
    userId: user.id, 
    email: user.email, 
    isAdmin: !!user.is_admin 
  };
  
  const newAccessToken = generateAccessToken(payload);
  const newRefreshToken = generateRefreshToken(payload);

  // Rotate refresh token in DB
  await pool.execute(
    'UPDATE users SET refresh_token = ? WHERE id = ?',
    [newRefreshToken, user.id]
  );

  res
    .cookie('accessToken', newAccessToken, { ...COOKIE_OPTS, maxAge: 15 * 60 * 1000 })
    .cookie('refreshToken', newRefreshToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 })
    .json({ ok: true });
});

/**
 * Logout user
 * POST /api/auth/logout
 */
export const logout = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const token = req.cookies?.refreshToken;
  
  if (token) {
    // Invalidate token in DB - log but don't fail if DB error occurs
    try {
      await pool.execute(
        'UPDATE users SET refresh_token = NULL WHERE refresh_token = ?',
        [token]
      );
    } catch (dbErr) {
      console.error('Failed to invalidate refresh token in DB:', dbErr);
      // Continue with logout - clear cookies regardless
    }
  }
  
  res
    .clearCookie('accessToken', COOKIE_OPTS)
    .clearCookie('refreshToken', COOKIE_OPTS)
    .json({ message: 'Logged out' });
});

/**
 * Get current user profile
 * GET /api/auth/me
 */
export const getMe = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const [rows] = await pool.execute(
    'SELECT id, username, email, is_admin FROM users WHERE id = ?',
    [req.user!.userId]
  );

  const users = rows as Array<UserResponse>;
  
  if (users.length === 0) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  
  res.json({ user: users[0] });
});
