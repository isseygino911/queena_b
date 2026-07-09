/**
 * POST /api/upload
 *
 * Accepts a multipart/form-data upload containing an audio file plus
 * optional metadata fields (title, artist, difficulty).
 *
 * Pipeline:
 *  1. Multer saves the raw file to uploads/originals/
 *  2. FFmpeg converts it to 16 kHz mono WAV
 *  3. Onset detection + BPM estimation
 *  4. MIDI track is generated and persisted to MySQL
 */

import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { processAudioFile } from '../services/audioProcessor';
import { buildMidiTrack, deduplicateNotes } from '../services/midiGenerator';
import { selectBestSection } from '../services/sectionSelector';
import pool from '../db/database';
import { Difficulty } from '../types/midi';

const router = express.Router();

// ---------------------------------------------------------------------------
// Storage configuration
// ---------------------------------------------------------------------------

const ORIGINALS_DIR = path.join(__dirname, '..', '..', 'uploads', 'originals');
const PROCESSED_DIR = path.join(__dirname, '..', '..', 'uploads', 'processed');

[ORIGINALS_DIR, PROCESSED_DIR].forEach((dir) => {
  fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ORIGINALS_DIR),
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${timestamp}_${safe}`);
  },
});

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
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

      // Process audio (convert + analyse)
      const { processedPath, onsets, bpm, duration, waveformData } =
        await processAudioFile(req.file.path, PROCESSED_DIR);

      // Select best ~20s section via Gemini AI (falls back to heuristic)
      const { sectionStart, sectionEnd } = await selectBestSection(onsets, duration);

      // Build MIDI track
      const midiTrack = buildMidiTrack(title, artist, onsets, bpm, duration, sectionStart, sectionEnd);
      midiTrack.notes = deduplicateNotes(midiTrack.notes);

      // Persist to DB
      const [result] = await pool.execute(
        `INSERT INTO tracks
           (title, artist, bpm, duration, section_start, section_end,
            original_file_path, processed_file_path, midi_data, waveform_data, difficulty)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          title,
          artist ?? null,
          bpm,
          duration,
          sectionStart,
          sectionEnd,
          req.file.path,
          processedPath,
          JSON.stringify(midiTrack),
          JSON.stringify(waveformData),
          difficulty,
        ]
      );

      const insertId = (result as { insertId: number }).insertId;

      res.status(201).json({
        id: insertId,
        title,
        artist,
        bpm,
        duration,
        sectionStart,
        sectionEnd,
        difficulty,
        midiData: midiTrack,
        waveformData,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
