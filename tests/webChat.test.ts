/**
 * @file tests/webChat.test.ts
 * @description Tests for the Web Chat demo channel:
 * - Config boots successfully in demo mode with zero Azure/Teams credentials
 * - POST /api/chat returns Adaptive Card responses for English and Hebrew queries
 * - GET /api/welcome and GET /api/alerts/preview behave as expected
 *
 * Each describe block resets the module registry before importing config
 * fresh, so the config singleton and every module that calls getConfig()
 * always agree on the same instance within that block.
 */

import express from 'express';
import request from 'supertest';

// Prevent real Azure calls
jest.mock('@azure/ai-language-text', () => ({
  TextAnalysisClient: jest.fn(),
  ConversationAnalysisClient: jest.fn(),
  AzureKeyCredential: jest.fn(),
}));
jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn(),
}));

// ─────────────────────────────────────────────
// Demo mode config boot test
// ─────────────────────────────────────────────
describe('Demo mode config', () => {
  const AZURE_KEYS = [
    'MICROSOFT_APP_ID',
    'MICROSOFT_APP_PASSWORD',
    'CRM_API_URL',
    'CRM_API_KEY',
    'ERP_API_URL',
    'ERP_API_KEY',
    'INVENTORY_DB_CONNECTION_STRING',
    'ALERT_TEAMS_CHANNEL_ID',
    'ALERT_TEAMS_TEAM_ID',
    'AAD_TENANT_ID',
    'AAD_ROLE_GROUP_SALES',
    'AAD_ROLE_GROUP_INVENTORY',
    'AAD_ROLE_GROUP_PROCUREMENT',
    'AAD_ROLE_GROUP_MANAGER',
    'AAD_ROLE_GROUP_ADMIN',
    'APPLICATIONINSIGHTS_CONNECTION_STRING',
    'APPINSIGHTS_INSTRUMENTATIONKEY',
    'USE_MOCK_DATA',
  ];

  it('boots successfully with no Azure/Teams credentials configured at all', async () => {
    const saved: Record<string, string | undefined> = {};
    for (const key of AZURE_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    const savedNodeEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'development';

    jest.resetModules();
    const { initConfig } = await import('../src/core/utils/config');
    const config = await initConfig();

    expect(config.demoMode).toBe(true);
    expect(config.useMockData).toBe(true);
    expect(config.microsoftAppId).toBe('');
    expect(config.crmApiUrl).toContain('mock-crm');

    // Restore for other test files sharing this process
    for (const key of AZURE_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    process.env['NODE_ENV'] = savedNodeEnv;
  });
});

/** Shape of a POST /api/chat or GET /api/welcome JSON response, for test assertions */
interface ChatApiResponse {
  sessionId?: string;
  text?: string;
  adaptiveCard?: { type?: string; [key: string]: unknown };
  language?: 'en' | 'he';
}

/** Shape of a GET /api/alerts/preview JSON response, for test assertions */
interface AlertsPreviewResponse {
  alerts: Array<{ adaptiveCard: object; summaryText: string; language: string; alertType: string }>;
}

// ─────────────────────────────────────────────
// Web Chat API tests
// ─────────────────────────────────────────────
describe('Web Chat API', () => {
  let app: express.Express;

  beforeAll(async () => {
    jest.resetModules();
    const { initConfig } = await import('../src/core/utils/config');
    await initConfig();
    const { createWebChatRouter } = await import('../src/channels/web/webChatRouter');
    app = express();
    app.use(express.json());
    app.use(createWebChatRouter());
  });

  it('GET /api/welcome returns a valid adaptive card', async () => {
    const res = await request(app).get('/api/welcome');
    const body = res.body as ChatApiResponse;
    expect(res.status).toBe(200);
    expect(body.adaptiveCard).toBeDefined();
    expect(body.adaptiveCard?.type).toBe('AdaptiveCard');
  });

  it('POST /api/chat responds to an English sales query with an adaptive card', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: 'test-session-en', text: 'show me the sales pipeline' });
    const body = res.body as ChatApiResponse;

    expect(res.status).toBe(200);
    expect(body.language).toBe('en');
    expect(body.adaptiveCard).toBeDefined();
    expect(body.adaptiveCard?.type).toBe('AdaptiveCard');
  });

  it('POST /api/chat responds to a Hebrew inventory query with an adaptive card', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: 'test-session-he', text: 'אילו פריטים מתחת לרמת מלאי מינימלית?' });
    const body = res.body as ChatApiResponse;

    expect(res.status).toBe(200);
    expect(body.language).toBe('he');
    expect(body.adaptiveCard).toBeDefined();
  });

  it('POST /api/chat resolves a specific PO lookup', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: 'test-session-po', text: 'what is the status of PO-20250618?' });
    const body = res.body as ChatApiResponse;

    expect(res.status).toBe(200);
    expect(body.adaptiveCard).toBeDefined();
  });

  it('POST /api/chat returns 400 when text is missing', async () => {
    const res = await request(app).post('/api/chat').send({ sessionId: 'test-session-empty' });
    expect(res.status).toBe(400);
  });

  it('GET /api/alerts/preview returns an array of formatted alerts', async () => {
    const res = await request(app).get('/api/alerts/preview');
    const body = res.body as AlertsPreviewResponse;
    expect(res.status).toBe(200);
    expect(Array.isArray(body.alerts)).toBe(true);
    expect(body.alerts.length).toBeGreaterThan(0);
    expect(body.alerts[0].adaptiveCard).toBeDefined();
  });
});
