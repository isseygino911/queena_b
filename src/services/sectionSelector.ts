/**
 * AI-powered section selector service.
 *
 * Uses Google Gemini to analyze onset/energy data and identify the most
 * enjoyable ~20-second section of a track (chorus-like, high energy).
 * Falls back to a pure sliding-window heuristic if the API call fails.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { OnsetEvent } from '../../../shared/types/midi';

const MAX_ONSETS_FOR_PROMPT = 200;
const TARGET_SECTION_DURATION = 20;

/**
 * Downsample onsets to at most maxCount entries to stay within token limits.
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
 * Fallback: sliding-window energy scoring to pick the best 20s section.
 * Skips the first and last 10% of the track.
 */
function slidingWindowFallback(
  onsets: OnsetEvent[],
  duration: number
): { sectionStart: number; sectionEnd: number } {
  const margin = duration * 0.1;
  const windowSize = TARGET_SECTION_DURATION;
  const step = 0.5;

  let bestScore = -1;
  let bestStart = margin;

  for (let start = margin; start + windowSize <= duration - margin; start += step) {
    const end = start + windowSize;
    const windowOnsets = onsets.filter((o) => o.time >= start && o.time < end);
    const count = windowOnsets.length;
    const score = windowOnsets.reduce(
      (sum, o) => sum + o.strength * (1 + 0.1 * count),
      0
    );
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }

  return {
    sectionStart: Math.round(bestStart * 10) / 10,
    sectionEnd: Math.round((bestStart + windowSize) * 10) / 10,
  };
}

/**
 * Select the best ~20s section of a track using Gemini AI.
 * Falls back to sliding-window heuristic on any failure.
 */
export async function selectBestSection(
  onsets: OnsetEvent[],
  duration: number
): Promise<{ sectionStart: number; sectionEnd: number }> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV !== 'production') console.warn('[section] GEMINI_API_KEY not set — using fallback heuristic');
    const result = slidingWindowFallback(onsets, duration);
    if (process.env.NODE_ENV !== 'production') console.log(`[section] Fallback selected: ${result.sectionStart}s – ${result.sectionEnd}s`);
    return result;
  }

  try {
    const sampledOnsets = downsampleOnsets(onsets, MAX_ONSETS_FOR_PROMPT);

    const prompt = `You are a music structure analyst. I will give you onset detection data from an audio track.
Each onset has a time (seconds) and strength (0.0–1.0, higher = more energetic hit).
Track duration: ${duration} seconds.

Onset data (JSON array):
${JSON.stringify(sampledOnsets)}

Task: Identify the single most enjoyable ~20-second section of this track to use as a rhythm game level.
Rules:
- The section should be the most rhythmically dense and energetic part (like a chorus).
- Avoid the first 10% and last 10% of the track (likely intro/outro).
- Target length: 18–22 seconds.
- Return ONLY valid JSON in this exact format, no explanation:
{"sectionStart": <number>, "sectionEnd": <number>}`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const GEMINI_TIMEOUT_MS = 10_000;

    const response = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Gemini timeout')), GEMINI_TIMEOUT_MS)
      ),
    ]) as Awaited<ReturnType<typeof model.generateContent>>;
    const text = response.response.text().trim();

    // Extract JSON from response (may have markdown code fences)
    const jsonMatch = text.match(/\{[\s\S]*"sectionStart"[\s\S]*"sectionEnd"[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`Unexpected Gemini response format: ${text.slice(0, 200)}`);
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      sectionStart: unknown;
      sectionEnd: unknown;
    };

    const sectionStart = Number(parsed.sectionStart);
    const sectionEnd = Number(parsed.sectionEnd);

    if (!isFinite(sectionStart) || !isFinite(sectionEnd) || sectionEnd <= sectionStart) {
      throw new Error(`Invalid section values: ${sectionStart} – ${sectionEnd}`);
    }

    if (process.env.NODE_ENV !== 'production') console.log(`[section] Gemini selected: ${sectionStart}s – ${sectionEnd}s`);
    return { sectionStart, sectionEnd };
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[section] Gemini failed, using fallback heuristic:', err);
    const result = slidingWindowFallback(onsets, duration);
    if (process.env.NODE_ENV !== 'production') console.log(`[section] Fallback selected: ${result.sectionStart}s – ${result.sectionEnd}s`);
    return result;
  }
}
