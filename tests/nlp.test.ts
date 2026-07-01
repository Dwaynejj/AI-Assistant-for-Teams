/**
 * @file tests/nlp.test.ts
 * @description Tests for the NLP layer: language detection, intent parsing, entity extraction.
 * All tests use mock data and do not call real Azure AI Language APIs.
 */

import { detectLanguage, isLikelyHebrew } from '../src/core/nlp/languageDetector';
import { parseIntent } from '../src/core/nlp/intentParser';
import {
  extractPONumber,
  extractSKUCode,
  extractDateRange,
  extractAmount,
  extractEntities,
} from '../src/core/nlp/entities';
import { initConfig } from '../src/core/utils/config';

// Mock the Azure AI Language client to prevent real API calls
jest.mock('@azure/ai-language-text', () => ({
  TextAnalysisClient: jest.fn().mockImplementation(() => ({
    analyze: jest
      .fn()
      .mockResolvedValue([{ primaryLanguage: { iso6391Name: 'en', confidenceScore: 0.99 } }]),
  })),
  ConversationAnalysisClient: jest.fn().mockImplementation(() => ({
    analyzeConversation: jest.fn().mockResolvedValue({
      result: {
        prediction: { topIntent: 'Help', intents: [{ category: 'Help', confidenceScore: 0.95 }] },
      },
    }),
  })),
  AzureKeyCredential: jest.fn(),
}));

beforeAll(async () => {
  await initConfig();
});

// ─────────────────────────────────────────────
// Language Detection Tests
// ─────────────────────────────────────────────
describe('Language Detection', () => {
  it('should detect English text as English', async () => {
    const result = await detectLanguage('Show me the sales pipeline for Q3');
    expect(result.language).toBe('en');
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it('should detect Hebrew text as Hebrew using Unicode heuristic', async () => {
    const result = await detectLanguage('הצג לי את צינור המכירות');
    expect(result.language).toBe('he');
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it('should detect mixed Hebrew-English as Hebrew', async () => {
    const result = await detectLanguage('Show me מלאי נמוך');
    expect(result.language).toBe('he');
  });

  it('should return English for /lang en command', async () => {
    const result = await detectLanguage('/lang en');
    expect(result.language).toBe('en');
    expect(result.confidence).toBe(1.0);
  });

  it('should return Hebrew for /lang he command', async () => {
    const result = await detectLanguage('/lang he');
    expect(result.language).toBe('he');
    expect(result.confidence).toBe(1.0);
  });

  it('isLikelyHebrew should return true for Hebrew text', () => {
    expect(isLikelyHebrew('הצג לי מלאי')).toBe(true);
  });

  it('isLikelyHebrew should return false for English text', () => {
    expect(isLikelyHebrew('Show me inventory status')).toBe(false);
  });

  it('isLikelyHebrew should return false for empty string', () => {
    expect(isLikelyHebrew('')).toBe(false);
  });
});

// ─────────────────────────────────────────────
// Intent Detection Tests (English)
// ─────────────────────────────────────────────
describe('Intent Detection — English', () => {
  it('should classify "show me the sales pipeline" as SALES_PIPELINE', async () => {
    const result = await parseIntent('show me the sales pipeline for Q3');
    expect(result.intent).toBe('SALES_PIPELINE');
    expect(result.detectedLanguage).toBe('en');
  });

  it('should classify "what is our win rate" as SALES_PERFORMANCE', async () => {
    const result = await parseIntent('what is our win rate for the last 90 days');
    expect(result.intent).toBe('SALES_PERFORMANCE');
  });

  it('should classify "low stock" as INVENTORY_ALERTS', async () => {
    const result = await parseIntent('which items are low stock and critical');
    expect(result.intent).toBe('INVENTORY_ALERTS');
  });

  it('should classify "PO status" as PROCUREMENT_PO_STATUS', async () => {
    const result = await parseIntent('what is the status of purchase order PO-20250618');
    expect(result.intent).toBe('PROCUREMENT_PO_STATUS');
  });

  it('should classify "help" as HELP', async () => {
    const result = await parseIntent('help');
    expect(result.intent).toBe('HELP');
  });
});

// ─────────────────────────────────────────────
// Intent Detection Tests (Hebrew)
// ─────────────────────────────────────────────
describe('Intent Detection — Hebrew', () => {
  it('should classify Hebrew pipeline query as SALES_PIPELINE', async () => {
    const result = await parseIntent('מה ערך הפייפליין הרבעוני?');
    expect(result.intent).toBe('SALES_PIPELINE');
    expect(result.detectedLanguage).toBe('he');
  });

  it('should classify Hebrew inventory query as INVENTORY_LEVELS', async () => {
    const result = await parseIntent('כמה יחידות במלאי?');
    expect(result.intent).toBe('INVENTORY_LEVELS');
  });

  it('should classify Hebrew low stock query as INVENTORY_ALERTS', async () => {
    const result = await parseIntent('אילו פריטים במלאי נמוך ומחסור?');
    expect(result.intent).toBe('INVENTORY_ALERTS');
  });

  it('should classify Hebrew PO query as PROCUREMENT_PO_STATUS', async () => {
    const result = await parseIntent('מה הסטטוס של הזמנת רכש?');
    expect(result.intent).toBe('PROCUREMENT_PO_STATUS');
  });

  it('should classify Hebrew help query as HELP', async () => {
    const result = await parseIntent('עזרה');
    expect(result.intent).toBe('HELP');
  });
});

// ─────────────────────────────────────────────
// Entity Extraction Tests
// ─────────────────────────────────────────────
describe('Entity Extraction', () => {
  it('should extract PO number from text', () => {
    const po = extractPONumber('Check the status of PO-20250618 please');
    expect(po).toBe('PO-20250618');
  });

  it('should extract SKU code from text', () => {
    const sku = extractSKUCode('Show me inventory for SKU-0042');
    expect(sku).toBe('SKU-0042');
  });

  it('should extract SKU with 6-digit code', () => {
    const sku = extractSKUCode('Look up SKU-123456 in the system');
    expect(sku).toBe('SKU-123456');
  });

  it('should return undefined for text with no PO number', () => {
    const po = extractPONumber('Show me all open orders');
    expect(po).toBeUndefined();
  });

  it('should resolve "this month" to a date range', () => {
    const range = extractDateRange('show deals closing this month');
    expect(range).toBeDefined();
    expect(range?.from).toBeInstanceOf(Date);
    expect(range?.to).toBeInstanceOf(Date);
    expect(range?.label).toBe('this month');
  });

  it('should resolve "Q3" to a date range', () => {
    const range = extractDateRange('show Q3 pipeline');
    expect(range).toBeDefined();
    expect(range?.label).toBe('Q3');
  });

  it('should resolve "last 90 days" to a date range', () => {
    const range = extractDateRange('what is our win rate for the last 90 days');
    expect(range).toBeDefined();
    expect(range?.label).toBe('last 90 days');
  });

  it('should extract USD amount', () => {
    const amount = extractAmount('show POs over $10,000');
    expect(amount).toBe(10000);
  });

  it('should extract K-notation amount', () => {
    const amount = extractAmount('deals above 500K');
    expect(amount).toBe(500000);
  });

  it('should extract all entities from a complex query', () => {
    const entities = extractEntities('Show me details for PO-20250618 from this month');
    expect(entities.poNumber).toBe('PO-20250618');
    expect(entities.dateRange).toBeDefined();
  });

  it('should extract rep name from known list', () => {
    const entities = extractEntities('Show me deals for Sarah Cohen', [
      'Sarah Cohen',
      'David Levy',
    ]);
    expect(entities.repName).toBe('Sarah Cohen');
  });

  it('should sanitise HTML tags from input', () => {
    const entities = extractEntities('<script>alert("xss")</script> show inventory');
    expect(entities.skuCode).toBeUndefined();
    // Should not throw or crash
  });
});
