/**
 * @file crmConnector.ts
 * @description Adapter for the CRM system (Salesforce / Dynamics / custom REST).
 * Implements all sales data retrieval methods with mock data for testing.
 */

import { createHttpClient, executeWithRetry } from './baseConnector';
import { getConfig } from '../utils/config';
import { DateRange } from '../nlp/entities';

// ─────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────

export interface PipelineSummary {
  totalPipelineValue: number;
  dealsClosingThisMonth: number;
  weightedForecast: number;
  winRate: number; // decimal 0-1
  topRep: string;
  dealsAtRisk: number;
  quarter?: string;
  region?: string;
  asOf: Date;
}

export interface Deal {
  id: string;
  name: string;
  accountName: string;
  ownerName: string;
  stage: string;
  value: number;
  closeDate: Date;
  lastActivity?: Date;
  isAtRisk: boolean;
}

export interface DealDetail extends Deal {
  description?: string;
  lineItems: number;
  probability: number;
  nextStep?: string;
  competitorInfo?: string;
}

export interface Account {
  id: string;
  name: string;
  totalDealValue: number;
  industry?: string;
  region?: string;
  primaryRep: string;
}

export interface WinRateResult {
  winRate: number;
  totalDeals: number;
  wonDeals: number;
  lostDeals: number;
  period: DateRange;
}

export interface SalesPerformance {
  repName: string;
  repId: string;
  revenue: number;
  quota: number;
  attainment: number; // decimal 0-1
  dealsWon: number;
  rank: number;
}

// ─────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────

function getMockDeals(): Deal[] {
  return [
    {
      id: 'D-001',
      name: 'Enterprise Platform License — Acme Corp',
      accountName: 'Acme Corp',
      ownerName: 'Sarah Cohen',
      stage: 'Negotiation',
      value: 480000,
      closeDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
      lastActivity: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      isAtRisk: false,
    },
    {
      id: 'D-002',
      name: 'Cloud Migration Project — TechStart Ltd',
      accountName: 'TechStart Ltd',
      ownerName: 'David Levy',
      stage: 'Proposal Sent',
      value: 215000,
      closeDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
      lastActivity: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      isAtRisk: true,
    },
    {
      id: 'D-003',
      name: 'Annual Support Renewal — GlobalTech',
      accountName: 'GlobalTech',
      ownerName: 'Sarah Cohen',
      stage: 'Closed Won',
      value: 120000,
      closeDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      lastActivity: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      isAtRisk: false,
    },
  ];
}

function getMockPipeline(): PipelineSummary {
  return {
    totalPipelineValue: 4820000,
    dealsClosingThisMonth: 12,
    weightedForecast: 1940000,
    winRate: 0.34,
    topRep: 'Sarah Cohen',
    dealsAtRisk: 3,
    asOf: new Date(),
  };
}

function getMockPerformance(): SalesPerformance[] {
  return [
    { repName: 'Sarah Cohen', repId: 'R-01', revenue: 620000, quota: 700000, attainment: 0.886, dealsWon: 8, rank: 1 },
    { repName: 'David Levy', repId: 'R-02', revenue: 540000, quota: 600000, attainment: 0.9, dealsWon: 6, rank: 2 },
    { repName: 'Maya Shapiro', repId: 'R-03', revenue: 480000, quota: 600000, attainment: 0.8, dealsWon: 5, rank: 3 },
    { repName: 'Yoav Ben-David', repId: 'R-04', revenue: 390000, quota: 500000, attainment: 0.78, dealsWon: 4, rank: 4 },
    { repName: 'Tali Mizrahi', repId: 'R-05', revenue: 310000, quota: 400000, attainment: 0.775, dealsWon: 3, rank: 5 },
  ];
}

// ─────────────────────────────────────────────
// Connector class
// ─────────────────────────────────────────────

export class CRMConnector {
  private readonly client;
  private readonly systemName = 'CRM';
  private readonly useMock: boolean;

  constructor() {
    const config = getConfig();
    this.useMock = config.crmApiUrl.includes('mock') || config.crmApiUrl === 'https://your-crm.example.com/api';
    this.client = createHttpClient({
      baseUrl: config.crmApiUrl,
      apiKey: config.crmApiKey,
      systemName: this.systemName,
    });
  }

  /**
   * Retrieve a pipeline summary for a given quarter and region.
   *
   * @param params - Optional quarter (e.g. "Q3") and region filters
   * @param sessionId - Correlation ID for logging
   * @returns Pipeline summary with KPIs
   */
  async getPipelineSummary(
    params: { quarter?: string; region?: string } = {},
    sessionId: string = 'default',
  ): Promise<PipelineSummary> {
    if (this.useMock) return getMockPipeline();

    const data = await executeWithRetry<PipelineSummary>(
      this.client,
      { method: 'GET', url: '/pipeline/summary', params },
      this.systemName,
      'getPipelineSummary',
      sessionId,
    );
    data.asOf = new Date(data.asOf);
    return data;
  }

  /**
   * Get deals owned by a specific sales rep within a date range.
   *
   * @param repName - The rep's name (partial match supported)
   * @param dateRange - Date range filter
   * @param sessionId - Correlation ID
   * @returns Array of matching deals
   */
  async getDealsByRep(repName: string, dateRange: DateRange, sessionId: string = 'default'): Promise<Deal[]> {
    if (this.useMock) {
      return getMockDeals().filter((d) => d.ownerName.toLowerCase().includes(repName.toLowerCase()));
    }

    return executeWithRetry<Deal[]>(
      this.client,
      {
        method: 'GET',
        url: '/deals',
        params: { rep: repName, from: dateRange.from.toISOString(), to: dateRange.to.toISOString() },
      },
      this.systemName,
      'getDealsByRep',
      sessionId,
    );
  }

  /**
   * Get the top N accounts by total deal value.
   *
   * @param limit - Maximum number of accounts to return
   * @param sessionId - Correlation ID
   * @returns Array of top accounts
   */
  async getTopAccounts(limit: number = 5, sessionId: string = 'default'): Promise<Account[]> {
    if (this.useMock) {
      return [
        { id: 'A-01', name: 'Acme Corp', totalDealValue: 1200000, industry: 'Technology', region: 'North', primaryRep: 'Sarah Cohen' },
        { id: 'A-02', name: 'GlobalTech', totalDealValue: 980000, industry: 'Manufacturing', region: 'South', primaryRep: 'David Levy' },
        { id: 'A-03', name: 'TechStart Ltd', totalDealValue: 650000, industry: 'SaaS', region: 'Central', primaryRep: 'Maya Shapiro' },
      ].slice(0, limit);
    }

    return executeWithRetry<Account[]>(
      this.client,
      { method: 'GET', url: '/accounts/top', params: { limit } },
      this.systemName,
      'getTopAccounts',
      sessionId,
    );
  }

  /**
   * Get full details for a specific deal by ID.
   *
   * @param dealId - The deal ID to look up
   * @param sessionId - Correlation ID
   * @returns Full deal details
   */
  async getDealDetail(dealId: string, sessionId: string = 'default'): Promise<DealDetail> {
    if (this.useMock) {
      const base = getMockDeals().find((d) => d.id === dealId) ?? getMockDeals()[0];
      return { ...base!, description: 'Enterprise-wide platform rollout across 500 seats.', lineItems: 14, probability: 0.72, nextStep: 'Legal review' };
    }

    return executeWithRetry<DealDetail>(
      this.client,
      { method: 'GET', url: `/deals/${dealId}` },
      this.systemName,
      'getDealDetail',
      sessionId,
    );
  }

  /**
   * Get win rate statistics for a given date range.
   *
   * @param dateRange - Period to calculate win rate for
   * @param sessionId - Correlation ID
   * @returns Win rate metrics
   */
  async getWinRate(dateRange: DateRange, sessionId: string = 'default'): Promise<WinRateResult> {
    if (this.useMock) {
      return { winRate: 0.34, totalDeals: 47, wonDeals: 16, lostDeals: 31, period: dateRange };
    }

    return executeWithRetry<WinRateResult>(
      this.client,
      { method: 'GET', url: '/deals/winrate', params: { from: dateRange.from.toISOString(), to: dateRange.to.toISOString() } },
      this.systemName,
      'getWinRate',
      sessionId,
    );
  }

  /**
   * Get all deals closing this calendar month.
   *
   * @param sessionId - Correlation ID
   * @returns Array of deals closing this month
   */
  async getDealsClosingThisMonth(sessionId: string = 'default'): Promise<Deal[]> {
    if (this.useMock) return getMockDeals().slice(0, 2);

    return executeWithRetry<Deal[]>(
      this.client,
      { method: 'GET', url: '/deals/closing-this-month' },
      this.systemName,
      'getDealsClosingThisMonth',
      sessionId,
    );
  }

  /**
   * Get sales performance data for all reps in a date range.
   *
   * @param dateRange - Period to calculate performance for
   * @param sessionId - Correlation ID
   * @returns Array of performance records, one per rep
   */
  async getSalesPerformance(dateRange: DateRange, sessionId: string = 'default'): Promise<SalesPerformance[]> {
    if (this.useMock) return getMockPerformance();

    return executeWithRetry<SalesPerformance[]>(
      this.client,
      { method: 'GET', url: '/performance', params: { from: dateRange.from.toISOString(), to: dateRange.to.toISOString() } },
      this.systemName,
      'getSalesPerformance',
      sessionId,
    );
  }

  /** Return realistic mock data for unit testing */
  static getMockData(): { pipeline: PipelineSummary; deals: Deal[]; performance: SalesPerformance[] } {
    return { pipeline: getMockPipeline(), deals: getMockDeals(), performance: getMockPerformance() };
  }
}
