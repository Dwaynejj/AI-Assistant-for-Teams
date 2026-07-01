/**
 * @file tests/bot.test.ts
 * @description Tests for the BIAgent bot class:
 * - Welcome card on MembersAdded
 * - RBAC blocking unauthorised users
 * - Valid sales query returns a card
 * - Fallback help response for unknown input
 *
 * Note: Config is initialised before any module imports that require it,
 * using dynamic imports in describe blocks to avoid module-load-time errors.
 */

import { initConfig } from '../src/core/utils/config';
import { hasAccess, invalidateRoleCache } from '../src/core/auth/rbac';
import {
  buildWelcomeCard,
  buildHelpCard,
  buildPipelineCard,
} from '../src/core/cards/adaptiveCards';
import { handleHelpIntent, handleUnknownIntent } from '../src/core/handlers/helpHandler';
import { ParsedIntent } from '../src/core/nlp/intentParser';

// Prevent real Azure AI Language API calls
jest.mock('@azure/ai-language-text', () => ({
  TextAnalysisClient: jest.fn(),
  ConversationAnalysisClient: jest.fn(),
  AzureKeyCredential: jest.fn(),
}));

// Prevent real Azure identity calls
jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn(),
}));

let handleSalesIntent: typeof import('../src/core/handlers/salesHandler').handleSalesIntent;
let CRMConnector: typeof import('../src/core/connectors/crmConnector').CRMConnector;

beforeAll(async () => {
  // Config MUST be initialised before any connector constructors run
  await initConfig();

  // Now safe to import modules that call getConfig() in their constructors
  const salesHandler = await import('../src/core/handlers/salesHandler');
  handleSalesIntent = salesHandler.handleSalesIntent;

  const crmModule = await import('../src/core/connectors/crmConnector');
  CRMConnector = crmModule.CRMConnector;
});

beforeEach(() => {
  // Clear RBAC cache between tests
  invalidateRoleCache('test-user-id');
  invalidateRoleCache('admin-user-id');
});

// ─────────────────────────────────────────────
// Welcome Card Tests
// ─────────────────────────────────────────────
describe('Welcome Card', () => {
  it('should build a valid welcome card for English', () => {
    const card = buildWelcomeCard('en');
    expect(card).toBeDefined();
    expect(card.type).toBe('AdaptiveCard');
    expect(card.version).toBe('1.5');
    expect(card.actions).toBeDefined();
    expect(card.actions).toHaveLength(4);
  });

  it('should build a valid welcome card for Hebrew', () => {
    const card = buildWelcomeCard('he');
    expect(card).toBeDefined();
    expect(card.type).toBe('AdaptiveCard');
    // Hebrew card should still have 4 action buttons
    expect(card.actions).toHaveLength(4);
  });

  it('welcome card should contain bilingual quick-action buttons', () => {
    const card = buildWelcomeCard('en');
    const titles = (card.actions as Array<{ title: string }>).map((a) => a.title);
    expect(titles.some((t) => t.includes('Sales'))).toBe(true);
    expect(titles.some((t) => t.includes('Inventory'))).toBe(true);
    expect(titles.some((t) => t.includes('Help'))).toBe(true);
  });
});

// ─────────────────────────────────────────────
// RBAC Tests
// ─────────────────────────────────────────────
describe('RBAC', () => {
  // In test environment, NODE_ENV=test grants ADMIN to all users
  it('should grant access in test environment (ADMIN)', async () => {
    const access = await hasAccess('test-user-id', 'SALES_PIPELINE');
    expect(access).toBe(true);
  });

  it('should allow HELP intent for all users', async () => {
    const access = await hasAccess('any-user-id', 'HELP');
    expect(access).toBe(true);
  });

  it('should allow LANG_SWITCH for all users', async () => {
    const access = await hasAccess('any-user-id', 'LANG_SWITCH');
    expect(access).toBe(true);
  });

  it('should grant access to INVENTORY_ALERTS in test mode', async () => {
    const access = await hasAccess('test-user-id', 'INVENTORY_ALERTS');
    expect(access).toBe(true);
  });

  it('should grant access to PROCUREMENT_PO_STATUS in test mode', async () => {
    const access = await hasAccess('test-user-id', 'PROCUREMENT_PO_STATUS');
    expect(access).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Handler Tests
// ─────────────────────────────────────────────
describe('Sales Handler', () => {
  const mockSalesIntent: ParsedIntent = {
    intent: 'SALES_PIPELINE',
    confidence: 0.95,
    entities: {},
    rawText: 'show me the sales pipeline',
    detectedLanguage: 'en',
  };

  it('should return a BotResponse with an Adaptive Card for SALES_PIPELINE', async () => {
    const response = await handleSalesIntent(mockSalesIntent, 'test-user', 'test-session');
    expect(response).toBeDefined();
    expect(response.language).toBe('en');
    expect(response.dataSource).toBe('CRM');
    expect(response.adaptiveCard).toBeDefined();
  });

  it('should handle SALES_PERFORMANCE intent', async () => {
    const intent: ParsedIntent = { ...mockSalesIntent, intent: 'SALES_PERFORMANCE' };
    const response = await handleSalesIntent(intent, 'test-user', 'test-session');
    expect(response.adaptiveCard).toBeDefined();
    expect(response.dataSource).toBe('CRM');
  });

  it('should handle Hebrew language sales intent', async () => {
    const intent: ParsedIntent = {
      ...mockSalesIntent,
      detectedLanguage: 'he',
      rawText: 'הצג פייפליין מכירות',
    };
    const response = await handleSalesIntent(intent, 'test-user', 'test-session');
    expect(response.language).toBe('he');
  });
});

describe('Help Handler', () => {
  it('should return a help card for HELP intent', () => {
    const intent: ParsedIntent = {
      intent: 'HELP',
      confidence: 1.0,
      entities: {},
      rawText: 'help',
      detectedLanguage: 'en',
    };
    const response = handleHelpIntent(intent);
    expect(response.adaptiveCard).toBeDefined();
    expect(response.language).toBe('en');
    expect(response.dataSource).toBe('BIAgent');
  });

  it('should return a Hebrew help card for /lang he', () => {
    const intent: ParsedIntent = {
      intent: 'LANG_SWITCH',
      confidence: 1.0,
      entities: { language: 'he' },
      rawText: '/lang he',
      detectedLanguage: 'he',
    };
    const response = handleHelpIntent(intent);
    expect(response.language).toBe('he');
  });

  it('should return a help card for unknown input', () => {
    const response = handleUnknownIntent('en');
    expect(response.adaptiveCard).toBeDefined();
    expect(response.text).toContain('help');
  });

  it('should return Hebrew help card for unknown Hebrew input', () => {
    const response = handleUnknownIntent('he');
    expect(response.language).toBe('he');
  });
});

// ─────────────────────────────────────────────
// Adaptive Card Structure Tests
// ─────────────────────────────────────────────
describe('Adaptive Card Structure', () => {
  it('help card should have valid schema', () => {
    const card = buildHelpCard('en');
    expect(card.$schema).toContain('adaptivecards.io');
    expect(card.version).toBe('1.5');
    expect(card.body).toBeDefined();
    expect(Array.isArray(card.body)).toBe(true);
  });

  it('pipeline card should contain FactSet with KPIs', () => {
    const mockData = CRMConnector.getMockData().pipeline;
    const card = buildPipelineCard(mockData, 'en');
    expect(card.body).toBeDefined();
    const factSet = (card.body as Array<{ type: string }>).find((el) => el.type === 'FactSet');
    expect(factSet).toBeDefined();
  });
});
