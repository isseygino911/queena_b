/**
 * AI Settings API Routes
 *
 * Provides endpoints for managing AI model configuration.
 * Admin-only access for write operations.
 */

import express, { Request, Response, NextFunction } from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import {
  getAIProvider,
  setAIProvider,
  getAvailableProviders,
  AIProvider,
} from '../services/aiService';

const router = express.Router();

/**
 * GET /api/ai/provider
 * Get current AI provider and available options
 */
router.get(
  '/provider',
  authMiddleware,
  adminMiddleware,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const current = getAIProvider();
      const providers = getAvailableProviders();
      
      res.json({
        current,
        providers,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/ai/provider
 * Update AI provider (admin only)
 */
router.put(
  '/provider',
  authMiddleware,
  adminMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { provider } = req.body;
      
      if (!provider || !['gemini', 'kimi'].includes(provider)) {
        res.status(400).json({ error: 'Invalid provider. Must be "gemini" or "kimi"' });
        return;
      }

      setAIProvider(provider as AIProvider);
      
      res.json({
        success: true,
        message: `AI provider changed to ${provider}`,
        current: getAIProvider(),
        providers: getAvailableProviders(),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

export default router;
