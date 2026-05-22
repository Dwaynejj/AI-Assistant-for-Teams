/**
 * @file salesHandler.ts
 * @description Handle all SALES_* intents, call the CRM connector,
 * and return formatted BotResponse objects.
 */

import { ParsedIntent } from '../nlp/intentParser';
import { CRMConnector } from '../connectors/crmConnector';
import {
  buildPipelineCard,
  buildDealListCard,
  buildPerformanceCard,
  buildDealDetailCard,
} from '../bot/adaptiveCards';
import enStrings from '../i18n/en.json';
import heStrings from '../i18n/he.json';

/** Standard response structure returned by all handlers */
export interface BotResponse {
  /** Plain-text fallback (used if Adaptive Cards are not supported) */
  text?: string;
  /** Adaptive Card JSON payload (preferred) */
  adaptiveCard?: object;
  /** The language used in the response */
  language: 'en' | 'he';
  /** Data source accessed, for audit logging */
  dataSource: string;
}

const crm = new CRMConnector();

/**
 * Handle sales-related intents and return a BotResponse.
 *
 * @param intent - The parsed intent with entities and language
 * @param userId - Azure AD object ID of the requesting user (for personalisation)
 * @param sessionId - Correlation ID for logging
 * @returns BotResponse with Adaptive Card or plain text
 */
export async function handleSalesIntent(
  intent: ParsedIntent,
  userId: string,
  sessionId: string,
): Promise<BotResponse> {
  const lang = intent.detectedLanguage;
  const s = lang === 'he' ? heStrings : enStrings;

  switch (intent.intent) {
    case 'SALES_PIPELINE': {
      const dateRange = intent.entities.dateRange;
      const quarter = dateRange?.label?.startsWith('Q') ? dateRange.label : undefined;
      const pipeline = await crm.getPipelineSummary({ quarter }, sessionId);
      return {
        adaptiveCard: buildPipelineCard(pipeline, lang),
        language: lang,
        dataSource: 'CRM',
        text: `${s.sales.pipeline.total_value}: ${pipeline.totalPipelineValue}`,
      };
    }

    case 'SALES_PERFORMANCE': {
      const dateRange = intent.entities.dateRange ?? {
        from: new Date(new Date().getFullYear(), 0, 1),
        to: new Date(),
      };
      const performance = await crm.getSalesPerformance(dateRange, sessionId);
      return {
        adaptiveCard: buildPerformanceCard(performance, lang),
        language: lang,
        dataSource: 'CRM',
        text: s.sales.performance.title,
      };
    }

    case 'SALES_DEAL_DETAIL': {
      // If a specific deal ID or PO number is provided, look it up
      const dealId = intent.entities.poNumber ?? 'D-001'; // fallback to first deal in demo
      const deal = await crm.getDealDetail(dealId, sessionId);
      return {
        adaptiveCard: buildDealDetailCard(deal, lang),
        language: lang,
        dataSource: 'CRM',
        text: `${s.sales.deal.title}: ${deal.name}`,
      };
    }

    default: {
      // Fallback: show deals closing this month
      const deals = await crm.getDealsClosingThisMonth(sessionId);
      return {
        adaptiveCard: buildDealListCard(deals, lang),
        language: lang,
        dataSource: 'CRM',
        text: s.sales.pipeline.title,
      };
    }
  }
}
