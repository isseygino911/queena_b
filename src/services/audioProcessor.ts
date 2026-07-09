/**
 * Audio processing service.
 *
 * Responsibilities:
 *  - Convert any audio format to 16 kHz mono WAV using FFmpeg
 *  - Perform simple energy-based onset detection
 *  - Estimate BPM from inter-onset intervals
 */

import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { OnsetEvent, WaveformData } from '../types/midi';

/** Output sample rate for processed audio */
const TARGET_SAMPLE_RATE = 16_000;

/** Frame size used for energy-based onset detection (samples) */
const FRAME_SIZE = 512;

/** Hop size between frames (samples) */
const HOP_SIZE = 256;

/** Energy threshold multiplier above mean to consider as onset */
const ONSET_THRESHOLD_MULTIPLIER = 1.5;

/**
 * Convert an audio file to 16 kHz mono WAV.
 *
 * @param inputPath  - Absolute path to the source audio file
 * @param outputDir  - Directory where the output WAV will be written
 * @returns Absolute path to the processed WAV file
 */
export async function convertToWav(
  inputPath: string,
  outputDir: string
): Promise<string> {
  const basename = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(outputDir, `${basename}_processed.wav`);

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioFrequency(TARGET_SAMPLE_RATE)
      .audioChannels(1)
      .audioCodec('pcm_s16le')
      .format('wav')
      .on('end', () => {
        console.log(`[audioProcessor] Converted: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err: Error) => {
        console.error('[audioProcessor] FFmpeg error:', err.message);
        reject(err);
      })
      .save(outputPath);
  });
}

/**
 * Read raw PCM samples from a 16-bit mono WAV file.
 * Skips the 44-byte standard WAV header.
 *
 * @param wavPath - Absolute path to the 16 kHz mono WAV file
 * @returns Float32Array of normalised samples in [-1, 1]
 */
function readWavSamples(wavPath: string): Float32Array {
  const buf = fs.readFileSync(wavPath);
  // Standard WAV header is 44 bytes; samples start after that
  const headerSize = 44;
  const sampleCount = Math.floor((buf.length - headerSize) / 2);
  const samples = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const int16 = buf.readInt16LE(headerSize + i * 2);
    samples[i] = int16 / 32768.0;
  }
  return samples;
}

/**
 * Simple energy-based onset detection.
 *
 * @param samples    - Float32Array of audio samples
 * @param sampleRate - Sample rate of the audio
 * @returns Array of OnsetEvent objects
 */
export function detectOnsets(
  samples: Float32Array,
  sampleRate: number = TARGET_SAMPLE_RATE
): OnsetEvent[] {
  const onsets: OnsetEvent[] = [];
  const energies: number[] = [];

  // Compute frame energies
  for (let i = 0; i + FRAME_SIZE < samples.length; i += HOP_SIZE) {
    let energy = 0;
    for (let j = 0; j < FRAME_SIZE; j++) {
      energy += samples[i + j] ** 2;
    }
    energies.push(energy / FRAME_SIZE);
  }

  if (energies.length === 0) return onsets;

  const meanEnergy =
    energies.reduce((a, b) => a + b, 0) / energies.length;
  const threshold = meanEnergy * ONSET_THRESHOLD_MULTIPLIER;

  let lastOnsetFrame = -10; // minimum distance between onsets (frames)

  for (let i = 1; i < energies.length - 1; i++) {
    const prev = energies[i - 1];
    const curr = energies[i];
    const next = energies[i + 1];

    // Local maximum above threshold
    if (curr > threshold && curr > prev && curr >= next) {
      // Enforce minimum distance between onsets (100 ms)
      const minFrameDistance = Math.floor(
        (0.1 * sampleRate) / HOP_SIZE
      );
      if (i - lastOnsetFrame >= minFrameDistance) {
        const timeSeconds = (i * HOP_SIZE) / sampleRate;
        const strength = Math.min(1.0, curr / (meanEnergy * 5));
        onsets.push({ time: timeSeconds, strength });
        lastOnsetFrame = i;
      }
    }
  }

  return onsets;
}

/**
 * Estimate BPM from a list of onset events using inter-onset interval
 * median.
 *
 * @param onsets - Detected onset events
 * @returns Estimated BPM, or 120 as a default fallback
 */
export function estimateBpm(onsets: OnsetEvent[]): number {
  if (onsets.length < 2) return 120;

  const intervals: number[] = [];
  for (let i = 1; i < onsets.length; i++) {
    const interval = onsets[i].time - onsets[i - 1].time;
    if (interval > 0.1 && interval < 2.0) {
      intervals.push(interval);
    }
  }

  if (intervals.length === 0) return 120;

  intervals.sort((a, b) => a - b);
  const medianInterval = intervals[Math.floor(intervals.length / 2)];
  const bpm = 60 / medianInterval;

  // Clamp to reasonable range and round
  return Math.round(Math.max(60, Math.min(240, bpm)));
}

/**
 * Generate waveform peak data for client-side rendering.
 *
 * @param samples    - Float32Array of audio samples
 * @param numPeaks   - How many peak values to generate
 * @returns WaveformData object
 */
export function generateWaveformData(
  samples: Float32Array,
  numPeaks: number = 1000
): WaveformData {
  const chunkSize = Math.floor(samples.length / numPeaks);
  const peaks: number[] = [];

  for (let i = 0; i < numPeaks; i++) {
    let max = 0;
    const start = i * chunkSize;
    for (let j = 0; j < chunkSize && start + j < samples.length; j++) {
      const abs = Math.abs(samples[start + j]);
      if (abs > max) max = abs;
    }
    peaks.push(Number(max.toFixed(4)));
  }

  return { peaks, sampleRate: TARGET_SAMPLE_RATE, channels: 1 };
}

/**
 * Full processing pipeline: convert audio, detect onsets, estimate BPM,
 * generate waveform peaks.
 *
 * @param inputPath - Absolute path to the uploaded audio file
 * @param outputDir - Directory for processed output
 */
export async function processAudioFile(
  inputPath: string,
  outputDir: string
): Promise<{
  processedPath: string;
  onsets: OnsetEvent[];
  bpm: number;
  duration: number;
  waveformData: WaveformData;
}> {
  const processedPath = await convertToWav(inputPath, outputDir);

  const samples = readWavSamples(processedPath);
  const duration = samples.length / TARGET_SAMPLE_RATE;
  const onsets = detectOnsets(samples);
  const bpm = estimateBpm(onsets);
  const waveformData = generateWaveformData(samples);

  return { processedPath, onsets, bpm, duration, waveformData };
}
