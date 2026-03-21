/**
 * Educational game types for RhythmSense EDU
 */

export type NoteValueType = 
  | 'whole' 
  | 'half' 
  | 'quarter' 
  | 'eighth' 
  | 'sixteenth' 
  | 'triplet' 
  | 'sextuplet';

export interface NoteValue {
  type: NoteValueType;
  name: string;
  duration: number;      // In beats (4, 2, 1, 0.5, 0.25, etc.)
  color: string;         // Hex color code
  bgColor: string;       // Background color for UI
  symbol: string;        // Unicode music symbol or icon reference
  splits: number;        // How many sections in circle (1, 2, 4, etc.)
  description: string;
}

export interface EduGameMode {
  id: number;
  slug: string;
  name: string;
  description: string;
  category: 'basics' | 'intermediate' | 'advanced';
  icon: string;
  totalLevels: number;
}

export interface EduLevel {
  id: number;
  gameModeId: number;
  levelNumber: number;
  name: string;
  description: string;
  noteValues: NoteValueType[];
  pattern: NoteValueType[];
  bpm: number;
  toleranceMs: number;
  targetScore: number;
}

export interface EduProgress {
  id: number;
  userId: number;
  gameModeId: number;
  gameMode?: EduGameMode;
  currentLevel: number;
  bestScore: number;
  totalPlayTime: number;
  completedLevels: number[];
  lastPlayed: string;
}

export interface EduGameState {
  currentLevel: number;
  score: number;
  combo: number;
  maxCombo: number;
  notesHit: number;
  notesMissed: number;
  perfectCount: number;
  goodCount: number;
  missCount: number;
  isPlaying: boolean;
  isPaused: boolean;
  currentNoteIndex: number;
}

export type EduGamePhase = 
  | 'menu'
  | 'countdown'
  | 'playing'
  | 'paused'
  | 'levelComplete'
  | 'gameOver';

// Note value definitions (matching the chart)
export const NOTE_VALUES: Record<NoteValueType, NoteValue> = {
  whole: {
    type: 'whole',
    name: 'Whole Note',
    duration: 4,
    color: '#FFD700',
    bgColor: 'rgba(255, 215, 0, 0.15)',
    symbol: '𝅝',
    splits: 1,
    description: '4 beats - holds for a full measure in 4/4 time',
  },
  half: {
    type: 'half',
    name: 'Half Note',
    duration: 2,
    color: '#4CAF50',
    bgColor: 'rgba(76, 175, 80, 0.15)',
    symbol: '𝅗𝅥',
    splits: 2,
    description: '2 beats - half the duration of a whole note',
  },
  quarter: {
    type: 'quarter',
    name: 'Quarter Note',
    duration: 1,
    color: '#81D4FA',
    bgColor: 'rgba(129, 212, 250, 0.15)',
    symbol: '𝅘𝅥',
    splits: 4,
    description: '1 beat - the basic pulse of most music',
  },
  eighth: {
    type: 'eighth',
    name: 'Eighth Note',
    duration: 0.5,
    color: '#FF7043',
    bgColor: 'rgba(255, 112, 67, 0.15)',
    symbol: '𝅘𝅥𝅮',
    splits: 8,
    description: '1/2 beat - two fit in one quarter note',
  },
  sixteenth: {
    type: 'sixteenth',
    name: 'Sixteenth Note',
    duration: 0.25,
    color: '#3F51B5',
    bgColor: 'rgba(63, 81, 181, 0.15)',
    symbol: '𝅘𝅥𝅯',
    splits: 16,
    description: '1/4 beat - four fit in one quarter note',
  },
  triplet: {
    type: 'triplet',
    name: 'Triplet',
    duration: 0.333,
    color: '#F48FB1',
    bgColor: 'rgba(244, 143, 177, 0.15)',
    symbol: '𝅘𝅥3',
    splits: 3,
    description: '3 notes in the space of 2 - divides the beat into 3',
  },
  sextuplet: {
    type: 'sextuplet',
    name: 'Sextuplet',
    duration: 0.167,
    color: '#C5E1A5',
    bgColor: 'rgba(197, 225, 165, 0.15)',
    symbol: '𝅘𝅥6',
    splits: 6,
    description: '6 notes in the space of 4 - double the speed of triplets',
  },
};

// Level definitions for Fill the Circle mode
export const FILL_CIRCLE_LEVELS: Omit<EduLevel, 'id' | 'gameModeId'>[] = [
  {
    levelNumber: 1,
    name: 'Whole Notes',
    description: 'Tap when the yellow circle is completely full',
    noteValues: ['whole'],
    pattern: ['whole', 'whole', 'whole', 'whole'],
    bpm: 60,
    toleranceMs: 150,
    targetScore: 400,
  },
  {
    levelNumber: 2,
    name: 'Half Notes',
    description: 'Tap when the green circle is half full',
    noteValues: ['half'],
    pattern: ['half', 'half', 'half', 'half', 'half', 'half', 'half', 'half'],
    bpm: 60,
    toleranceMs: 120,
    targetScore: 800,
  },
  {
    levelNumber: 3,
    name: 'Quarter Notes',
    description: 'Tap on every beat with the blue circle',
    noteValues: ['quarter'],
    pattern: ['quarter', 'quarter', 'quarter', 'quarter', 'quarter', 'quarter', 'quarter', 'quarter', 'quarter', 'quarter', 'quarter', 'quarter', 'quarter', 'quarter', 'quarter', 'quarter'],
    bpm: 80,
    toleranceMs: 100,
    targetScore: 1600,
  },
  {
    levelNumber: 4,
    name: 'Mixed Basics',
    description: 'Whole and half notes together',
    noteValues: ['whole', 'half'],
    pattern: ['half', 'half', 'whole', 'half', 'half'],
    bpm: 70,
    toleranceMs: 100,
    targetScore: 500,
  },
  {
    levelNumber: 5,
    name: 'Quarter Mix',
    description: 'Quarter and half notes',
    noteValues: ['quarter', 'half'],
    pattern: ['quarter', 'quarter', 'half', 'quarter', 'quarter', 'half'],
    bpm: 80,
    toleranceMs: 90,
    targetScore: 600,
  },
  {
    levelNumber: 6,
    name: 'Eighth Notes Intro',
    description: 'Faster! Tap twice per beat',
    noteValues: ['eighth'],
    pattern: ['eighth', 'eighth', 'eighth', 'eighth', 'eighth', 'eighth', 'eighth', 'eighth', 'eighth', 'eighth', 'eighth', 'eighth', 'eighth', 'eighth', 'eighth', 'eighth'],
    bpm: 70,
    toleranceMs: 80,
    targetScore: 1600,
  },
  {
    levelNumber: 7,
    name: 'Mixed Durations',
    description: 'Combine all basic note values',
    noteValues: ['whole', 'half', 'quarter', 'eighth'],
    pattern: ['quarter', 'eighth', 'eighth', 'quarter', 'half', 'quarter', 'quarter', 'whole'],
    bpm: 80,
    toleranceMs: 80,
    targetScore: 800,
  },
  {
    levelNumber: 8,
    name: 'Sixteenth Challenge',
    description: 'Very fast! Four taps per beat',
    noteValues: ['sixteenth'],
    pattern: ['sixteenth', 'sixteenth', 'sixteenth', 'sixteenth', 'sixteenth', 'sixteenth', 'sixteenth', 'sixteenth', 'sixteenth', 'sixteenth', 'sixteenth', 'sixteenth', 'sixteenth', 'sixteenth', 'sixteenth', 'sixteenth'],
    bpm: 60,
    toleranceMs: 60,
    targetScore: 1600,
  },
  {
    levelNumber: 9,
    name: 'Full Mix',
    description: 'All note values combined',
    noteValues: ['whole', 'half', 'quarter', 'eighth', 'sixteenth'],
    pattern: ['quarter', 'eighth', 'sixteenth', 'sixteenth', 'eighth', 'quarter', 'half', 'quarter', 'quarter', 'whole'],
    bpm: 80,
    toleranceMs: 70,
    targetScore: 1000,
  },
  {
    levelNumber: 10,
    name: 'Triplet Intro',
    description: 'Divide the beat into 3 equal parts',
    noteValues: ['triplet'],
    pattern: ['triplet', 'triplet', 'triplet', 'triplet', 'triplet', 'triplet', 'triplet', 'triplet', 'triplet', 'triplet', 'triplet', 'triplet'],
    bpm: 70,
    toleranceMs: 70,
    targetScore: 1200,
  },
];
