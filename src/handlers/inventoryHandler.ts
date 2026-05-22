/**
 * @file inventoryHandler.ts
 * @description Handle all INVENTORY_* intents, call the Inventory connector,
 * and return formatted BotResponse objects.
 */

import { ParsedIntent } from '../nlp/intentParser';
import { BotResponse } from './salesHandler';
import { InventoryConnector } from '../connectors/inventoryConnector';
import {
  buildInventoryAlertCard,
  buildStockDetailCard,
} from '../bot/adaptiveCards';
import { getConfig } from '../utils/config';
import enStrings from '../i18n/en.json';
import heStrings from '../i18n/he.json';

const inventory = new InventoryConnector();

/**
 * Handle inventory-related intents and return a BotResponse.
 *
 * @param intent - The parsed intent with entities and language
 * @param sessionId - Correlation ID for logging
 * @returns BotResponse with Adaptive Card or plain text
 */
export async function handleInventoryIntent(
  intent: ParsedIntent,
  sessionId: string,
): Promise<BotResponse> {
  const lang = intent.detectedLanguage;
  const s = lang === 'he' ? heStrings : enStrings;
  const config = getConfig();

  switch (intent.intent) {
    case 'INVENTORY_LEVELS': {
      const snapshot = await inventory.getWarehouseSnapshot(undefined, sessionId);
      const items = snapshot.items;
      return {
        adaptiveCard: buildInventoryAlertCard(items, lang, config.criticalStockThreshold),
        language: lang,
        dataSource: 'Inventory',
        text: s.inventory.title,
      };
    }

    case 'INVENTORY_ALERTS': {
      const lowItems = await inventory.getLowStockItems(config.lowStockThreshold, sessionId);
      return {
        adaptiveCard: buildInventoryAlertCard(lowItems, lang, config.criticalStockThreshold),
        language: lang,
        dataSource: 'Inventory',
        text: s.inventory.critical_alert,
      };
    }

    case 'INVENTORY_SKU': {
      const skuCode = intent.entities.skuCode;
      if (!skuCode) {
        return {
          text: lang === 'he' ? 'אנא ציין קוד מוצר, לדוגמה: SKU-0042' : 'Please specify a SKU code, e.g. SKU-0042',
          language: lang,
          dataSource: 'Inventory',
        };
      }

      const item = await inventory.getStockBySKU(skuCode, sessionId);
      return {
        adaptiveCard: buildStockDetailCard(item, lang),
        language: lang,
        dataSource: 'Inventory',
        text: `${s.inventory.sku}: ${skuCode}`,
      };
    }

    default: {
      // Fallback: show low stock alert
      const lowItems = await inventory.getLowStockItems(config.lowStockThreshold, sessionId);
      return {
        adaptiveCard: buildInventoryAlertCard(lowItems, lang, config.criticalStockThreshold),
        language: lang,
        dataSource: 'Inventory',
        text: s.inventory.low_stock,
      };
    }
  }
}
