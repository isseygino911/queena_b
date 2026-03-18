/**
 * MIDI generation service.
 *
 * Converts raw onset timestamps from audio analysis into a structured
 * MidiTrack JSON that the frontend game engine can consume.
 */

import { v4 as uuidv4 } from 'uuid';
import { MidiNote, MidiTrack, OnsetEvent } from '../../../shared/types/midi';

/** Number of playable lanes (keyboard keys) in the game */
const LANE_COUNT = 6;

/** Default note velocity when none is detected */
const DEFAULT_VELOCITY = 80;

/** Approximate note duration in ms (slightly less than one beat at 120 BPM) */
const DEFAULT_NOTE_DURATION_MS = 100;

/**
 * Spread onsets across lanes in a musically plausible way.
 * Higher-strength onsets are assigned to middle lanes; weak ones to edges.
 *
 * @param strength - Onset strength 0–1
 * @param index    - Index of this onset in the sequence
 * @returns Lane index 0 – (LANE_COUNT - 1)
 */
function assignLane(strength: number, index: number): number {
  // Deterministic but varied assignment based on index and strength
  const base = index % LANE_COUNT;
  if (strength > 0.8) {
    // Strong transients favour middle lanes
    return Math.floor(LANE_COUNT / 2) + (base % 2 === 0 ? 0 : 1);
  }
  return base;
}

/**
 * Assign a MIDI pitch based on lane and onset index.
 * Mapping: lane 0 → C4 (60), lane 1 → D4 (62), … etc.
 */
function assignPitch(lane: number): number {
  const pitchMap: Record<number, number> = {
    0: 60, // C4
    1: 62, // D4
    2: 64, // E4
    3: 65, // F4
    4: 67, // G4
    5: 69, // A4
  };
  return pitchMap[lane] ?? 60;
}

/**
 * Convert onset events to MidiNote array.
 *
 * @param onsets  - Detected onset events (time in seconds)
 * @param bpm     - Estimated BPM
 * @returns       - Array of MidiNote objects
 */
export function onsetsToNotes(
  onsets: OnsetEvent[],
  bpm: number
): MidiNote[] {
  const beatDurationMs = 60_000 / bpm;
  // Duration = half a beat, but at least 80 ms
  const noteDuration = Math.max(80, beatDurationMs * 0.5);

  return onsets.map((onset, idx) => {
    const lane = assignLane(onset.strength, idx);
    return {
      id: uuidv4(),
      time: Math.round(onset.time * 1000), // convert s → ms
      pitch: assignPitch(lane),
      duration: Math.round(noteDuration),
      velocity: Math.round(onset.strength * 127) || DEFAULT_VELOCITY,
      lane,
    };
  });
}

/**
 * Build a complete MidiTrack from processing artefacts.
 *
 * @param title        - Track title
 * @param artist       - Artist name
 * @param onsets       - Raw onset events
 * @param bpm          - Estimated BPM
 * @param duration     - Track duration in seconds
 * @param sectionStart - AI-selected best section start in seconds
 * @param sectionEnd   - AI-selected best section end in seconds
 * @returns A fully populated MidiTrack ready for persistence
 */
export function buildMidiTrack(
  title: string,
  artist: string | undefined,
  onsets: OnsetEvent[],
  bpm: number,
  duration: number,
  sectionStart?: number,
  sectionEnd?: number
): MidiTrack {
  const notes = onsetsToNotes(onsets, bpm);

  return {
    id: uuidv4(),
    title,
    artist,
    bpm,
    duration,
    notes,
    timeSignatureNumerator: 4,
    timeSignatureDenominator: 4,
    ...(sectionStart !== undefined && { sectionStart }),
    ...(sectionEnd !== undefined && { sectionEnd }),
  };
}

/**
 * Quantise a note's time to the nearest subdivision of a beat.
 *
 * @param timeMs         - Original note time in ms
 * @param bpm            - BPM
 * @param subdivisions   - Number of subdivisions per beat (default 4 = 16th notes)
 */
export function quantiseNoteTime(
  timeMs: number,
  bpm: number,
  subdivisions: number = 4
): number {
  const subDurationMs = 60_000 / bpm / subdivisions;
  return Math.round(timeMs / subDurationMs) * subDurationMs;
}

/**
 * Filter out notes that are suspiciously close together (< 50 ms apart in
 * the same lane) to avoid impossible double-hits.
 */
export function deduplicateNotes(notes: MidiNote[]): MidiNote[] {
  const sorted = [...notes].sort((a, b) => a.time - b.time);
  const result: MidiNote[] = [];
  const lastTimestampByLane: Record<number, number> = {};

  for (const note of sorted) {
    const last = lastTimestampByLane[note.lane] ?? -Infinity;
    if (note.time - last >= 50) {
      result.push(note);
      lastTimestampByLane[note.lane] = note.time;
    }
  }
  return result;
}
