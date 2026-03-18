/**
 * Async handler wrapper to catch errors in async route handlers
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<void | Response>;

/**
 * Wraps an async route handler to catch errors and pass them to next()
 */
export const asyncHandler = (fn: AsyncRequestHandler): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
