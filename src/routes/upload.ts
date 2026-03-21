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
import { buildMidiTrackFromAnalyzedOnsets, setDifficultyParams } from '../services/midiGenerator';
import { analyzeBeatPattern } from '../services/aiService';
import pool from '../db/database';
import { Difficulty } from '../../shared/types/midi';
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

      // Parse difficulty parameters (with defaults)
      const minNoteGapMs = Math.max(50, Math.min(500, parseInt(req.body.minNoteGapMs as string) || 250));
      const maxNotesPerSecond = Math.max(2, Math.min(15, parseInt(req.body.maxNotesPerSecond as string) || 4));
      const onsetThreshold = Math.max(1.0, Math.min(3.0, parseFloat(req.body.onsetThreshold as string) || 2.2));

      // Apply difficulty parameters
      setDifficultyParams(minNoteGapMs, maxNotesPerSecond, onsetThreshold);

      // Generate track ID early for S3 paths
      const trackId = uuidv4();

      // Save original file temporarily for processing
      tempOriginalPath = path.join(os.tmpdir(), `${trackId}_original`);
      fs.writeFileSync(tempOriginalPath, req.file.buffer);

      // Process audio (convert + analyse)
      const { processedPath, onsets, bpm, duration, waveformData } =
        await processAudioFile(tempOriginalPath, PROCESSED_DIR);
      tempProcessedPath = processedPath;

      // Use full track (user manually crops audio before upload)
      const sectionStart = 0;
      const sectionEnd = duration;

      // Analyze beat patterns with AI to align notes to the grid
      const analyzedOnsets = await analyzeBeatPattern(onsets, bpm);

      // Build MIDI track with AI-corrected beat timing
      const midiTrack = buildMidiTrackFromAnalyzedOnsets(
        title,
        artist,
        analyzedOnsets,
        bpm,
        duration
      );

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
            original_file_path, processed_file_path, midi_data, waveform_data, difficulty,
            min_note_gap_ms, max_notes_per_second, onset_threshold)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          trackId,
          title,
          artist ?? null,
          bpm,
          duration,
          0, // sectionStart
          duration, // sectionEnd
          originalS3Url,
          processedS3Url,
          JSON.stringify(midiTrack),
          JSON.stringify(waveformData),
          difficulty,
          minNoteGapMs,
          maxNotesPerSecond,
          onsetThreshold,
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
