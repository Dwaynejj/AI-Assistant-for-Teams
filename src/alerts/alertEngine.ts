/**
 * @file alertEngine.ts
 * @description Threshold-based alert detection engine.
 * Checks inventory and procurement systems for threshold breaches
 * and deduplicates alerts to prevent re-sending within the check interval.
 */

import { InventoryConnector } from '../connectors/inventoryConnector';
import { ERPConnector } from '../connectors/erpConnector';
import { getConfig } from '../utils/config';
import { logAlert } from '../utils/logger';

/** Alert type identifiers */
export type AlertType = 'LOW_STOCK' | 'CRITICAL_STOCK' | 'PO_OVERDUE' | 'PO_PENDING_APPROVAL';

/** Alert severity level */
export type AlertSeverity = 'warning' | 'critical';

/** Configuration for alert thresholds */
export interface AlertConfig {
  lowStockThreshold: number;
  criticalStockThreshold: number;
  poOverdueDays: number;
  checkIntervalMinutes: number;
}

/** A detected alert ready to be sent */
export interface Alert {
  type: AlertType;
  severity: AlertSeverity;
  items: unknown[];
  detectedAt: Date;
  language: 'en' | 'he';
}

/** Deduplication entry: tracks when we last sent an alert of each type */
interface AlertDedupeEntry {
  sentAt: Date;
  itemSignature: string;
}

// In-memory deduplication store
const sentAlerts = new Map<string, AlertDedupeEntry>();

/**
 * Generate a stable signature for a set of alert items to detect duplicates.
 *
 * @param type - The alert type
 * @param items - The alert payload items
 * @returns A string signature for deduplication
 */
function buildAlertSignature(type: AlertType, items: unknown[]): string {
  const ids = (items as Array<{ skuCode?: string; poNumber?: string }>)
    .map((i) => i.skuCode ?? i.poNumber ?? 'unknown')
    .sort()
    .join(',');
  return `${type}:${ids}`;
}

/**
 * Check whether an alert has already been sent within the configured interval.
 * Suppresses duplicate alerts to prevent channel spam.
 *
 * @param type - The alert type
 * @param items - The alert items to deduplicate against
 * @param intervalMinutes - Minutes within which to suppress duplicates
 * @returns true if the alert was already sent recently
 */
function isDuplicate(type: AlertType, items: unknown[], intervalMinutes: number): boolean {
  const signature = buildAlertSignature(type, items);
  const existing = sentAlerts.get(signature);
  if (!existing) return false;

  const intervalMs = intervalMinutes * 60 * 1000;
  const elapsed = Date.now() - existing.sentAt.getTime();
  return elapsed < intervalMs;
}

/**
 * Mark an alert as sent for deduplication purposes.
 *
 * @param type - The alert type
 * @param items - The alert items
 */
function markAlertSent(type: AlertType, items: unknown[]): void {
  const signature = buildAlertSignature(type, items);
  sentAlerts.set(signature, {
    sentAt: new Date(),
    itemSignature: signature,
  });
}

/**
 * Run the full alert check cycle:
 * 1. Check for critical stock items
 * 2. Check for low stock items (above critical but below threshold)
 * 3. Check for overdue purchase orders
 * 4. Deduplicate against recently sent alerts
 *
 * @param config - Alert thresholds and interval configuration
 * @param language - Language to format alerts in (default: 'en')
 * @param sessionId - Correlation ID for logging
 * @returns Array of Alerts that should be sent
 */
export async function checkAlerts(
  config?: Partial<AlertConfig>,
  language: 'en' | 'he' = 'en',
  sessionId: string = 'alert-scheduler',
): Promise<Alert[]> {
  const appConfig = getConfig();
  const alertConfig: AlertConfig = {
    lowStockThreshold: config?.lowStockThreshold ?? appConfig.lowStockThreshold,
    criticalStockThreshold: config?.criticalStockThreshold ?? appConfig.criticalStockThreshold,
    poOverdueDays: config?.poOverdueDays ?? appConfig.poOverdueDays,
    checkIntervalMinutes: config?.checkIntervalMinutes ?? 30,
  };

  const inventory = new InventoryConnector();
  const erp = new ERPConnector();
  const alerts: Alert[] = [];

  // ── Check 1: Critical stock (below criticalStockThreshold) ───────────────
  try {
    const criticalItems = await inventory.getLowStockItems(
      alertConfig.criticalStockThreshold,
      sessionId,
    );

    if (criticalItems.length > 0 && !isDuplicate('CRITICAL_STOCK', criticalItems, alertConfig.checkIntervalMinutes)) {
      alerts.push({
        type: 'CRITICAL_STOCK',
        severity: 'critical',
        items: criticalItems,
        detectedAt: new Date(),
        language,
      });
      markAlertSent('CRITICAL_STOCK', criticalItems);
      logAlert('CRITICAL_STOCK', criticalItems.length, sessionId);
    }
  } catch (err) {
    console.error('[AlertEngine] Error checking critical stock:', err);
  }

  // ── Check 2: Low stock (above critical, below low threshold) ─────────────
  try {
    const allLowItems = await inventory.getLowStockItems(alertConfig.lowStockThreshold, sessionId);

    // Exclude items already captured as CRITICAL
    const lowOnlyItems = allLowItems.filter(
      (item) => item.onHand > alertConfig.criticalStockThreshold,
    );

    if (lowOnlyItems.length > 0 && !isDuplicate('LOW_STOCK', lowOnlyItems, alertConfig.checkIntervalMinutes)) {
      alerts.push({
        type: 'LOW_STOCK',
        severity: 'warning',
        items: lowOnlyItems,
        detectedAt: new Date(),
        language,
      });
      markAlertSent('LOW_STOCK', lowOnlyItems);
      logAlert('LOW_STOCK', lowOnlyItems.length, sessionId);
    }
  } catch (err) {
    console.error('[AlertEngine] Error checking low stock:', err);
  }

  // ── Check 3: Overdue purchase orders ─────────────────────────────────────
  try {
    const overduePOs = await erp.getOverduePOs(sessionId);

    if (overduePOs.length > 0 && !isDuplicate('PO_OVERDUE', overduePOs, alertConfig.checkIntervalMinutes)) {
      alerts.push({
        type: 'PO_OVERDUE',
        severity: 'warning',
        items: overduePOs,
        detectedAt: new Date(),
        language,
      });
      markAlertSent('PO_OVERDUE', overduePOs);
      logAlert('PO_OVERDUE', overduePOs.length, sessionId);
    }
  } catch (err) {
    console.error('[AlertEngine] Error checking overdue POs:', err);
  }

  return alerts;
}

/**
 * Clear the alert deduplication cache.
 * Useful for testing or when forcing re-send of all alerts.
 */
export function clearAlertCache(): void {
  sentAlerts.clear();
}
