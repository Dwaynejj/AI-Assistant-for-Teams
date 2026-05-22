/**
 * @file functions/alertScheduler/index.ts
 * @description Azure Function timer trigger — runs every 30 minutes to check
 * for inventory and procurement threshold breaches and push alerts to Teams.
 *
 * This function runs independently from the main bot Express app.
 * Errors are caught locally and logged — a failed check does NOT crash the Function.
 */

import { AzureFunction, Context } from '@azure/functions';
import { initConfig, initAppInsights } from '../../src/utils/config';
import { checkAlerts } from '../../src/alerts/alertEngine';
import { sendAlertsToTeams } from '../../src/alerts/teamsNotifier';
import { logInfo, logError } from '../../src/utils/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Timer-triggered Azure Function that runs every 30 minutes.
 * Initialises configuration, runs alert detection, and sends any triggered alerts.
 *
 * @param context - Azure Function execution context
 * @param myTimer - Timer trigger binding
 */
const timerTrigger: AzureFunction = async function (context: Context): Promise<void> {
  const sessionId = `alert-${uuidv4()}`;
  context.log(`[AlertScheduler] Running alert check at ${new Date().toISOString()}`);

  try {
    // Initialise config and Application Insights for this function invocation
    const config = await initConfig();
    initAppInsights(config);

    logInfo('[AlertScheduler] Starting alert check cycle', { sessionId });

    // Run full alert check across all systems
    const alerts = await checkAlerts(
      {
        lowStockThreshold: config.lowStockThreshold,
        criticalStockThreshold: config.criticalStockThreshold,
        poOverdueDays: config.poOverdueDays,
        checkIntervalMinutes: 30,
      },
      'en', // Alerts are sent in English; extend with per-channel language config post-MVP
      sessionId,
    );

    context.log(`[AlertScheduler] Found ${alerts.length} alert(s) to send`);
    logInfo(`[AlertScheduler] ${alerts.length} alert(s) detected`, {
      sessionId,
      count: String(alerts.length),
    });

    if (alerts.length > 0) {
      // Send alerts to the configured Teams channel
      await sendAlertsToTeams(alerts, sessionId);
      context.log(`[AlertScheduler] Successfully sent ${alerts.length} alert(s)`);
    } else {
      context.log('[AlertScheduler] No threshold breaches detected. All systems normal.');
    }
  } catch (err) {
    // Log the error but do NOT re-throw — a failed check must not crash the Function
    const error = err instanceof Error ? err : new Error(String(err));
    logError(error, { context: 'AlertScheduler', sessionId }, sessionId);
    context.log.error('[AlertScheduler] Alert check failed:', error.message);
    // The Function completes successfully even on error — next run will retry
  }
};

export default timerTrigger;
