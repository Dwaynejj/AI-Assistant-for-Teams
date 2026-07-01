/**
 * @file procurementHandler.ts
 * @description Handle all PROCUREMENT_* intents, call the ERP connector,
 * and return formatted BotResponse objects.
 */

import { ParsedIntent } from '../nlp/intentParser';
import { BotResponse } from './salesHandler';
import { ERPConnector } from '../connectors/erpConnector';
import {
  buildPOStatusCard,
  buildApprovalListCard,
  buildSupplierCard,
} from '../cards/adaptiveCards';
import enStrings from '../i18n/en.json';
import heStrings from '../i18n/he.json';

// Lazily constructed — ERPConnector reads config in its constructor, so it
// must not be instantiated at module load time (before initConfig() runs).
let erp: ERPConnector | undefined;
function getErp(): ERPConnector {
  if (!erp) erp = new ERPConnector();
  return erp;
}

/**
 * Handle procurement-related intents and return a BotResponse.
 *
 * @param intent - The parsed intent with entities and language
 * @param userId - Azure AD object ID of the user (for approval lookups)
 * @param sessionId - Correlation ID for logging
 * @returns BotResponse with Adaptive Card or plain text
 */
export async function handleProcurementIntent(
  intent: ParsedIntent,
  userId: string,
  sessionId: string,
): Promise<BotResponse> {
  const lang = intent.detectedLanguage;
  const s = lang === 'he' ? heStrings : enStrings;

  switch (intent.intent) {
    case 'PROCUREMENT_PO_STATUS': {
      const poNumber = intent.entities.poNumber;
      if (!poNumber) {
        // No specific PO number — show all open POs
        const openPOs = await getErp().getOpenPOs({}, sessionId);
        return {
          adaptiveCard: buildApprovalListCard(openPOs, lang),
          language: lang,
          dataSource: 'ERP',
          text: s.procurement.po_status.title,
        };
      }

      const po = await getErp().getPOStatus(poNumber, sessionId);
      return {
        adaptiveCard: buildPOStatusCard(po, lang),
        language: lang,
        dataSource: 'ERP',
        text: `${s.procurement.po_status.title}: ${poNumber}`,
      };
    }

    case 'PROCUREMENT_APPROVALS': {
      const pendingPOs = await getErp().getPendingApprovals(userId, sessionId);
      return {
        adaptiveCard: buildApprovalListCard(pendingPOs, lang),
        language: lang,
        dataSource: 'ERP',
        text: s.procurement.approvals.title,
      };
    }

    case 'PROCUREMENT_SUPPLIER': {
      // Extract category from text; fallback to "General"
      const text = intent.rawText.toLowerCase();
      let category = 'General';
      const categoryKeywords = [
        'electronics',
        'mechanical',
        'heavy',
        'electrical',
        'אלקטרוניקה',
        'מכני',
        'כבד',
      ];
      for (const kw of categoryKeywords) {
        if (text.includes(kw)) {
          category = kw;
          break;
        }
      }

      const suppliers = await getErp().getSuppliersByCategory(category, sessionId);
      return {
        adaptiveCard: buildSupplierCard(suppliers, lang),
        language: lang,
        dataSource: 'ERP',
        text: s.procurement.supplier.title,
      };
    }

    default: {
      // Fallback: show pending approvals
      const pendingPOs = await getErp().getPendingApprovals(userId, sessionId);
      return {
        adaptiveCard: buildApprovalListCard(pendingPOs, lang),
        language: lang,
        dataSource: 'ERP',
        text: s.procurement.approvals.title,
      };
    }
  }
}
