/**
 * Shared TypeScript interfaces for MIDI data structures used by both
 * client and server.
 */

/** A single note event in the MIDI timeline */
export interface MidiNote {
  /** Unique identifier for the note */
  id: string;
  /** Time in milliseconds from track start */
  time: number;
  /** MIDI pitch value 0–127 */
  pitch: number;
  /** Duration in milliseconds */
  duration: number;
  /** Velocity 0–127 */
  velocity: number;
  /** Which lane/track column this note belongs to (0-indexed) */
  lane: number;
}

/** A complete MIDI track structure */
export interface MidiTrack {
  /** Track metadata */
  id: string;
  title: string;
  artist?: string;
  /** Beats per minute */
  bpm: number;
  /** Total duration in seconds */
  duration: number;
  /** All note events */
  notes: MidiNote[];
  /** Time signature numerator */
  timeSignatureNumerator: number;
  /** Time signature denominator */
  timeSignatureDenominator: number;
  /** AI-selected best section start in seconds */
  sectionStart?: number;
  /** AI-selected best section end in seconds */
  sectionEnd?: number;
}

/** Raw onset detection result from audio analysis */
export interface OnsetEvent {
  /** Time in seconds from track start */
  time: number;
  /** Strength of the onset 0.0–1.0 */
  strength: number;
  /** Detected pitch (Hz), if available */
  pitch?: number;
}

/** Waveform peak data for visualization */
export interface WaveformData {
  /** Sampled amplitude values normalized –1.0 to 1.0 */
  peaks: number[];
  /** Sample rate used when generating peaks */
  sampleRate: number;
  /** Number of channels */
  channels: number;
}

/** Difficulty level for a track */
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

/** Score rating for a single hit */
export type HitRating = 'PERFECT' | 'GOOD' | 'MISS';

/** Score result for a single note hit */
export interface HitScore {
  rating: HitRating;
  points: number;
  /** 1.0 = perfect, 0.5 = good, 0 = miss */
  accuracy: number;
}

/** Persisted track record as stored in and returned from the database */
export interface TrackRecord {
  id: string;  // UUID
  title: string;
  artist?: string;
  bpm?: number;
  duration?: number;
  sectionStart?: number;
  sectionEnd?: number;
  originalFilePath?: string;
  processedFilePath?: string;
  midiData?: MidiTrack;
  waveformData?: WaveformData;
  difficulty: Difficulty;
  minNoteGapMs?: number;
  maxNotesPerSecond?: number;
  onsetThreshold?: number;
  createdAt: string;
}

/** Persisted score record */
export interface ScoreRecord {
  id: number;
  userId?: number;
  trackId: string;  // UUID
  score: number;
  accuracy: number;
  maxCombo: number;
  perfectCount: number;
  goodCount: number;
  missCount: number;
  createdAt: string;
}

/** Persisted user record */
export interface UserRecord {
  id: number;
  username: string;
  email: string;
  createdAt: string;
}

/** User progress per track */
export interface UserProgress {
  id: number;
  userId: number;
  trackId: string;  // UUID
  bestScore: number;
  playCount: number;
}
