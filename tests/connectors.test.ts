/**
 * @file tests/connectors.test.ts
 * @description Tests for data connectors: CRM, ERP, and Inventory.
 * Tests use mock data and do not make real HTTP calls.
 */

import axios from 'axios';
import { initConfig } from '../src/utils/config';
import { CRMConnector } from '../src/connectors/crmConnector';
import { InventoryConnector } from '../src/connectors/inventoryConnector';
import { ERPConnector } from '../src/connectors/erpConnector';
import { ConnectorError } from '../src/connectors/baseConnector';

// Mock axios to prevent real HTTP calls
jest.mock('axios', () => ({
  create: jest.fn().mockReturnValue({
    request: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
  }),
  default: {
    get: jest.fn(),
  },
}));

// Mock Application Insights
jest.mock('applicationinsights', () => ({
  defaultClient: {
    trackEvent: jest.fn(),
    trackDependency: jest.fn(),
    trackException: jest.fn(),
    trackTrace: jest.fn(),
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
  ConversationAnalysisClient: jest.fn(),
  AzureKeyCredential: jest.fn(),
}));

jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn(),
}));

beforeAll(async () => {
  await initConfig();
});

// ─────────────────────────────────────────────
// CRM Connector Tests
// ─────────────────────────────────────────────
describe('CRM Connector', () => {
  let crm: CRMConnector;

  beforeEach(() => {
    crm = new CRMConnector();
  });

  it('should return mock pipeline summary', async () => {
    const pipeline = await crm.getPipelineSummary({}, 'test-session');
    expect(pipeline).toBeDefined();
    expect(pipeline.totalPipelineValue).toBeGreaterThan(0);
    expect(pipeline.winRate).toBeGreaterThanOrEqual(0);
    expect(pipeline.winRate).toBeLessThanOrEqual(1);
    expect(pipeline.topRep).toBeTruthy();
    expect(pipeline.asOf).toBeInstanceOf(Date);
  });

  it('should return mock deals', async () => {
    const deals = await crm.getDealsClosingThisMonth('test-session');
    expect(Array.isArray(deals)).toBe(true);
    expect(deals.length).toBeGreaterThan(0);
    expect(deals[0]).toHaveProperty('id');
    expect(deals[0]).toHaveProperty('value');
    expect(deals[0]).toHaveProperty('accountName');
  });

  it('should return mock sales performance', async () => {
    const perf = await crm.getSalesPerformance(
      { from: new Date(2025, 0, 1), to: new Date(2025, 11, 31) },
      'test-session',
    );
    expect(Array.isArray(perf)).toBe(true);
    expect(perf.length).toBeGreaterThan(0);
    expect(perf[0]).toHaveProperty('repName');
    expect(perf[0]).toHaveProperty('revenue');
    expect(perf[0]).toHaveProperty('quota');
    expect(perf[0]).toHaveProperty('attainment');
  });

  it('getMockData() should return all mock types', () => {
    const data = CRMConnector.getMockData();
    expect(data.pipeline).toBeDefined();
    expect(data.deals).toBeDefined();
    expect(data.performance).toBeDefined();
    expect(Array.isArray(data.deals)).toBe(true);
  });

  it('should filter deals by rep name', async () => {
    const deals = await crm.getDealsByRep('Sarah Cohen', { from: new Date(2025, 0, 1), to: new Date(2025, 11, 31) }, 'test');
    expect(deals.every((d) => d.ownerName.includes('Sarah Cohen'))).toBe(true);
  });

  it('should return top accounts', async () => {
    const accounts = await crm.getTopAccounts(3, 'test-session');
    expect(accounts).toHaveLength(3);
    expect(accounts[0]).toHaveProperty('totalDealValue');
  });
});

// ─────────────────────────────────────────────
// Inventory Connector Tests
// ─────────────────────────────────────────────
describe('Inventory Connector', () => {
  let inv: InventoryConnector;

  beforeEach(() => {
    inv = new InventoryConnector();
  });

  it('should return low stock items below threshold', async () => {
    const items = await inv.getLowStockItems(50, 'test-session');
    expect(Array.isArray(items)).toBe(true);
    items.forEach((item) => expect(item.onHand).toBeLessThan(50));
  });

  it('should return critical stock items below 10', async () => {
    const items = await inv.getLowStockItems(10, 'test-session');
    items.forEach((item) => expect(item.onHand).toBeLessThan(10));
  });

  it('should find a specific SKU', async () => {
    const item = await inv.getStockBySKU('SKU-0042', 'test-session');
    expect(item).toBeDefined();
    expect(item.skuCode).toBe('SKU-0042');
    expect(item.productName).toBeTruthy();
  });

  it('should throw when SKU not found', async () => {
    await expect(inv.getStockBySKU('SKU-9999', 'test-session')).rejects.toThrow();
  });

  it('should return warehouse snapshot', async () => {
    const snapshot = await inv.getWarehouseSnapshot(undefined, 'test-session');
    expect(snapshot).toBeDefined();
    expect(snapshot.totalSKUs).toBeGreaterThan(0);
    expect(Array.isArray(snapshot.items)).toBe(true);
  });

  it('getMockData() should return all stock items', () => {
    const items = InventoryConnector.getMockData();
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toHaveProperty('skuCode');
    expect(items[0]).toHaveProperty('onHand');
    expect(items[0]).toHaveProperty('minimumLevel');
  });
});

// ─────────────────────────────────────────────
// ERP Connector Tests
// ─────────────────────────────────────────────
describe('ERP Connector', () => {
  let erp: ERPConnector;

  beforeEach(() => {
    erp = new ERPConnector();
  });

  it('should return PO details for a known PO number', async () => {
    const po = await erp.getPOStatus('PO-20250618', 'test-session');
    expect(po).toBeDefined();
    expect(po.poNumber).toBe('PO-20250618');
    expect(po.supplier).toBeTruthy();
    expect(po.value).toBeGreaterThan(0);
  });

  it('should throw when PO number not found', async () => {
    await expect(erp.getPOStatus('PO-00000000', 'test-session')).rejects.toThrow();
  });

  it('should return open POs', async () => {
    const pos = await erp.getOpenPOs({}, 'test-session');
    expect(Array.isArray(pos)).toBe(true);
    expect(pos.length).toBeGreaterThan(0);
    pos.forEach((po) => {
      expect(['CANCELLED', 'DELIVERED']).not.toContain(po.status);
    });
  });

  it('should return overdue POs', async () => {
    const overdue = await erp.getOverduePOs('test-session');
    expect(Array.isArray(overdue)).toBe(true);
    overdue.forEach((po) => expect(po.isOverdue).toBe(true));
  });

  it('should return pending approvals', async () => {
    const pending = await erp.getPendingApprovals('user-id', 'test-session');
    expect(Array.isArray(pending)).toBe(true);
    pending.forEach((po) => expect(po.status).toBe('PENDING_APPROVAL'));
  });

  it('should return suppliers by category', async () => {
    const suppliers = await erp.getSuppliersByCategory('Electronics', 'test-session');
    expect(Array.isArray(suppliers)).toBe(true);
    expect(suppliers.length).toBeGreaterThan(0);
    suppliers.forEach((s) => expect(s.category.toLowerCase()).toContain('electron'));
  });

  it('getMockData() should return POs and suppliers', () => {
    const data = ERPConnector.getMockData();
    expect(data.pos).toBeDefined();
    expect(data.suppliers).toBeDefined();
    expect(data.pos.length).toBeGreaterThan(0);
    expect(data.suppliers.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────
// ConnectorError Tests
// ─────────────────────────────────────────────
describe('ConnectorError', () => {
  it('should be instanceof Error and ConnectorError', () => {
    const err = new ConnectorError('CRM', 404, 'Not found');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ConnectorError);
    expect(err.system).toBe('CRM');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Not found');
    expect(err.name).toBe('ConnectorError');
  });
});
