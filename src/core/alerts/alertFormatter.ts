/**
 * @file alertFormatter.ts
 * @description Format alert payloads into Adaptive Card JSON for Teams channel posting.
 */

import { Alert } from './alertEngine';
import { buildInventoryAlertCard, buildApprovalListCard } from '../cards/adaptiveCards';
import { StockItem } from '../connectors/inventoryConnector';
import { PurchaseOrder } from '../connectors/erpConnector';
import { getConfig } from '../utils/config';

/** Formatted alert ready for sending to Teams */
export interface FormattedAlert {
  /** Adaptive Card JSON for the Teams message */
  adaptiveCard: object;
  /** Plain text summary for notification preview */
  summaryText: string;
  /** Display language */
  language: 'en' | 'he';
  /** Alert type for logging */
  alertType: string;
}

/**
 * Format an Alert object into a Teams-sendable Adaptive Card.
 *
 * @param alert - The Alert to format
 * @returns A FormattedAlert ready for delivery via TeamsNotifier
 */
export function formatAlert(alert: Alert): FormattedAlert {
  const config = getConfig();
  const lang = alert.language;

  switch (alert.type) {
    case 'CRITICAL_STOCK':
    case 'LOW_STOCK': {
      const stockItems = alert.items as StockItem[];
      const card = buildInventoryAlertCard(stockItems, lang, config.criticalStockThreshold);
      const itemList = stockItems
        .map((i) => `• ${i.skuCode}: ${i.productName} — ${i.onHand} units remaining`)
        .join('\n');
      return {
        adaptiveCard: card,
        summaryText: `${alert.type === 'CRITICAL_STOCK' ? '🔴 Critical' : '🟡 Low'} Stock Alert:\n${itemList}`,
        language: lang,
        alertType: alert.type,
      };
    }

    case 'PO_OVERDUE': {
      const pos = alert.items as PurchaseOrder[];
      const card = buildApprovalListCard(pos, lang);
      const poList = pos
        .map((po) => `• ${po.poNumber}: ${po.supplier} — ${po.daysOverdue ?? 0} days overdue`)
        .join('\n');
      return {
        adaptiveCard: card,
        summaryText: `⚠️ Overdue PO Alert:\n${poList}`,
        language: lang,
        alertType: alert.type,
      };
    }

    case 'PO_PENDING_APPROVAL': {
      const pos = alert.items as PurchaseOrder[];
      const card = buildApprovalListCard(pos, lang);
      return {
        adaptiveCard: card,
        summaryText: `📋 ${pos.length} POs awaiting approval`,
        language: lang,
        alertType: alert.type,
      };
    }
  }
}
