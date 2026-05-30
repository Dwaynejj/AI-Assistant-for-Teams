/**
 * @file teamsNotifier.ts
 * @description Push proactive alert cards to configured Teams channels.
 * Uses the Bot Framework REST API to post proactive messages.
 *
 * Implementation note: In a full production deployment, the bot would
 * store a ConversationReference when first added to a team, and then use
 * adapter.continueConversation() to send proactive messages. For MVP,
 * we use the Bot Framework REST API directly via the connector service.
 */

import axios from 'axios';
import { CardFactory } from 'botbuilder';
import { Alert } from './alertEngine';
import { formatAlert } from './alertFormatter';
import { getConfig } from '../utils/config';
import { logAlert, logError, logInfo } from '../utils/logger';

/** Cache for the Bot Framework access token */
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Obtain a Bot Framework access token using OAuth2 client credentials.
 *
 * @returns A valid Bearer token for the Bot Framework service
 */
async function getBotToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const config = getConfig();
  const tokenUrl = `https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token`;

  const response = await axios.post<{ access_token: string; expires_in: number }>(
    tokenUrl,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.microsoftAppId,
      client_secret: config.microsoftAppPassword,
      scope: 'https://api.botframework.com/.default',
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );

  cachedToken = {
    token: response.data.access_token,
    expiresAt: Date.now() + response.data.expires_in * 1000,
  };

  return cachedToken.token;
}

/**
 * Send a list of detected alerts to the configured Teams channel.
 * Each alert is formatted and posted as an individual Adaptive Card message.
 *
 * @param alerts - Array of Alert objects to send
 * @param sessionId - Correlation ID for logging
 */
export async function sendAlertsToTeams(
  alerts: Alert[],
  sessionId: string = 'notifier',
): Promise<void> {
  if (alerts.length === 0) return;

  const config = getConfig();

  let token: string;
  try {
    token = await getBotToken();
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logError(error, { context: 'teamsNotifier.getBotToken' }, sessionId);
    return;
  }

  for (const alert of alerts) {
    try {
      const formatted = formatAlert(alert);

      // Build the Bot Framework activity payload
      const activity = {
        type: 'message',
        attachments: [CardFactory.adaptiveCard(formatted.adaptiveCard)],
        channelData: {
          channel: { id: config.alertTeamsChannelId },
          team: { id: config.alertTeamsTeamId },
          tenant: { id: config.aadTenantId },
        },
      };

      // Post to the Bot Framework conversation endpoint
      const serviceUrl = config.botServiceUrl.endsWith('/')
        ? config.botServiceUrl
        : `${config.botServiceUrl}/`;
      const endpoint = `${serviceUrl}v3/conversations/${encodeURIComponent(config.alertTeamsChannelId)}/activities`;

      await axios.post(endpoint, activity, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 15_000,
      });

      logAlert(alert.type, alert.items.length, sessionId);
      logInfo(`[TeamsNotifier] Sent ${alert.type} alert (${alert.items.length} items)`);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logError(error, { alertType: alert.type, context: 'teamsNotifier.send' }, sessionId);
      // Continue to next alert — partial delivery is better than no delivery
    }
  }
}
