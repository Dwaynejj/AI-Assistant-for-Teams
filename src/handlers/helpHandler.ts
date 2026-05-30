/**
 * @file helpHandler.ts
 * @description Handle HELP, LANG_SWITCH, and UNKNOWN intents.
 * Returns the bilingual help card or a language-switched confirmation.
 */

import { ParsedIntent } from '../nlp/intentParser';
import { BotResponse } from './salesHandler';
import { buildHelpCard } from '../bot/adaptiveCards';
import enStrings from '../i18n/en.json';
import heStrings from '../i18n/he.json';

/**
 * Handle help and fallback intents.
 *
 * @param intent - The parsed intent with detected language
 * @returns BotResponse with the help card or language-switch confirmation
 */
export function handleHelpIntent(intent: ParsedIntent): BotResponse {
  const lang = intent.detectedLanguage;
  const s = lang === 'he' ? heStrings : enStrings;

  if (intent.intent === 'LANG_SWITCH' && intent.entities.language) {
    const newLang = intent.entities.language;
    return {
      text:
        newLang === 'he' ? heStrings.common.language_switched : enStrings.common.language_switched,
      adaptiveCard: buildHelpCard(newLang),
      language: newLang,
      dataSource: 'BIAgent',
    };
  }

  return {
    adaptiveCard: buildHelpCard(lang),
    text: s.help.title,
    language: lang,
    dataSource: 'BIAgent',
  };
}

/**
 * Build an unknown intent fallback response.
 *
 * @param lang - Language to respond in
 * @returns BotResponse with help card and unknown-command message
 */
export function handleUnknownIntent(lang: 'en' | 'he'): BotResponse {
  const s = lang === 'he' ? heStrings : enStrings;
  return {
    adaptiveCard: buildHelpCard(lang),
    text: s.common.unknown_command,
    language: lang,
    dataSource: 'BIAgent',
  };
}
