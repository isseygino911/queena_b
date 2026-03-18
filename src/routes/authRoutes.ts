/**
 * Authentication routes
 */

import { Router } from 'express';
import { register, login, logout, getMe, refresh } from '../controllers/authController';
import { authMiddleware } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

// Public routes with rate limiting
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', logout);

// Protected routes
router.get('/me', authMiddleware, getMe);

export default router;
