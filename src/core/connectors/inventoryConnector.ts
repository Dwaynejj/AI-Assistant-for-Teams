/**
 * @file inventoryConnector.ts
 * @description Adapter for the Inventory database system.
 * Implements all inventory data retrieval methods with mock data for testing.
 */

import { createHttpClient, executeWithRetry } from './baseConnector';
import { getConfig } from '../utils/config';

// ─────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────

export interface StockItem {
  skuCode: string;
  productName: string;
  onHand: number;
  minimumLevel: number;
  warehouseId?: string;
  warehouseName?: string;
  daysToStockout?: number;
  lastMovementDate?: Date;
  category?: string;
  unitCost?: number;
}

export interface WarehouseSnapshot {
  warehouseId: string;
  warehouseName: string;
  totalSKUs: number;
  criticalItems: number;
  lowItems: number;
  totalValue: number;
  lastUpdated: Date;
  items: StockItem[];
}

export interface InventoryFilter {
  category?: string;
  warehouseId?: string;
  belowMinimum?: boolean;
  skuCode?: string;
}

// ─────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────

function getMockStockItems(): StockItem[] {
  return [
    {
      skuCode: 'SKU-0042',
      productName: 'Valve Assembly — Type A',
      onHand: 8,
      minimumLevel: 50,
      warehouseId: 'WH-TLV',
      warehouseName: 'Tel Aviv Warehouse',
      daysToStockout: 2,
      lastMovementDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      category: 'Mechanical Parts',
      unitCost: 145.0,
    },
    {
      skuCode: 'SKU-0099',
      productName: 'Pump Motor — 2HP',
      onHand: 2,
      minimumLevel: 20,
      warehouseId: 'WH-TLV',
      warehouseName: 'Tel Aviv Warehouse',
      daysToStockout: 1,
      lastMovementDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      category: 'Electrical',
      unitCost: 890.0,
    },
    {
      skuCode: 'SKU-1187',
      productName: 'Sensor Kit — Temperature',
      onHand: 31,
      minimumLevel: 50,
      warehouseId: 'WH-HFA',
      warehouseName: 'Haifa Distribution',
      daysToStockout: 8,
      lastMovementDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      category: 'Electronics',
      unitCost: 210.0,
    },
    {
      skuCode: 'SKU-3302',
      productName: 'Cable Bundle — 10m',
      onHand: 45,
      minimumLevel: 50,
      warehouseId: 'WH-TLV',
      warehouseName: 'Tel Aviv Warehouse',
      daysToStockout: 12,
      lastMovementDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      category: 'Electrical',
      unitCost: 55.0,
    },
    {
      skuCode: 'SKU-4421',
      productName: 'Control Panel — Basic',
      onHand: 120,
      minimumLevel: 50,
      warehouseId: 'WH-HFA',
      warehouseName: 'Haifa Distribution',
      daysToStockout: 45,
      lastMovementDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      category: 'Electrical',
      unitCost: 340.0,
    },
  ];
}

// ─────────────────────────────────────────────
// Connector class
// ─────────────────────────────────────────────

export class InventoryConnector {
  private readonly client;
  private readonly systemName = 'Inventory';
  private readonly useMock: boolean;
  private readonly criticalThreshold: number;
  private readonly lowThreshold: number;

  constructor() {
    const config = getConfig();
    this.useMock =
      config.useMockData !== undefined
        ? config.useMockData
        : config.inventoryDbConnectionString.includes('mock') ||
          config.inventoryDbConnectionString.includes('example');
    this.criticalThreshold = config.criticalStockThreshold;
    this.lowThreshold = config.lowStockThreshold;

    // Inventory API is accessed via REST; connection string is used only for
    // direct DB access. The HTTP URL is derived from the connection string prefix
    // or falls back to a mock base URL.
    const baseUrl = this.useMock
      ? 'https://inventory-api.example.com'
      : config.inventoryDbConnectionString;

    this.client = createHttpClient({
      baseUrl,
      apiKey: 'inventory', // The inventory system uses connection-string auth, not API key
      systemName: this.systemName,
    });
  }

  /**
   * Get all stock items below the configured low-stock threshold.
   *
   * @param threshold - Override the default low-stock threshold
   * @param sessionId - Correlation ID for logging
   * @returns Array of stock items below threshold
   */
  async getLowStockItems(threshold?: number, sessionId: string = 'default'): Promise<StockItem[]> {
    const limit = threshold ?? this.lowThreshold;

    if (this.useMock) {
      return getMockStockItems().filter((item) => item.onHand < limit);
    }

    return executeWithRetry<StockItem[]>(
      this.client,
      { method: 'GET', url: '/inventory/low-stock', params: { threshold: limit } },
      this.systemName,
      'getLowStockItems',
      sessionId,
    );
  }

  /**
   * Get inventory data for a specific SKU code.
   *
   * @param skuCode - The SKU code to look up (e.g. "SKU-0042")
   * @param sessionId - Correlation ID for logging
   * @returns Stock item details for the SKU
   */
  async getStockBySKU(skuCode: string, sessionId: string = 'default'): Promise<StockItem> {
    if (this.useMock) {
      const item = getMockStockItems().find(
        (i) => i.skuCode.toLowerCase() === skuCode.toLowerCase(),
      );
      if (!item) {
        throw new Error(`SKU ${skuCode} not found in inventory`);
      }
      return item;
    }

    return executeWithRetry<StockItem>(
      this.client,
      { method: 'GET', url: `/inventory/sku/${encodeURIComponent(skuCode)}` },
      this.systemName,
      'getStockBySKU',
      sessionId,
    );
  }

  /**
   * Get a snapshot of all inventory in a specific warehouse (or all warehouses).
   *
   * @param warehouseId - Optional warehouse ID filter
   * @param sessionId - Correlation ID for logging
   * @returns Warehouse snapshot including summary stats
   */
  async getWarehouseSnapshot(
    warehouseId?: string,
    sessionId: string = 'default',
  ): Promise<WarehouseSnapshot> {
    if (this.useMock) {
      const items = getMockStockItems().filter(
        (i) => !warehouseId || i.warehouseId === warehouseId,
      );
      const critical = items.filter((i) => i.onHand <= this.criticalThreshold).length;
      const low = items.filter(
        (i) => i.onHand > this.criticalThreshold && i.onHand < this.lowThreshold,
      ).length;
      const totalValue = items.reduce((sum, i) => sum + i.onHand * (i.unitCost ?? 0), 0);

      return {
        warehouseId: warehouseId ?? 'ALL',
        warehouseName: warehouseId ? `Warehouse ${warehouseId}` : 'All Warehouses',
        totalSKUs: items.length,
        criticalItems: critical,
        lowItems: low,
        totalValue,
        lastUpdated: new Date(),
        items,
      };
    }

    const params = warehouseId ? { warehouseId } : {};
    return executeWithRetry<WarehouseSnapshot>(
      this.client,
      { method: 'GET', url: '/inventory/snapshot', params },
      this.systemName,
      'getWarehouseSnapshot',
      sessionId,
    );
  }

  /**
   * Get items that have not moved (no transactions) for a given number of days.
   *
   * @param daysThreshold - Minimum days with no movement
   * @param sessionId - Correlation ID for logging
   * @returns Array of slow-moving stock items
   */
  async getSlowMovingItems(
    daysThreshold: number,
    sessionId: string = 'default',
  ): Promise<StockItem[]> {
    if (this.useMock) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysThreshold);
      return getMockStockItems().filter((i) => i.lastMovementDate && i.lastMovementDate < cutoff);
    }

    return executeWithRetry<StockItem[]>(
      this.client,
      { method: 'GET', url: '/inventory/slow-moving', params: { days: daysThreshold } },
      this.systemName,
      'getSlowMovingItems',
      sessionId,
    );
  }

  /**
   * Get all inventory items with optional filters.
   *
   * @param filters - Optional category, warehouse, or other filters
   * @param sessionId - Correlation ID for logging
   * @returns Array of all matching stock items
   */
  async getAllInventory(
    filters: InventoryFilter = {},
    sessionId: string = 'default',
  ): Promise<StockItem[]> {
    if (this.useMock) {
      let items = getMockStockItems();
      if (filters.category) {
        items = items.filter((i) =>
          i.category?.toLowerCase().includes(filters.category!.toLowerCase()),
        );
      }
      if (filters.warehouseId) {
        items = items.filter((i) => i.warehouseId === filters.warehouseId);
      }
      if (filters.belowMinimum) {
        items = items.filter((i) => i.onHand < i.minimumLevel);
      }
      return items;
    }

    return executeWithRetry<StockItem[]>(
      this.client,
      { method: 'GET', url: '/inventory', params: filters },
      this.systemName,
      'getAllInventory',
      sessionId,
    );
  }

  /** Return realistic mock data for unit testing */
  static getMockData(): StockItem[] {
    return getMockStockItems();
  }
}
