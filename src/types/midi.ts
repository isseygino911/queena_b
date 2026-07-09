/**
 * Shared MIDI/audio-analysis types used across the audio processing
 * pipeline (onset detection -> MIDI generation -> track persistence).
 */

export interface OnsetEvent {
  /** Onset time in seconds */
  time: number;
  /** Onset strength, 0-1 */
  strength: number;
}

export interface WaveformData {
  /** Normalised peak amplitude values (0-1) */
  peaks: number[];
  sampleRate: number;
  channels: number;
}

export interface MidiNote {
  id: string;
  /** Note start time in milliseconds */
  time: number;
  /** MIDI pitch number */
  pitch: number;
  /** Note duration in milliseconds */
  duration: number;
  /** MIDI velocity, 0-127 */
  velocity: number;
  /** Playable lane index */
  lane: number;
}

export interface MidiTrack {
  id: string;
  title: string;
  artist?: string;
  bpm: number;
  /** Track duration in seconds */
  duration: number;
  notes: MidiNote[];
  timeSignatureNumerator: number;
  timeSignatureDenominator: number;
  /** AI-selected best section start in seconds */
  sectionStart?: number;
  /** AI-selected best section end in seconds */
  sectionEnd?: number;
}

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';
