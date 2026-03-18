/**
 * Authentication and authorization middleware
 */

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../utils/jwt';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

/**
 * Verify access token from httpOnly cookie
 */
export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const token = req.cookies?.accessToken;
  
  if (!token) {
    res.status(401).json({ message: 'Access denied. No token provided.' });
    return;
  }
  
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (err) {
    const message = err instanceof Error && err.name === 'TokenExpiredError'
      ? 'Token expired'
      : 'Invalid token';
    res.status(401).json({ message });
    return;
  }
};

/**
 * Require admin privileges
 */
export const adminMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user?.isAdmin) {
    res.status(403).json({ message: 'Admin access required.' });
    return;
  }
  next();
};
