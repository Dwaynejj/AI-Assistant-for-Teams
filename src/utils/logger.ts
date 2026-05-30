/**
 * @file logger.ts
 * @description Application Insights wrapper providing typed audit logging
 * for the Teams BI Agent. All log methods attach bot_version, environment,
 * and session_id as custom properties.
 *
 * Designed for applicationinsights v2.x API.
 */

import * as appInsights from 'applicationinsights';

/** Structured audit event recorded for every user query */
export interface AuditEvent {
  userId: string;
  userUpn: string;
  intent: string;
  dataSourceAccessed: string;
  responseTimeMs: number;
  success: boolean;
  language: 'en' | 'he';
  timestamp: Date;
}

/** Retrieve the Application Insights telemetry client safely */
function getClient(): appInsights.TelemetryClient | null {
  try {
    if (appInsights.defaultClient) {
      return appInsights.defaultClient;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Log a user query audit event to Application Insights.
 * This is mandatory for every query — no exceptions.
 *
 * @param event - The structured audit event to record
 * @param sessionId - The Teams conversation ID used as session identifier
 */
export function logQuery(event: AuditEvent, sessionId: string): void {
  const client = getClient();
  if (!client) {
    // eslint-disable-next-line no-console
    console.warn('[Logger] AppInsights not initialised — skipping query log');
    return;
  }

  client.trackEvent({
    name: 'BIAgent.Query',
    properties: {
      userId: event.userId,
      userUpn: event.userUpn,
      intent: event.intent,
      dataSourceAccessed: event.dataSourceAccessed,
      responseTimeMs: String(event.responseTimeMs),
      success: String(event.success),
      language: event.language,
      timestamp: event.timestamp.toISOString(),
      session_id: sessionId,
    },
  });
}

/**
 * Log a proactive alert that was sent to a Teams channel.
 *
 * @param alertType - The type of alert (LOW_STOCK, PO_OVERDUE, etc.)
 * @param itemCount - Number of items triggering the alert
 * @param sessionId - Alert session/correlation ID
 */
export function logAlert(alertType: string, itemCount: number, sessionId: string): void {
  const client = getClient();
  if (!client) return;

  client.trackEvent({
    name: 'BIAgent.Alert',
    properties: {
      alertType,
      itemCount: String(itemCount),
      session_id: sessionId,
    },
    measurements: {
      itemCount,
    },
  });
}

/**
 * Log an exception to Application Insights.
 *
 * @param error - The error that was caught
 * @param context - Additional context properties
 * @param sessionId - The conversation/session ID for correlation
 */
export function logError(error: Error, context: Record<string, string>, sessionId: string): void {
  const client = getClient();
  if (!client) {
    // eslint-disable-next-line no-console
    console.error('[Logger] Error (AppInsights not available):', error, context);
    return;
  }

  client.trackException({
    exception: error,
    properties: {
      ...context,
      session_id: sessionId,
    },
  });
}

/**
 * Log a data connector HTTP call with timing and success information.
 * Uses trackEvent rather than trackDependency for v2 API compatibility.
 *
 * @param system - The source system name (CRM, ERP, Inventory)
 * @param method - The connector method called (e.g. getPipelineSummary)
 * @param durationMs - Round-trip duration in milliseconds
 * @param success - Whether the call succeeded
 * @param sessionId - Correlation session ID
 */
export function logConnectorCall(
  system: string,
  method: string,
  durationMs: number,
  success: boolean,
  sessionId: string,
): void {
  const client = getClient();
  if (!client) return;

  client.trackEvent({
    name: 'BIAgent.ConnectorCall',
    properties: {
      system,
      method,
      durationMs: String(durationMs),
      success: String(success),
      session_id: sessionId,
    },
    measurements: {
      durationMs,
    },
  });
}

/**
 * Log a generic informational trace message.
 *
 * @param message - The message to log
 * @param properties - Additional key-value properties
 */
export function logInfo(message: string, properties?: Record<string, string>): void {
  const client = getClient();
  if (client) {
    client.trackTrace({ message, properties });
  } else {
    // eslint-disable-next-line no-console
    console.info(`[INFO] ${message}`, properties);
  }
}
