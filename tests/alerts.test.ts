/**
 * @file tests/alerts.test.ts
 * @description Tests for the alert engine:
 * - Correct identification of critical and low-stock items
 * - Deduplication within the configured interval
 * - Overdue PO detection
 */

import { initConfig } from '../src/core/utils/config';
import { checkAlerts, clearAlertCache } from '../src/core/alerts/alertEngine';
import { InventoryConnector } from '../src/core/connectors/inventoryConnector';
import { ERPConnector } from '../src/core/connectors/erpConnector';

// Mock AppInsights
jest.mock('applicationinsights', () => ({
  defaultClient: {
    trackEvent: jest.fn(),
    trackDependency: jest.fn(),
    trackException: jest.fn(),
    trackTrace: jest.fn(),
    commonProperties: {},
  },
  setup: jest.fn().mockReturnThis(),
  setAutoDependencyCorrelation: jest.fn().mockReturnThis(),
  setAutoCollectRequests: jest.fn().mockReturnThis(),
  setAutoCollectPerformance: jest.fn().mockReturnThis(),
  setAutoCollectExceptions: jest.fn().mockReturnThis(),
  setAutoCollectDependencies: jest.fn().mockReturnThis(),
  setAutoCollectConsole: jest.fn().mockReturnThis(),
  setUseDiskRetryCaching: jest.fn().mockReturnThis(),
  setSendLiveMetrics: jest.fn().mockReturnThis(),
  start: jest.fn(),
}));

jest.mock('@azure/ai-language-text', () => ({
  TextAnalysisClient: jest.fn(),
  AzureKeyCredential: jest.fn(),
}));

jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn(),
}));

beforeAll(async () => {
  await initConfig();
});

beforeEach(() => {
  // Clear alert deduplication cache before each test
  clearAlertCache();
});

// ─────────────────────────────────────────────
// Alert Detection Tests
// ─────────────────────────────────────────────
describe('Alert Engine — Stock Detection', () => {
  it('should detect critical stock items (onHand <= 10)', async () => {
    const alerts = await checkAlerts({ criticalStockThreshold: 10, lowStockThreshold: 50 });

    const criticalAlerts = alerts.filter((a) => a.type === 'CRITICAL_STOCK');
    expect(criticalAlerts.length).toBeGreaterThan(0);

    // All critical alert items should have onHand <= 10
    const criticalItems = criticalAlerts[0].items as Array<{ onHand: number }>;
    criticalItems.forEach((item) => {
      expect(item.onHand).toBeLessThanOrEqual(10);
    });
  });

  it('should detect low stock items (above critical, below low threshold)', async () => {
    const alerts = await checkAlerts({ criticalStockThreshold: 10, lowStockThreshold: 50 });

    const lowAlerts = alerts.filter((a) => a.type === 'LOW_STOCK');
    expect(lowAlerts.length).toBeGreaterThan(0);

    // Low stock items should be above critical threshold
    const lowItems = lowAlerts[0].items as Array<{ onHand: number }>;
    lowItems.forEach((item) => {
      expect(item.onHand).toBeGreaterThan(10);
      expect(item.onHand).toBeLessThan(50);
    });
  });

  it('should detect overdue purchase orders', async () => {
    const alerts = await checkAlerts();

    const overdueAlerts = alerts.filter((a) => a.type === 'PO_OVERDUE');
    expect(overdueAlerts.length).toBeGreaterThan(0);

    const overdueItems = overdueAlerts[0].items as Array<{ isOverdue: boolean }>;
    overdueItems.forEach((po) => {
      expect(po.isOverdue).toBe(true);
    });
  });

  it('should return severity=critical for CRITICAL_STOCK alerts', async () => {
    const alerts = await checkAlerts({ criticalStockThreshold: 10 });
    const criticalAlerts = alerts.filter((a) => a.type === 'CRITICAL_STOCK');
    criticalAlerts.forEach((a) => expect(a.severity).toBe('critical'));
  });

  it('should return severity=warning for LOW_STOCK alerts', async () => {
    const alerts = await checkAlerts({ lowStockThreshold: 50 });
    const lowAlerts = alerts.filter((a) => a.type === 'LOW_STOCK');
    lowAlerts.forEach((a) => expect(a.severity).toBe('warning'));
  });

  it('alerts should have detectedAt timestamp', async () => {
    const alerts = await checkAlerts();
    alerts.forEach((a) => {
      expect(a.detectedAt).toBeInstanceOf(Date);
      expect(a.detectedAt.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });
});

// ─────────────────────────────────────────────
// Deduplication Tests
// ─────────────────────────────────────────────
describe('Alert Engine — Deduplication', () => {
  it('should not re-send the same alert within the check interval', async () => {
    // First call — should find alerts
    const firstRun = await checkAlerts({ checkIntervalMinutes: 30 });
    expect(firstRun.length).toBeGreaterThan(0);

    // Second call immediately after — same items should be suppressed
    const secondRun = await checkAlerts({ checkIntervalMinutes: 30 });
    expect(secondRun.length).toBe(0);
  });

  it('should send alerts again after cache is cleared', async () => {
    // First run generates alerts
    const firstRun = await checkAlerts({ checkIntervalMinutes: 30 });
    expect(firstRun.length).toBeGreaterThan(0);

    // Clear cache simulates expiry of the interval
    clearAlertCache();

    // Second run should find alerts again
    const secondRun = await checkAlerts({ checkIntervalMinutes: 30 });
    expect(secondRun.length).toBeGreaterThan(0);
  });

  it('should suppress duplicates with a 60-minute interval', async () => {
    await checkAlerts({ checkIntervalMinutes: 60 });
    const secondRun = await checkAlerts({ checkIntervalMinutes: 60 });
    expect(secondRun.length).toBe(0);
  });
});

// ─────────────────────────────────────────────
// Mock Data Validation Tests
// ─────────────────────────────────────────────
describe('Alert Engine — Mock Data Consistency', () => {
  it('inventory mock data should contain items below threshold', () => {
    const items = InventoryConnector.getMockData();
    const belowMinimum = items.filter((i) => i.onHand < i.minimumLevel);
    expect(belowMinimum.length).toBeGreaterThan(0);
  });

  it('ERP mock data should contain overdue POs', () => {
    const { pos } = ERPConnector.getMockData();
    const overdue = pos.filter((p) => p.isOverdue);
    expect(overdue.length).toBeGreaterThan(0);
  });

  it('ERP mock data should contain pending approval POs', () => {
    const { pos } = ERPConnector.getMockData();
    const pending = pos.filter((p) => p.status === 'PENDING_APPROVAL');
    expect(pending.length).toBeGreaterThan(0);
  });
});
