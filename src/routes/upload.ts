/**
 * POST /api/upload
 *
 * Accepts a multipart/form-data upload containing an audio file plus
 * optional metadata fields (title, artist, difficulty).
 *
 * Pipeline:
 *  1. Multer stores file in memory
 *  2. FFmpeg converts it to 16 kHz mono WAV
 *  3. Onset detection + BPM estimation
 *  4. Original and processed files uploaded to S3
 *  5. MIDI track is generated and persisted to MySQL with S3 URLs
 */

import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { processAudioFile } from '../services/audioProcessor';
import { buildMidiTrack, deduplicateNotes } from '../services/midiGenerator';
import { selectBestSection } from '../services/sectionSelector';
import pool from '../db/database';
import { Difficulty } from '../../../shared/types/midi';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { uploadToS3, generateS3Key } from '../config/s3';

const router = express.Router();

// ---------------------------------------------------------------------------
// Storage configuration - Memory storage for S3 upload
// ---------------------------------------------------------------------------

const PROCESSED_DIR = path.join(os.tmpdir(), 'rhythmsense-processed');
fs.mkdirSync(PROCESSED_DIR, { recursive: true });

const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/flac',
  'audio/x-flac',
]);

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * POST /api/upload
 * Fields: file (required), title (required), artist (optional),
 *         difficulty (optional, defaults to 'medium')
 */
router.post(
  '/',
  authMiddleware,
  adminMiddleware,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let tempOriginalPath: string | null = null;
    let tempProcessedPath: string | null = null;
    
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No audio file provided' });
        return;
      }

      const title: string = (req.body.title as string)?.trim() || 'Untitled';
      const artist: string | undefined =
        (req.body.artist as string)?.trim() || undefined;
      const difficulty: Difficulty =
        (['easy', 'medium', 'hard', 'expert'] as Difficulty[]).includes(
          req.body.difficulty as Difficulty
        )
          ? (req.body.difficulty as Difficulty)
          : 'medium';

      // Generate track ID early for S3 paths
      const trackId = uuidv4();

      // Save original file temporarily for processing
      tempOriginalPath = path.join(os.tmpdir(), `${trackId}_original`);
      fs.writeFileSync(tempOriginalPath, req.file.buffer);

      // Process audio (convert + analyse)
      const { processedPath, onsets, bpm, duration, waveformData } =
        await processAudioFile(tempOriginalPath, PROCESSED_DIR);
      tempProcessedPath = processedPath;

      // Select best ~20s section via Gemini AI (falls back to heuristic)
      const { sectionStart, sectionEnd } = await selectBestSection(onsets, duration);

      // Build MIDI track
      const midiTrack = buildMidiTrack(title, artist, onsets, bpm, duration, sectionStart, sectionEnd);
      midiTrack.notes = deduplicateNotes(midiTrack.notes);

      // Upload original file to S3
      const originalS3Key = generateS3Key(trackId, req.file.originalname, 'original');
      const originalS3Url = await uploadToS3(
        originalS3Key,
        req.file.buffer,
        req.file.mimetype || 'audio/mpeg'
      );

      // Upload processed file to S3
      const processedBuffer = fs.readFileSync(processedPath);
      const processedFilename = path.basename(processedPath);
      const processedS3Key = generateS3Key(trackId, processedFilename, 'processed');
      const processedS3Url = await uploadToS3(
        processedS3Key,
        processedBuffer,
        'audio/wav'
      );

      // Persist to DB with S3 URLs
      await pool.execute(
        `INSERT INTO tracks
           (id, title, artist, bpm, duration, section_start, section_end,
            original_file_path, processed_file_path, midi_data, waveform_data, difficulty)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          trackId,
          title,
          artist ?? null,
          bpm,
          duration,
          sectionStart,
          sectionEnd,
          originalS3Url,
          processedS3Url,
          JSON.stringify(midiTrack),
          JSON.stringify(waveformData),
          difficulty,
        ]
      );

      // Cleanup temp files
      try {
        if (tempOriginalPath) fs.unlinkSync(tempOriginalPath);
        if (tempProcessedPath) fs.unlinkSync(tempProcessedPath);
      } catch {
        // Ignore cleanup errors
      }

      res.status(201).json({
        id: trackId,
        title,
        artist,
        bpm,
        duration,
        sectionStart,
        sectionEnd,
        difficulty,
        originalUrl: originalS3Url,
        processedUrl: processedS3Url,
        midiData: midiTrack,
        waveformData,
      });
    } catch (err) {
      // Cleanup temp files on error
      try {
        if (tempOriginalPath) fs.unlinkSync(tempOriginalPath);
        if (tempProcessedPath) fs.unlinkSync(tempProcessedPath);
      } catch {
        // Ignore cleanup errors
      }
      next(err);
    }
  }
);

export default router;
