/**
 * @file webChatRouter.ts
 * @description Express routes for the Web Chat demo channel — a browser-based
 * alternative to Microsoft Teams that requires no Azure Bot registration,
 * no Teams client, and no credentials. It drives the exact same engine
 * (NLP -> RBAC -> handlers -> Adaptive Cards) as the Teams channel
 * (`channels/teams/biAgent.ts`), just over a plain JSON REST API instead of
 * the Bot Framework activity protocol.
 *
 * Every request runs as a fixed demo identity. In non-production mode RBAC
 * (`core/auth/rbac.ts`) already grants ADMIN to everyone, so the demo user
 * can try every Sales / Inventory / Procurement feature immediately.
 */

import { randomUUID } from 'crypto';
import { Router, Request, Response } from 'express';
import { parseIntent } from '../../core/nlp/intentParser';
import { hasAccess } from '../../core/auth/rbac';
import { routeIntent } from '../../core/engine';
import { checkAlerts, clearAlertCache } from '../../core/alerts/alertEngine';
import { formatAlert } from '../../core/alerts/alertFormatter';
import { buildWelcomeCard, buildErrorCard } from '../../core/cards/adaptiveCards';
import { getConfig } from '../../core/utils/config';
import { logQuery, logError } from '../../core/utils/logger';
import { getOrCreateSession, updateSession } from './webSession';
import enStrings from '../../core/i18n/en.json';
import heStrings from '../../core/i18n/he.json';

/** Fixed identity used for every Web Chat demo request */
const DEMO_USER_ID = 'demo-user';
const DEMO_USER_UPN = 'demo@local';

function stringsFor(lang: 'en' | 'he'): typeof enStrings {
  return lang === 'he' ? (heStrings as unknown as typeof enStrings) : enStrings;
}

/**
 * Build the Express router that serves the Web Chat demo API.
 * Mounted by `src/server.ts` alongside the Teams `/api/messages` endpoint.
 *
 * @returns A configured Express Router
 */
export function createWebChatRouter(): Router {
  const router = Router();

  /**
   * GET /api/welcome — returns the same welcome Adaptive Card shown to new
   * Teams users, so the web chat can render an identical first message.
   */
  router.get('/api/welcome', (req: Request, res: Response) => {
    const lang = req.query['lang'] === 'he' ? 'he' : getConfig().defaultLanguage;
    res.json({ adaptiveCard: buildWelcomeCard(lang), language: lang });
  });

  /**
   * POST /api/chat — the core Web Chat endpoint.
   * Body: { sessionId?: string, text: string }
   * Response: { sessionId, text, adaptiveCard, language }
   */
  router.post('/api/chat', (req: Request, res: Response) => {
    handleChat(req, res).catch((err) => {
      logError(err instanceof Error ? err : new Error(String(err)), { channel: 'web' }, 'unknown');
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    });
  });

  /**
   * GET /api/alerts/preview?lang=en|he — runs the same threshold-based alert
   * engine used by the Azure Function scheduler (`functions/alertScheduler`)
   * on demand, so a non-technical user can see what a proactive Teams channel
   * alert would look like without waiting for the 30-minute timer or needing
   * a real Teams channel configured.
   */
  router.get('/api/alerts/preview', (req: Request, res: Response) => {
    handleAlertsPreview(req, res).catch((err) => {
      logError(err instanceof Error ? err : new Error(String(err)), { channel: 'web' }, 'unknown');
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    });
  });

  return router;
}

/**
 * Handle POST /api/chat. Extracted as a standalone async function (rather than
 * an inline async route handler) so Express never receives an unhandled
 * rejected promise from a route callback.
 */
async function handleChat(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const body = req.body as { sessionId?: string; text?: string };
  const sessionId =
    typeof body.sessionId === 'string' && body.sessionId ? body.sessionId : randomUUID();
  const text = typeof body.text === 'string' ? body.text : '';

  if (!text.trim()) {
    res.status(400).json({ error: 'A non-empty "text" field is required.' });
    return;
  }

  const config = getConfig();
  const session = getOrCreateSession(sessionId, config.defaultLanguage);

  try {
    const parsedIntent = await parseIntent(text);
    let language = parsedIntent.detectedLanguage;

    if (parsedIntent.intent === 'LANG_SWITCH' && parsedIntent.entities.language) {
      language = parsedIntent.entities.language;
    } else if (parsedIntent.confidence < 0.3) {
      // Low-confidence classification — stick with the session's known language
      language = session.lastLanguage;
    }

    const s = stringsFor(language);
    const allowed = await hasAccess(DEMO_USER_ID, parsedIntent.intent);

    if (!allowed) {
      updateSession(sessionId, {
        lastLanguage: language,
        lastIntent: parsedIntent.intent,
        interactionCount: session.interactionCount + 1,
      });
      logQuery(
        {
          userId: DEMO_USER_ID,
          userUpn: DEMO_USER_UPN,
          intent: parsedIntent.intent,
          dataSourceAccessed: 'RBAC',
          responseTimeMs: Date.now() - startTime,
          success: false,
          language,
          timestamp: new Date(),
        },
        sessionId,
      );
      res.json({
        sessionId,
        text: s.error.permission_denied,
        adaptiveCard: buildErrorCard(s.error.permission_denied, language),
        language,
      });
      return;
    }

    const botResponse = await routeIntent(parsedIntent, DEMO_USER_ID, sessionId);

    updateSession(sessionId, {
      lastLanguage: language,
      lastIntent: parsedIntent.intent,
      interactionCount: session.interactionCount + 1,
    });

    logQuery(
      {
        userId: DEMO_USER_ID,
        userUpn: DEMO_USER_UPN,
        intent: parsedIntent.intent,
        dataSourceAccessed: botResponse.dataSource,
        responseTimeMs: Date.now() - startTime,
        success: true,
        language,
        timestamp: new Date(),
      },
      sessionId,
    );

    res.json({
      sessionId,
      text: botResponse.text,
      adaptiveCard: botResponse.adaptiveCard,
      language,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logError(error, { channel: 'web' }, sessionId);

    const lang = session.lastLanguage;
    const s = stringsFor(lang);
    const errorMessage = error.message.includes('not found')
      ? s.error.no_data
      : error.message.includes('timeout')
        ? s.error.timeout
        : s.error.generic;

    res.status(500).json({
      sessionId,
      text: errorMessage,
      adaptiveCard: buildErrorCard(errorMessage, lang),
      language: lang,
    });
  }
}

/**
 * Handle GET /api/alerts/preview. Extracted as a standalone async function
 * for the same reason as `handleChat` above.
 */
async function handleAlertsPreview(req: Request, res: Response): Promise<void> {
  const lang = req.query['lang'] === 'he' ? 'he' : 'en';
  try {
    // Always clear dedup cache first so the demo reliably shows alerts
    // every time the user clicks "Preview Alerts", regardless of history.
    clearAlertCache();
    const alerts = await checkAlerts(undefined, lang, 'web-demo');
    const formatted = alerts.map((alert) => formatAlert(alert));
    res.json({ alerts: formatted });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logError(error, { channel: 'web', context: 'alerts-preview' }, 'web-demo');
    res.status(500).json({ error: 'Failed to generate alert preview.' });
  }
}
