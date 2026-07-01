/**
 * @file erpConnector.ts
 * @description Adapter for the ERP system (SAP / Oracle / custom REST or SOAP).
 * Implements all procurement data retrieval methods with mock data for testing.
 */

import { createHttpClient, executeWithRetry } from './baseConnector';
import { getConfig } from '../utils/config';

// ─────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────

export type POStatus =
  'OPEN' | 'APPROVED' | 'IN_TRANSIT' | 'DELIVERED' | 'OVERDUE' | 'CANCELLED' | 'PENDING_APPROVAL';

export interface PurchaseOrder {
  poNumber: string;
  supplier: string;
  supplierId: string;
  supplierContact?: string;
  value: number;
  currency: string;
  status: POStatus;
  lineItems: number;
  orderDate: Date;
  expectedDate: Date;
  deliveredDate?: Date;
  requestorId?: string;
  requestorName?: string;
  isOverdue: boolean;
  daysOverdue?: number;
  category?: string;
}

export interface Supplier {
  id: string;
  name: string;
  category: string;
  contactName?: string;
  email?: string;
  phone?: string;
  country?: string;
  rating?: number;
  activeOrders: number;
}

export interface POFilter {
  status?: POStatus;
  minValue?: number;
  supplierId?: string;
  category?: string;
}

// ─────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────

function getMockPOs(): PurchaseOrder[] {
  const now = new Date();
  return [
    {
      poNumber: 'PO-20250618',
      supplier: 'TechParts Ltd.',
      supplierId: 'S-01',
      supplierContact: 'orders@techparts.com',
      value: 28400,
      currency: 'USD',
      status: 'APPROVED',
      lineItems: 14,
      orderDate: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      expectedDate: new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000),
      isOverdue: false,
      category: 'Mechanical Parts',
    },
    {
      poNumber: 'PO-20250441',
      supplier: 'Global Supply Co.',
      supplierId: 'S-02',
      supplierContact: 'orders@globalsupply.com',
      value: 12800,
      currency: 'USD',
      status: 'OVERDUE',
      lineItems: 6,
      orderDate: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
      expectedDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      isOverdue: true,
      daysOverdue: 5,
      category: 'Electronics',
    },
    {
      poNumber: 'PO-20250712',
      supplier: 'ElectroParts Inc.',
      supplierId: 'S-03',
      supplierContact: 'procurement@electroparts.com',
      value: 9500,
      currency: 'USD',
      status: 'PENDING_APPROVAL',
      lineItems: 8,
      orderDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      expectedDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      requestorId: 'U-001',
      requestorName: 'Yoav Katz',
      isOverdue: false,
      category: 'Electronics',
    },
    {
      poNumber: 'PO-20250605',
      supplier: 'Industrial Components Ltd.',
      supplierId: 'S-04',
      value: 45000,
      currency: 'USD',
      status: 'IN_TRANSIT',
      lineItems: 22,
      orderDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      expectedDate: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
      isOverdue: false,
      category: 'Heavy Equipment',
    },
  ];
}

function getMockSuppliers(): Supplier[] {
  return [
    {
      id: 'S-01',
      name: 'TechParts Ltd.',
      category: 'Mechanical Parts',
      contactName: 'David Chen',
      email: 'orders@techparts.com',
      phone: '+1-555-0101',
      country: 'USA',
      rating: 4.5,
      activeOrders: 3,
    },
    {
      id: 'S-02',
      name: 'Global Supply Co.',
      category: 'Electronics',
      contactName: 'Sarah Johnson',
      email: 'orders@globalsupply.com',
      phone: '+1-555-0202',
      country: 'USA',
      rating: 3.8,
      activeOrders: 2,
    },
    {
      id: 'S-03',
      name: 'ElectroParts Inc.',
      category: 'Electronics',
      contactName: 'Mike Thompson',
      email: 'procurement@electroparts.com',
      phone: '+44-20-5555-0303',
      country: 'UK',
      rating: 4.2,
      activeOrders: 1,
    },
    {
      id: 'S-04',
      name: 'Industrial Components Ltd.',
      category: 'Heavy Equipment',
      contactName: 'Anna Müller',
      email: 'sales@industrial-comp.de',
      phone: '+49-30-5555-0404',
      country: 'Germany',
      rating: 4.7,
      activeOrders: 4,
    },
  ];
}

// ─────────────────────────────────────────────
// Connector class
// ─────────────────────────────────────────────

export class ERPConnector {
  private readonly client;
  private readonly systemName = 'ERP';
  private readonly useMock: boolean;

  constructor() {
    const config = getConfig();
    this.useMock =
      config.useMockData !== undefined
        ? config.useMockData
        : config.erpApiUrl.includes('mock') ||
          config.erpApiUrl === 'https://your-erp.example.com/api';
    this.client = createHttpClient({
      baseUrl: config.erpApiUrl,
      apiKey: config.erpApiKey,
      systemName: this.systemName,
    });
  }

  /**
   * Get the status and details of a specific purchase order.
   *
   * @param poNumber - The PO number (e.g. "PO-20250618")
   * @param sessionId - Correlation ID for logging
   * @returns Full purchase order details
   */
  async getPOStatus(poNumber: string, sessionId: string = 'default'): Promise<PurchaseOrder> {
    if (this.useMock) {
      const po = getMockPOs().find((p) => p.poNumber.toLowerCase() === poNumber.toLowerCase());
      if (!po) throw new Error(`Purchase order ${poNumber} not found`);
      return po;
    }

    return executeWithRetry<PurchaseOrder>(
      this.client,
      { method: 'GET', url: `/purchase-orders/${encodeURIComponent(poNumber)}` },
      this.systemName,
      'getPOStatus',
      sessionId,
    );
  }

  /**
   * Get all open (non-cancelled, non-delivered) purchase orders with optional filters.
   *
   * @param filters - Optional status, value, and category filters
   * @param sessionId - Correlation ID for logging
   * @returns Array of matching purchase orders
   */
  async getOpenPOs(
    filters: POFilter = {},
    sessionId: string = 'default',
  ): Promise<PurchaseOrder[]> {
    if (this.useMock) {
      return getMockPOs().filter((po) => {
        if (po.status === 'CANCELLED' || po.status === 'DELIVERED') return false;
        if (filters.status && po.status !== filters.status) return false;
        if (filters.minValue && po.value < filters.minValue) return false;
        if (filters.supplierId && po.supplierId !== filters.supplierId) return false;
        return true;
      });
    }

    return executeWithRetry<PurchaseOrder[]>(
      this.client,
      { method: 'GET', url: '/purchase-orders/open', params: filters },
      this.systemName,
      'getOpenPOs',
      sessionId,
    );
  }

  /**
   * Get all purchase orders pending approval for a specific user.
   *
   * @param userId - The Azure AD object ID of the user
   * @param sessionId - Correlation ID for logging
   * @returns Array of POs awaiting this user's approval
   */
  async getPendingApprovals(
    userId: string,
    sessionId: string = 'default',
  ): Promise<PurchaseOrder[]> {
    if (this.useMock) {
      return getMockPOs().filter((po) => po.status === 'PENDING_APPROVAL');
    }

    return executeWithRetry<PurchaseOrder[]>(
      this.client,
      { method: 'GET', url: '/purchase-orders/pending-approvals', params: { userId } },
      this.systemName,
      'getPendingApprovals',
      sessionId,
    );
  }

  /**
   * Get detailed information for a specific supplier.
   *
   * @param supplierId - The internal supplier ID
   * @param sessionId - Correlation ID for logging
   * @returns Supplier contact and rating information
   */
  async getSupplierInfo(supplierId: string, sessionId: string = 'default'): Promise<Supplier> {
    if (this.useMock) {
      const supplier = getMockSuppliers().find((s) => s.id === supplierId);
      if (!supplier) throw new Error(`Supplier ${supplierId} not found`);
      return supplier;
    }

    return executeWithRetry<Supplier>(
      this.client,
      { method: 'GET', url: `/suppliers/${encodeURIComponent(supplierId)}` },
      this.systemName,
      'getSupplierInfo',
      sessionId,
    );
  }

  /**
   * Get all suppliers for a given product/service category.
   *
   * @param category - Category name (e.g. "Electronics")
   * @param sessionId - Correlation ID for logging
   * @returns Array of matching suppliers
   */
  async getSuppliersByCategory(
    category: string,
    sessionId: string = 'default',
  ): Promise<Supplier[]> {
    if (this.useMock) {
      return getMockSuppliers().filter((s) =>
        s.category.toLowerCase().includes(category.toLowerCase()),
      );
    }

    return executeWithRetry<Supplier[]>(
      this.client,
      { method: 'GET', url: '/suppliers', params: { category } },
      this.systemName,
      'getSuppliersByCategory',
      sessionId,
    );
  }

  /**
   * Get all purchase orders that are past their expected delivery date.
   *
   * @param sessionId - Correlation ID for logging
   * @returns Array of overdue purchase orders
   */
  async getOverduePOs(sessionId: string = 'default'): Promise<PurchaseOrder[]> {
    if (this.useMock) {
      return getMockPOs().filter((po) => po.isOverdue);
    }

    return executeWithRetry<PurchaseOrder[]>(
      this.client,
      { method: 'GET', url: '/purchase-orders/overdue' },
      this.systemName,
      'getOverduePOs',
      sessionId,
    );
  }

  /** Return realistic mock data for unit testing */
  static getMockData(): { pos: PurchaseOrder[]; suppliers: Supplier[] } {
    return { pos: getMockPOs(), suppliers: getMockSuppliers() };
  }
}
