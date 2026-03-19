/**
 * Kimi AI Service
 *
 * Provides AI-powered music analysis using Moonshot AI's Kimi API.
 * Mirrors the functionality of the Gemini service for beat analysis
 * and section selection.
 */

import { OnsetEvent } from '../../../shared/types/midi';
import { AnalyzedOnset } from './beatAnalyzer';

const MAX_ONSETS_FOR_PROMPT = 150;
const TARGET_SECTION_DURATION = 20;
const KIMI_API_BASE = 'https://api.moonshot.cn/v1';

// Valid Moonshot AI model names
const DEFAULT_MODEL = 'moonshot-v1-8k';
const KIMI_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Get Kimi API key from environment
 */
function getApiKey(): string | undefined {
  return process.env.KIMI_API_KEY;
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
 * Call Kimi API with the given prompt
 */
async function callKimiAPI(
  prompt: string,
  model: string = DEFAULT_MODEL,
  timeoutMs: number = KIMI_TIMEOUT_MS
): Promise<string> {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    throw new Error('KIMI_API_KEY not configured');
  }

  const response = await Promise.race([
    fetch(`${KIMI_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: 'You are a music analysis assistant. Always respond with valid JSON only, no markdown formatting, no explanations.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.2, // Low temperature for consistent structured output
        max_tokens: 2000,
      }),
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Kimi timeout')), timeoutMs)
    ),
  ]);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Kimi API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() || '';
}

/**
 * Analyze onset patterns and identify on-beat notes using Kimi AI.
 * Returns AI-analyzed onsets with corrected timing.
 */
export async function analyzeBeatPatternWithKimi(
  onsets: OnsetEvent[],
  bpm: number,
  model: string = DEFAULT_MODEL
): Promise<AnalyzedOnset[]> {
  // Skip AI for very few onsets
  if (onsets.length < 4) {
    throw new Error('Too few onsets for AI analysis');
  }

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

  const text = await callKimiAPI(prompt, model);

  // Extract JSON array from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error(`Unexpected Kimi response format: ${text.slice(0, 200)}`);
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

  console.log(`[kimiService] Analyzed ${result.length} onsets, ${result.filter((r) => r.isOnBeat).length} on-beat`);
  return result;
}

/**
 * Select the best ~20s section of a track using Kimi AI.
 * Returns start and end times in seconds.
 */
export async function selectBestSectionWithKimi(
  onsets: OnsetEvent[],
  duration: number,
  model: string = DEFAULT_MODEL
): Promise<{ sectionStart: number; sectionEnd: number }> {
  const sampledOnsets = downsampleOnsets(onsets, 200);

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

  const text = await callKimiAPI(prompt, model, 10000);

  // Extract JSON from response (may have markdown code fences)
  const jsonMatch = text.match(/\{[\s\S]*"sectionStart"[\s\S]*"sectionEnd"[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Unexpected Kimi response format: ${text.slice(0, 200)}`);
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

  console.log(`[kimiService] Selected section: ${sectionStart}s – ${sectionEnd}s`);
  return { sectionStart, sectionEnd };
}

/**
 * Check if Kimi API is available (has API key configured)
 */
export function isKimiAvailable(): boolean {
  return !!getApiKey();
}
