/**
 * Track CRUD routes
 *
 * GET    /api/tracks          - List all tracks
 * GET    /api/tracks/:id      - Get single track with MIDI data
 * DELETE /api/tracks/:id      - Delete a track (admin)
 * POST   /api/tracks/:id/score - Submit a score for a track
 * GET    /api/tracks/:id/scores - Get leaderboard for a track
 */

import express, { Request, Response, NextFunction } from 'express';
import pool from '../db/database';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { deleteFromS3, getKeyFromS3Url, getPresignedUrl } from '../config/s3';
import { getCloudFrontUrlFromS3 } from '../config/cloudfront';

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/tracks
// ---------------------------------------------------------------------------

router.get(
  '/',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const [rows] = await pool.execute(
        `SELECT id, title, artist, bpm, duration, section_start, section_end,
                difficulty, created_at
         FROM tracks
         ORDER BY created_at DESC`
      );
      res.json(rows);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/tracks/:id
// ---------------------------------------------------------------------------

router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const [rows] = await pool.execute(
        `SELECT id, title, artist, bpm, duration, section_start, section_end,
                difficulty, midi_data, waveform_data, processed_file_path, created_at
         FROM tracks
         WHERE id = ?`,
        [req.params.id]
      );

      const track = (rows as unknown[])[0] as Record<string, unknown> | undefined;

      if (!track) {
        res.status(404).json({ error: 'Track not found' });
        return;
      }

      // mysql2 returns JSON columns as already-parsed objects when
      // using newer drivers; guard for both cases.
      if (typeof track.midi_data === 'string') {
        track.midi_data = JSON.parse(track.midi_data as string);
      }
      if (typeof track.waveform_data === 'string') {
        track.waveform_data = JSON.parse(track.waveform_data as string);
      }

      // Re-zero note times to section window so the game loop sees t=0 at section start
      const sectionStart = typeof track.section_start === 'number' ? track.section_start : null;
      const sectionEnd = typeof track.section_end === 'number' ? track.section_end : null;

      if (sectionStart !== null && sectionEnd !== null && track.midi_data) {
        const midiData = track.midi_data as {
          notes: Array<{ time: number }>;
          duration: number;
          sectionStart?: number;
          sectionEnd?: number;
        };

        // Filter notes to section window and re-zero their times
        midiData.notes = midiData.notes
          .filter(
            (note) =>
              note.time >= sectionStart * 1000 && note.time <= sectionEnd * 1000
          )
          .map((note) => ({ ...note, time: note.time - sectionStart * 1000 }));

        midiData.duration = sectionEnd - sectionStart;
        midiData.sectionStart = sectionStart;
        midiData.sectionEnd = sectionEnd;
      }

      // Generate signed URL for audio playback
      const processedFilePath = track.processed_file_path as string | undefined;
      if (processedFilePath) {
        try {
          // Try CloudFront first (7-day expiration)
          track.audio_url = getCloudFrontUrlFromS3(processedFilePath, 7 * 24 * 60 * 60);
        } catch {
          // Fallback to S3 presigned URL (24-hour expiration)
          track.audio_url = await getPresignedUrl(processedFilePath, 86400);
        }
      }

      res.json(track);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/tracks/:id
// ---------------------------------------------------------------------------

router.delete(
  '/:id',
  authMiddleware,
  adminMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Fetch S3 URLs before deleting
      const [rows] = await pool.execute(
        `SELECT original_file_path, processed_file_path FROM tracks WHERE id = ?`,
        [req.params.id]
      );
      const track = (rows as unknown[])[0] as
        | { original_file_path?: string; processed_file_path?: string }
        | undefined;

      if (!track) {
        res.status(404).json({ error: 'Track not found' });
        return;
      }

      await pool.execute('DELETE FROM tracks WHERE id = ?', [req.params.id]);

      // Delete files from S3 (best-effort)
      for (const url of [track.original_file_path, track.processed_file_path]) {
        if (url) {
          const key = getKeyFromS3Url(url);
          if (key) {
            try {
              await deleteFromS3(key);
            } catch {
              /* non-fatal */
            }
          }
        }
      }

      res.json({ message: 'Track deleted' });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/tracks/:id/score - Submit score (requires authentication)
// ---------------------------------------------------------------------------

router.post(
  '/:id/score',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const trackId = req.params.id; // UUID string
      const userId = req.user!.userId; // From auth middleware
      
      const {
        score,
        accuracy,
        maxCombo,
        perfectCount,
        goodCount,
        missCount,
      } = req.body as {
        score: number;
        accuracy: number;
        maxCombo: number;
        perfectCount: number;
        goodCount: number;
        missCount: number;
      };

      const [result] = await pool.execute(
        `INSERT INTO scores
           (user_id, track_id, score, accuracy, max_combo,
            perfect_count, good_count, miss_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          trackId,
          score,
          accuracy,
          maxCombo,
          perfectCount,
          goodCount,
          missCount,
        ]
      );

      const insertId = (result as { insertId: number }).insertId;

      // Update user_progress
      await pool.execute(
        `INSERT INTO user_progress (user_id, track_id, best_score, play_count)
         VALUES (?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           best_score = GREATEST(best_score, VALUES(best_score)),
           play_count = play_count + 1`,
        [userId, trackId, score]
      );

      res.status(201).json({ id: insertId });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/tracks/:id/scores – leaderboard top 20
// ---------------------------------------------------------------------------

router.get(
  '/:id/scores',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const [rows] = await pool.execute(
        `SELECT s.id, s.score, s.accuracy, s.max_combo,
                s.perfect_count, s.good_count, s.miss_count, s.created_at,
                u.username
         FROM scores s
         LEFT JOIN users u ON u.id = s.user_id
         WHERE s.track_id = ?
         ORDER BY s.score DESC
         LIMIT 20`,
        [req.params.id]
      );
      res.json(rows);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/tracks/:id/my-scores – current user's scores for this track
// ---------------------------------------------------------------------------

router.get(
  '/:id/my-scores',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const [rows] = await pool.execute(
        `SELECT s.id, s.score, s.accuracy, s.max_combo,
                s.perfect_count, s.good_count, s.miss_count, s.created_at
         FROM scores s
         WHERE s.track_id = ? AND s.user_id = ?
         ORDER BY s.score DESC`,
        [req.params.id, userId]
      );
      res.json(rows);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/tracks/user/progress – all tracks with user's progress
// ---------------------------------------------------------------------------

router.get(
  '/user/progress',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const [rows] = await pool.execute(
        `SELECT t.id, t.title, t.artist, t.bpm, t.difficulty,
                up.best_score, up.play_count
         FROM tracks t
         LEFT JOIN user_progress up ON up.track_id = t.id AND up.user_id = ?
         ORDER BY t.created_at DESC`,
        [userId]
      );
      res.json(rows);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
