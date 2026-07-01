/* eslint-disable no-console */
/**
 * @file server.ts
 * @description Express app entry point for the Teams BI Agent.
 *
 * Bootstraps in this order:
 *  1. Load and validate configuration (fail-fast in production, demo defaults locally)
 *  2. Initialise Application Insights (skipped automatically in demo mode)
 *  3. Create Bot Framework adapter (Teams channel)
 *  4. Register routes:
 *       POST /api/messages     — Bot Framework activity endpoint (Teams)
 *       GET  /health           — health check
 *       POST /api/chat         — Web Chat demo channel (no Teams/Azure required)
 *       GET  /api/welcome      — Web Chat welcome card
 *       GET  /api/alerts/preview — Web Chat proactive-alert preview
 *       GET  /                 — Web Chat static UI
 *  5. Start HTTP server
 *  6. Register uncaught exception handlers for graceful shutdown
 */

import path from 'path';
import express, { Request, Response } from 'express';
import { BotFrameworkAdapter } from 'botbuilder';
import { initConfig, initAppInsights } from './core/utils/config';
import { logInfo, logError } from './core/utils/logger';
import { BIAgent } from './channels/teams/biAgent';
import { createWebChatRouter } from './channels/web/webChatRouter';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

async function main(): Promise<void> {
  // ── Step 1: Load and validate config (fail-fast on missing keys in prod) ──
  let config;
  try {
    config = await initConfig();
  } catch (err) {
    console.error('[Startup] Configuration error:', err);
    process.exit(1);
  }

  // ── Step 2: Initialise Application Insights (no-op in demo mode) ──────────
  try {
    initAppInsights(config);
    if (config.appInsightsInstrumentationKey || config.appInsightsConnectionString) {
      logInfo('[Startup] Application Insights initialised');
    }
  } catch (err) {
    console.warn('[Startup] Application Insights init failed (continuing):', err);
  }

  if (config.demoMode) {
    console.info(
      '[Startup] Running in local demo mode — using mock data, no Azure/Teams credentials required.',
    );
  }

  // ── Step 3: Create Bot Framework adapter (Teams channel) ──────────────────
  const adapter = new BotFrameworkAdapter({
    appId: config.microsoftAppId,
    appPassword: config.microsoftAppPassword,
  });

  // On adapter error: log and send error activity
  adapter.onTurnError = async (context, error): Promise<void> => {
    console.error('[Adapter] Unhandled error:', error);
    logError(error, { context: 'BotFrameworkAdapter.onTurnError' }, 'adapter-error');

    // Clear conversation state to prevent the error from recurring
    await context.sendTraceActivity(
      'OnTurnError Trace',
      `${error.message}`,
      'https://www.botframework.com/schemas/error',
      'TurnError',
    );

    // Send a user-facing error message
    await context.sendActivity(
      '⚠️ Something went wrong. Please try again. | משהו השתבש. אנא נסה שוב.',
    );
  };

  // ── Step 4: Instantiate the bot ───────────────────────────────────────────
  const bot = new BIAgent();

  // ── Step 5: Register routes ───────────────────────────────────────────────

  /**
   * POST /api/messages — Bot Framework activity endpoint.
   * The Bot Framework service posts all channel activities here.
   * NEVER bypass the adapter's token validation on this endpoint.
   */
  app.post('/api/messages', (req: Request, res: Response) => {
    adapter
      .processActivity(req, res, async (context) => {
        await bot.run(context);
      })
      .catch((err) => {
        console.error('[Route /api/messages] Unhandled error:', err);
      });
  });

  /**
   * GET /health — Health check endpoint for Azure App Service and load balancers.
   * Returns 200 with basic runtime information.
   */
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      version: config.appVersion,
      uptime: Math.floor(process.uptime()),
      environment: config.nodeEnv,
      demoMode: config.demoMode,
      timestamp: new Date().toISOString(),
    });
  });

  // Web Chat demo channel — /api/chat, /api/welcome, /api/alerts/preview
  app.use(createWebChatRouter());

  // Static Web Chat UI. Works both under ts-node (src/channels/web/public)
  // and the compiled build (dist/channels/web/public — copied there by
  // `npm run build`, see scripts/copyAssets.js).
  app.use(express.static(path.join(__dirname, 'channels', 'web', 'public')));

  // ── Step 6: Start HTTP server ─────────────────────────────────────────────
  const server = app.listen(config.port, () => {
    logInfo(`[Startup] Teams BI Agent v${config.appVersion} started`, {
      port: String(config.port),
      environment: config.nodeEnv,
    });
    console.info(`✅ Teams BI Agent listening on port ${config.port}`);
    console.info(`   🌐 Try it now (no setup needed): http://localhost:${config.port}`);
    console.info(`   🩺 Health check: http://localhost:${config.port}/health`);
    console.info(`   🤖 Teams bot endpoint: http://localhost:${config.port}/api/messages`);
  });

  // ── Step 7: Graceful shutdown handlers ────────────────────────────────────
  const shutdown = (signal: string): void => {
    console.info(`[Shutdown] Received ${signal}. Closing HTTP server...`);
    server.close(() => {
      console.info('[Shutdown] Server closed. Exiting.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (error) => {
    logError(error, { context: 'uncaughtException' }, 'process-error');
    console.error('[Process] Uncaught exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logError(error, { context: 'unhandledRejection' }, 'process-error');
    console.error('[Process] Unhandled rejection:', reason);
    process.exit(1);
  });
}

// Start the application
main().catch((err) => {
  console.error('[Startup] Fatal error during startup:', err);
  process.exit(1);
});
