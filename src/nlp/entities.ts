/**
 * @file entities.ts
 * @description Named entity extraction from user messages.
 * Extracts PO numbers, SKU codes, date ranges, currency amounts, and rep names.
 */

import { sanitiseInput } from '../utils/formatter';

/** Date range with concrete from/to boundaries */
export interface DateRange {
  from: Date;
  to: Date;
  label?: string;
}

/** All extractable entity types */
export interface Entities {
  poNumber?: string;
  skuCode?: string;
  dateRange?: DateRange;
  repName?: string;
  amount?: number;
  language?: 'en' | 'he';
}

// Entity extraction patterns
const PO_PATTERN = /\bPO-(\d{8})\b/gi;
const SKU_PATTERN = /\bSKU-(\d{4,6})\b/gi;
const AMOUNT_PATTERN_USD = /\$\s?([\d,]+(?:\.\d{2})?)/g;
const AMOUNT_PATTERN_K = /\b(\d+(?:\.\d+)?)[Kk]\b/g;
const LANG_PATTERN = /\/lang\s+(en|he)/i;

/** Date expressions mapped to date-range resolver functions */
type DateResolver = () => DateRange;

const DATE_EXPRESSIONS: Array<{ patterns: RegExp[]; resolver: DateResolver }> = [
  {
    patterns: [/\bthis month\b/i, /\bהחודש\b/],
    resolver: () => {
      const now = new Date();
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
        label: 'this month',
      };
    },
  },
  {
    patterns: [/\blast month\b/i, /\bחודש שעבר\b/],
    resolver: () => {
      const now = new Date();
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: new Date(now.getFullYear(), now.getMonth(), 0),
        label: 'last month',
      };
    },
  },
  {
    patterns: [/\bthis year\b/i, /\bהשנה\b/],
    resolver: () => {
      const now = new Date();
      return {
        from: new Date(now.getFullYear(), 0, 1),
        to: new Date(now.getFullYear(), 11, 31),
        label: 'this year',
      };
    },
  },
  {
    patterns: [/\blast 90 days?\b/i, /\b90 ימים\b/],
    resolver: () => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 90);
      return { from, to, label: 'last 90 days' };
    },
  },
  {
    patterns: [/\blast 30 days?\b/i, /\b30 ימים\b/],
    resolver: () => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 30);
      return { from, to, label: 'last 30 days' };
    },
  },
  {
    patterns: [/\bQ1\b/i, /\bרבעון 1\b/, /\bרבעון ראשון\b/],
    resolver: () => {
      const year = new Date().getFullYear();
      return { from: new Date(year, 0, 1), to: new Date(year, 2, 31), label: 'Q1' };
    },
  },
  {
    patterns: [/\bQ2\b/i, /\bרבעון 2\b/, /\bרבעון שני\b/],
    resolver: () => {
      const year = new Date().getFullYear();
      return { from: new Date(year, 3, 1), to: new Date(year, 5, 30), label: 'Q2' };
    },
  },
  {
    patterns: [/\bQ3\b/i, /\bרבעון 3\b/, /\bרבעון שלישי\b/],
    resolver: () => {
      const year = new Date().getFullYear();
      return { from: new Date(year, 6, 1), to: new Date(year, 8, 30), label: 'Q3' };
    },
  },
  {
    patterns: [/\bQ4\b/i, /\bרבעון 4\b/, /\bרבעון רביעי\b/],
    resolver: () => {
      const year = new Date().getFullYear();
      return { from: new Date(year, 9, 1), to: new Date(year, 11, 31), label: 'Q4' };
    },
  },
  {
    patterns: [/\btoday\b/i, /\bהיום\b/],
    resolver: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      return { from, to, label: 'today' };
    },
  },
];

/**
 * Extract a PO number from the message text.
 *
 * @param text - Sanitised user input
 * @returns The first PO number found, e.g. "PO-20250618", or undefined
 */
export function extractPONumber(text: string): string | undefined {
  PO_PATTERN.lastIndex = 0;
  const match = PO_PATTERN.exec(text);
  return match ? `PO-${match[1]}` : undefined;
}

/**
 * Extract a SKU code from the message text.
 *
 * @param text - Sanitised user input
 * @returns The first SKU code found, e.g. "SKU-0042", or undefined
 */
export function extractSKUCode(text: string): string | undefined {
  SKU_PATTERN.lastIndex = 0;
  const match = SKU_PATTERN.exec(text);
  return match ? `SKU-${match[1]}` : undefined;
}

/**
 * Resolve a date range from common temporal expressions in English and Hebrew.
 *
 * @param text - Sanitised user input
 * @returns The matched DateRange, or a default of "this month" if nothing matched
 */
export function extractDateRange(text: string): DateRange | undefined {
  for (const { patterns, resolver } of DATE_EXPRESSIONS) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return resolver();
      }
    }
  }
  return undefined;
}

/**
 * Extract a currency amount from the message text and normalise to a number.
 * Handles "$10,000", "10K", "10k", "$1.5M" patterns.
 *
 * @param text - Sanitised user input
 * @returns The first numeric amount found, or undefined
 */
export function extractAmount(text: string): number | undefined {
  AMOUNT_PATTERN_USD.lastIndex = 0;
  const usdMatch = AMOUNT_PATTERN_USD.exec(text);
  if (usdMatch) {
    return parseFloat(usdMatch[1].replace(/,/g, ''));
  }

  AMOUNT_PATTERN_K.lastIndex = 0;
  const kMatch = AMOUNT_PATTERN_K.exec(text);
  if (kMatch) {
    return parseFloat(kMatch[1]) * 1000;
  }

  return undefined;
}

/**
 * Extract a language switch command from the message.
 *
 * @param text - Raw user input
 * @returns 'en' | 'he' | undefined
 */
export function extractLanguageSwitch(text: string): 'en' | 'he' | undefined {
  const match = LANG_PATTERN.exec(text);
  if (match) {
    const lang = match[1].toLowerCase();
    return lang === 'he' ? 'he' : 'en';
  }
  return undefined;
}

/**
 * Extract all entities from a user message.
 * Sanitises input before applying all extraction patterns.
 *
 * @param rawText - Raw user message text
 * @param knownRepNames - Optional list of known sales rep names for matching
 * @returns Extracted entities object
 */
export function extractEntities(rawText: string, knownRepNames: string[] = []): Entities {
  const safe = sanitiseInput(rawText);

  const entities: Entities = {};

  const po = extractPONumber(safe);
  if (po) entities.poNumber = po;

  const sku = extractSKUCode(safe);
  if (sku) entities.skuCode = sku;

  const range = extractDateRange(safe);
  if (range) entities.dateRange = range;

  const amount = extractAmount(safe);
  if (amount !== undefined) entities.amount = amount;

  const lang = extractLanguageSwitch(rawText);
  if (lang) entities.language = lang;

  // Rep name matching (case-insensitive substring match)
  const lowerSafe = safe.toLowerCase();
  for (const name of knownRepNames) {
    if (lowerSafe.includes(name.toLowerCase())) {
      entities.repName = name;
      break;
    }
  }

  return entities;
}
