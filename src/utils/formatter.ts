/**
 * @file formatter.ts
 * @description Utility functions for formatting numbers, dates, currency values,
 * and status strings for display in Adaptive Cards and plain text responses.
 */

/**
 * Format a number as a currency string.
 *
 * @param amount - Numeric value to format
 * @param currency - Currency code (default: USD)
 * @param language - Display language for locale formatting
 * @returns Formatted currency string (e.g. "$4,820,000")
 */
export function formatCurrency(
  amount: number,
  currency: string = 'USD',
  language: 'en' | 'he' = 'en',
): string {
  const locale = language === 'he' ? 'he-IL' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format a date as a localised string.
 *
 * @param date - The date to format
 * @param language - Display language
 * @returns Formatted date string
 */
export function formatDate(date: Date, language: 'en' | 'he' = 'en'): string {
  const locale = language === 'he' ? 'he-IL' : 'en-US';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

/**
 * Format a date-time as a localised string.
 *
 * @param date - The date to format
 * @param language - Display language
 * @returns Formatted datetime string
 */
export function formatDateTime(date: Date, language: 'en' | 'he' = 'en'): string {
  const locale = language === 'he' ? 'he-IL' : 'en-US';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Format a number as a percentage string.
 *
 * @param value - Decimal value (e.g. 0.34 for 34%)
 * @param language - Display language
 * @returns Formatted percentage string (e.g. "34%")
 */
export function formatPercent(value: number, language: 'en' | 'he' = 'en'): string {
  const locale = language === 'he' ? 'he-IL' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Format a large number with thousand separators.
 *
 * @param num - Number to format
 * @param language - Display language
 * @returns Formatted number string
 */
export function formatNumber(num: number, language: 'en' | 'he' = 'en'): string {
  const locale = language === 'he' ? 'he-IL' : 'en-US';
  return new Intl.NumberFormat(locale).format(num);
}

/**
 * Determine a stock severity level based on on-hand vs minimum levels.
 *
 * @param onHand - Current units on hand
 * @param minLevel - Minimum stock level
 * @param criticalThreshold - Below this is CRITICAL
 * @returns Severity level: 'critical' | 'low' | 'ok'
 */
export function getStockSeverity(
  onHand: number,
  minLevel: number,
  criticalThreshold: number = 10,
): 'critical' | 'low' | 'ok' {
  if (onHand <= criticalThreshold) return 'critical';
  if (onHand < minLevel) return 'low';
  return 'ok';
}

/**
 * Get a status emoji for stock severity.
 *
 * @param severity - The severity level
 * @returns Emoji string: 🔴 | 🟡 | 🟢
 */
export function getSeverityEmoji(severity: 'critical' | 'low' | 'ok'): string {
  switch (severity) {
    case 'critical':
      return '🔴';
    case 'low':
      return '🟡';
    case 'ok':
      return '🟢';
  }
}

/**
 * Get the Adaptive Card color string for a severity level.
 *
 * @param severity - The severity level
 * @returns Adaptive Card color token
 */
export function getSeverityColor(severity: 'critical' | 'low' | 'ok'): string {
  switch (severity) {
    case 'critical':
      return 'Attention';
    case 'low':
      return 'Warning';
    case 'ok':
      return 'Good';
  }
}

/**
 * Sanitise user input to prevent injection attacks.
 * Strips HTML tags and control characters from the input string.
 *
 * @param input - Raw user input string
 * @returns Sanitised string safe for use in query parameters
 */
export function sanitiseInput(input: string): string {
  return input
    .replace(/<[^>]*>/g, '') // Strip HTML tags
    .replace(/[^\p{L}\p{N}\p{P}\p{Z}\p{M}]/gu, '') // Keep letters, numbers, punctuation, spaces, marks (handles Hebrew)
    .trim()
    .substring(0, 500); // Limit length
}

/**
 * Truncate a string to a maximum length with ellipsis.
 *
 * @param str - String to truncate
 * @param maxLength - Maximum length (default: 100)
 * @returns Truncated string
 */
export function truncate(str: string, maxLength: number = 100): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Calculate the number of days between two dates.
 *
 * @param from - Start date
 * @param to - End date (default: now)
 * @returns Number of days (positive if 'to' is after 'from')
 */
export function daysBetween(from: Date, to: Date = new Date()): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((to.getTime() - from.getTime()) / msPerDay);
}
