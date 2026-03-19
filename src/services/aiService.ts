/**
 * Unified AI Service
 *
 * Provides a unified interface for AI-powered music analysis.
 * Routes to the configured AI provider (Gemini or Kimi) based on admin selection.
 */

import { OnsetEvent } from '../../../shared/types/midi';
import { 
  AnalyzedOnset, 
  analyzeBeatPattern as analyzeWithGemini,
  quantizeToBeatGrid 
} from './beatAnalyzer';
import { 
  analyzeBeatPatternWithKimi, 
  selectBestSectionWithKimi,
  isKimiAvailable 
} from './kimiService';

export type AIProvider = 'gemini' | 'kimi';

// In-memory storage for AI provider selection
let currentProvider: AIProvider = 'gemini';

/**
 * Get current AI provider
 */
export function getAIProvider(): AIProvider {
  return currentProvider;
}

/**
 * Set AI provider
 */
export function setAIProvider(provider: AIProvider): void {
  if (!['gemini', 'kimi'].includes(provider)) {
    throw new Error(`Invalid provider: ${provider}. Must be "gemini" or "kimi"`);
  }
  
  // Validate that the provider is available
  if (provider === 'kimi' && !isKimiAvailable()) {
    throw new Error('Kimi API key not configured. Set KIMI_API_KEY environment variable.');
  }
  
  if (provider === 'gemini' && !process.env.GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured. Set GEMINI_API_KEY environment variable.');
  }
  
  currentProvider = provider;
  console.log(`[aiService] AI provider changed to: ${provider}`);
}

/**
 * Get available AI providers
 */
export function getAvailableProviders(): { id: AIProvider; name: string; available: boolean }[] {
  return [
    {
      id: 'gemini',
      name: 'Google Gemini',
      available: !!process.env.GEMINI_API_KEY,
    },
    {
      id: 'kimi',
      name: 'Moonshot Kimi',
      available: isKimiAvailable(),
    },
  ];
}

/**
 * Analyze beat patterns using the configured AI provider.
 * Falls back to algorithmic quantization if AI fails.
 */
export async function analyzeBeatPattern(
  onsets: OnsetEvent[],
  bpm: number
): Promise<AnalyzedOnset[]> {
  // Try the selected provider first
  if (currentProvider === 'kimi' && isKimiAvailable()) {
    try {
      return await analyzeBeatPatternWithKimi(onsets, bpm);
    } catch (err) {
      console.error('[aiService] Kimi analysis failed:', err);
      // Fall through to algorithmic fallback
    }
  } else if (currentProvider === 'gemini' && process.env.GEMINI_API_KEY) {
    try {
      return await analyzeWithGemini(onsets, bpm);
    } catch (err) {
      console.error('[aiService] Gemini analysis failed:', err);
      // Fall through to algorithmic fallback
    }
  }

  // Algorithmic fallback - pure quantization without any AI API call
  console.log('[aiService] Using algorithmic fallback for beat analysis');
  return quantizeToBeatGrid(onsets, bpm);
}

/**
 * Select the best section using the configured AI provider.
 * Falls back to sliding window heuristic if AI fails.
 */
export async function selectBestSection(
  onsets: OnsetEvent[],
  duration: number
): Promise<{ sectionStart: number; sectionEnd: number }> {
  // Import the Gemini section selector (has fallback built-in)
  const { selectBestSection: selectWithGemini } = await import('./sectionSelector');

  // Try the selected provider first
  if (currentProvider === 'kimi' && isKimiAvailable()) {
    try {
      return await selectBestSectionWithKimi(onsets, duration);
    } catch (err) {
      console.error('[aiService] Kimi section selection failed:', err);
      // Fall through to sliding window fallback
    }
  }

  // Use Gemini section selector (has its own fallback)
  return selectWithGemini(onsets, duration);
}
