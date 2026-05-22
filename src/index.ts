/**
 * @file index.ts
 * @description Express app entry point for the Teams BI Agent.
 *
 * Bootstraps in this order:
 *  1. Load and validate configuration (fail-fast)
 *  2. Initialise Application Insights
 *  3. Create Bot Framework adapter
 *  4. Register routes: POST /api/messages, GET /health
 *  5. Start HTTP server
 *  6. Register uncaught exception handlers for graceful shutdown
 */

import express, { Request, Response } from 'express';
import { BotFrameworkAdapter } from 'botbuilder';
import { initConfig, initAppInsights, getConfig } from './utils/config';
import { logInfo, logError } from './utils/logger';
import { BIAgent } from './bot/biAgent';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

async function main(): Promise<void> {
  // ── Step 1: Load and validate config (fail-fast on missing keys) ──────────
  let config;
  try {
    config = await initConfig();
  } catch (err) {
    console.error('[Startup] Configuration error:', err);
    process.exit(1);
  }

  // ── Step 2: Initialise Application Insights (before anything else) ────────
  try {
    initAppInsights(config);
    logInfo('[Startup] Application Insights initialised');
  } catch (err) {
    console.warn('[Startup] Application Insights init failed (continuing):', err);
  }

  // ── Step 3: Create Bot Framework adapter ─────────────────────────────────
  const adapter = new BotFrameworkAdapter({
    appId: config.microsoftAppId,
    appPassword: config.microsoftAppPassword,
  });

  // On adapter error: log and send error activity
  adapter.onTurnError = async (context, error) => {
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
    adapter.processActivity(req, res, async (context) => {
      await bot.run(context);
    }).catch((err) => {
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
      timestamp: new Date().toISOString(),
    });
  });

  // ── Step 6: Start HTTP server ─────────────────────────────────────────────
  const server = app.listen(config.port, () => {
    logInfo(`[Startup] Teams BI Agent v${config.appVersion} started`, {
      port: String(config.port),
      environment: config.nodeEnv,
    });
    console.info(`✅ Teams BI Agent listening on port ${config.port}`);
    console.info(`   Health: http://localhost:${config.port}/health`);
    console.info(`   Bot endpoint: http://localhost:${config.port}/api/messages`);
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
