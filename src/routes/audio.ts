/**
 * Audio streaming routes
 * Proxies audio files from S3 to avoid CORS and expiration issues
 */

import express, { Request, Response, NextFunction } from 'express';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import pool from '../db/database';
import { Readable } from 'stream';

const router = express.Router();

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || '';

/**
 * GET /api/audio/tracks/:id
 * Stream audio file from S3 through backend
 * No authentication required (public tracks)
 */
router.get(
  '/tracks/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const [rows] = await pool.execute(
        'SELECT processed_file_path FROM tracks WHERE id = ?',
        [req.params.id]
      );

      const track = (rows as Array<{ processed_file_path?: string }>)[0];
      
      if (!track || !track.processed_file_path) {
        res.status(404).json({ error: 'Track not found' });
        return;
      }

      // Extract S3 key from URL
      const s3Url = track.processed_file_path;
      const urlObj = new URL(s3Url);
      const key = urlObj.pathname.substring(1);

      // Fetch from S3
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: key,
      });

      const s3Response = await s3Client.send(command);
      
      if (!s3Response.Body) {
        res.status(404).json({ error: 'Audio file not found' });
        return;
      }

      // Set headers
      res.setHeader('Content-Type', s3Response.ContentType || 'audio/wav');
      res.setHeader('Content-Length', s3Response.ContentLength || '');
      res.setHeader('Accept-Ranges', 'bytes');
      
      // Enable caching for 1 hour
      res.setHeader('Cache-Control', 'public, max-age=3600');

      // Stream to client
      const stream = s3Response.Body as Readable;
      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
