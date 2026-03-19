/**
 * AI-powered beat analyzer service.
 *
 * Uses Google Gemini 2.0 to analyze onset patterns and identify which
 * onsets fall on the beat grid. Corrects timing to align with musical beats.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { OnsetEvent } from '../../../shared/types/midi';
import { quantiseNoteTime } from './midiGenerator';

const MAX_ONSETS_FOR_PROMPT = 150;

export interface AnalyzedOnset {
  originalTime: number;
  correctedTime: number;
  isOnBeat: boolean;
  beatNumber?: number;
  strength: number;
}

/**
 * Downsample onsets to stay within token limits while preserving pattern.
 */
function downsampleOnsets(onsets: OnsetEvent[], maxCount: number): OnsetEvent[] {
  if (onsets.length <= maxCount) return onsets;
  const step = onsets.length / maxCount;
  const sampled: OnsetEvent[] = [];
  for (let i = 0; i < maxCount; i++) {
    sampled.push(onsets[Math.floor(i * step)]);
  }
  return sampled;
}

/**
 * Fallback: Simple quantization to beat grid when AI is unavailable.
 */
export function quantizeToBeatGrid(
  onsets: OnsetEvent[],
  bpm: number
): AnalyzedOnset[] {
  const beatDurationMs = 60_000 / bpm;
  const threshold = beatDurationMs * 0.3; // Within 30% of beat = on-beat

  return onsets.map((onset) => {
    const timeMs = onset.time * 1000;
    const beatPosition = timeMs / beatDurationMs;
    const nearestBeat = Math.round(beatPosition);
    const distanceToBeat = Math.abs(beatPosition - nearestBeat);
    const isOnBeat = distanceToBeat * beatDurationMs < threshold;

    return {
      originalTime: timeMs,
      correctedTime: isOnBeat
        ? nearestBeat * beatDurationMs
        : quantiseNoteTime(timeMs, bpm, 4),
      isOnBeat,
      beatNumber: isOnBeat ? ((nearestBeat % 4) + 1) : undefined,
      strength: onset.strength,
    };
  });
}

/**
 * Use Gemini 2.0 to analyze onset patterns and identify on-beat notes.
 * Falls back to quantization if AI fails.
 */
export async function analyzeBeatPattern(
  onsets: OnsetEvent[],
  bpm: number
): Promise<AnalyzedOnset[]> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn('[beatAnalyzer] GEMINI_API_KEY not set — using fallback quantization');
    return quantizeToBeatGrid(onsets, bpm);
  }

  // Skip AI for very few onsets
  if (onsets.length < 4) {
    return quantizeToBeatGrid(onsets, bpm);
  }

  try {
    const sampledOnsets = downsampleOnsets(onsets, MAX_ONSETS_FOR_PROMPT);
    const beatDurationMs = 60_000 / bpm;

    const prompt = `You are a rhythm analysis assistant for a rhythm game.

I detected energy transients in an audio track. Your task is to identify which transients represent the MAIN BEATS (quarter notes) that a player should hit.

Track info:
- BPM: ${bpm}
- Beat duration: ${beatDurationMs.toFixed(1)}ms
- Beat grid: 0, ${beatDurationMs.toFixed(0)}, ${(beatDurationMs * 2).toFixed(0)}, ${(beatDurationMs * 3).toFixed(0)}, ... ms

Onset data (time in ms from start, strength 0-1):
${JSON.stringify(
  sampledOnsets.map((o) => ({
    time: Math.round(o.time * 1000),
    strength: Math.round(o.strength * 100) / 100,
  })),
  null,
  1
)}

Task:
1. Identify which onsets fall ON the beat grid (within ~50ms of a quarter note)
2. Snap those on-beat onsets to the nearest quarter note position
3. Mark off-beat onsets but still quantize them to 16th notes

Focus on CONSISTENT rhythmic patterns. Kick drums and snares are usually on beats. Hi-hats are often off-beats.

Return ONLY a JSON array. No explanation, no markdown:
[
  {"originalTime": 510, "correctedTime": 500, "isOnBeat": true, "beatNumber": 1},
  {"originalTime": 980, "correctedTime": 1000, "isOnBeat": true, "beatNumber": 2},
  {"originalTime": 650, "correctedTime": 625, "isOnBeat": false}
]`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const GEMINI_TIMEOUT_MS = 15_000;

    const response = await Promise.race([
      model.generateContent(prompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini timeout')), GEMINI_TIMEOUT_MS)
      ),
    ]);

    const text = response.response.text().trim();

    // Extract JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error(`Unexpected Gemini response format: ${text.slice(0, 200)}`);
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      originalTime: number;
      correctedTime: number;
      isOnBeat: boolean;
      beatNumber?: number;
    }>;

    // Map back to full AnalyzedOnset with strength
    const onsetMap = new Map(onsets.map((o) => [Math.round(o.time * 1000), o.strength]));

    const result: AnalyzedOnset[] = parsed.map((item) => ({
      originalTime: item.originalTime,
      correctedTime: item.correctedTime,
      isOnBeat: item.isOnBeat,
      beatNumber: item.beatNumber,
      strength: onsetMap.get(item.originalTime) ?? 0.5,
    }));

    console.log(`[beatAnalyzer] Gemini analyzed ${result.length} onsets, ${result.filter((r) => r.isOnBeat).length} on-beat`);
    return result;
  } catch (err) {
    console.error('[beatAnalyzer] Gemini failed, using fallback:', err);
    return quantizeToBeatGrid(onsets, bpm);
  }
}
