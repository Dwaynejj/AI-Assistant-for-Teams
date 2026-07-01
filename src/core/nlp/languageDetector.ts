/**
 * @file languageDetector.ts
 * @description Detect whether an incoming message is Hebrew or English.
 *
 * Detection strategy (in priority order):
 *  1. Command override (/lang en | /lang he)
 *  2. Azure AI Language DetectLanguage API (if configured)
 *  3. Unicode range heuristic (Hebrew characters U+0590–U+05FF, U+FB1D–U+FB4F)
 *  4. Fallback: English
 */

import { TextAnalysisClient, AzureKeyCredential } from '@azure/ai-language-text';
import { getConfig } from '../utils/config';

/** Result from language detection */
export interface LanguageResult {
  language: 'en' | 'he';
  confidence: number;
}

// Hebrew Unicode ranges (Standard + Extended/Supplement)
const HEBREW_RANGE_REGEX = /[\u0590-\u05FF\uFB1D-\uFB4F]/;

/** Minimum fraction of Hebrew characters to classify text as Hebrew */
const HEBREW_CHAR_THRESHOLD = 0.2;

/**
 * Heuristic check for Hebrew characters in text.
 * Returns true if more than 20% of alphanumeric characters are Hebrew Unicode.
 *
 * @param text - The raw input text
 * @returns true if the text is likely Hebrew
 */
export function isLikelyHebrew(text: string): boolean {
  const chars = text.replace(/\s+/g, '');
  if (chars.length === 0) return false;

  let hebrewCount = 0;
  for (const ch of chars) {
    if (HEBREW_RANGE_REGEX.test(ch)) hebrewCount++;
  }
  return hebrewCount / chars.length >= HEBREW_CHAR_THRESHOLD;
}

/**
 * Detect the language of an incoming message.
 *
 * @param text - The raw user message text
 * @returns A LanguageResult with the detected language and confidence score
 */
export async function detectLanguage(text: string): Promise<LanguageResult> {
  const trimmed = text.trim().toLowerCase();

  // Priority 1: Language switch commands
  if (trimmed === '/lang he' || trimmed === '/lang-he') {
    return { language: 'he', confidence: 1.0 };
  }
  if (trimmed === '/lang en' || trimmed === '/lang-en') {
    return { language: 'en', confidence: 1.0 };
  }

  // Priority 2: Azure AI Language API (if configured)
  const config = getConfig();
  if (config.azureLanguageEndpoint && config.azureLanguageKey) {
    try {
      const client = new TextAnalysisClient(
        config.azureLanguageEndpoint,
        new AzureKeyCredential(config.azureLanguageKey),
      );

      const results = await client.analyze('LanguageDetection', [text]);
      const result = results[0];

      if (!result.error && result.primaryLanguage) {
        const langCode = result.primaryLanguage.iso6391Name;
        const confidence = result.primaryLanguage.confidenceScore;

        if (langCode === 'he' && confidence > 0.7) {
          return { language: 'he', confidence };
        }
        if (langCode === 'en' && confidence > 0.7) {
          return { language: 'en', confidence };
        }
        // Low-confidence API result — fall through to heuristic
      }
    } catch {
      // API unavailable — fall through to heuristic
    }
  }

  // Priority 3: Unicode heuristic
  if (isLikelyHebrew(text)) {
    return { language: 'he', confidence: 0.8 };
  }

  // Priority 4: Default to English
  return { language: 'en', confidence: 0.9 };
}
