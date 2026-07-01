/**
 * @file engine.ts
 * @description Channel-agnostic intent routing. Given a ParsedIntent, dispatches
 * to the correct domain handler (Sales / Inventory / Procurement / Help) and
 * returns a BotResponse. Shared by every channel (Teams, Web Chat, etc.) so
 * routing logic lives in exactly one place.
 */

import { ParsedIntent } from './nlp/intentParser';
import { handleSalesIntent } from './handlers/salesHandler';
import { handleInventoryIntent } from './handlers/inventoryHandler';
import { handleProcurementIntent } from './handlers/procurementHandler';
import { handleHelpIntent, handleUnknownIntent } from './handlers/helpHandler';
import { BotResponse } from './handlers/salesHandler';

/** Sales-related intents */
export const SALES_INTENTS = new Set(['SALES_PIPELINE', 'SALES_PERFORMANCE', 'SALES_DEAL_DETAIL']);
/** Inventory-related intents */
export const INVENTORY_INTENTS = new Set(['INVENTORY_LEVELS', 'INVENTORY_ALERTS', 'INVENTORY_SKU']);
/** Procurement-related intents */
export const PROCUREMENT_INTENTS = new Set([
  'PROCUREMENT_PO_STATUS',
  'PROCUREMENT_APPROVALS',
  'PROCUREMENT_SUPPLIER',
]);

/**
 * Route a parsed intent to the correct domain handler.
 * This is the single shared entry point used by every channel.
 *
 * @param parsedIntent - The classified intent with entities and language
 * @param userId - Identity of the requesting user (Azure AD object ID, or a demo user ID)
 * @param sessionId - Correlation ID for logging
 * @returns A channel-agnostic BotResponse
 */
export async function routeIntent(
  parsedIntent: ParsedIntent,
  userId: string,
  sessionId: string,
): Promise<BotResponse> {
  if (SALES_INTENTS.has(parsedIntent.intent)) {
    return handleSalesIntent(parsedIntent, userId, sessionId);
  }
  if (INVENTORY_INTENTS.has(parsedIntent.intent)) {
    return handleInventoryIntent(parsedIntent, sessionId);
  }
  if (PROCUREMENT_INTENTS.has(parsedIntent.intent)) {
    return handleProcurementIntent(parsedIntent, userId, sessionId);
  }
  if (parsedIntent.intent === 'HELP' || parsedIntent.intent === 'LANG_SWITCH') {
    return handleHelpIntent(parsedIntent);
  }
  return handleUnknownIntent(parsedIntent.detectedLanguage);
}
