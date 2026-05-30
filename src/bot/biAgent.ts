/**
 * @file biAgent.ts
 * @description Main bot class for the Teams BI Agent.
 * Extends ActivityHandler from botbuilder and orchestrates:
 *  - Language detection
 *  - Intent parsing
 *  - RBAC enforcement
 *  - Handler delegation
 *  - Audit logging
 *  - Error handling
 */

import { ActivityHandler, TurnContext, CardFactory, MessageFactory } from 'botbuilder';
import { v4 as uuidv4 } from 'uuid';
import { parseIntent } from '../nlp/intentParser';
import { handleSalesIntent } from '../handlers/salesHandler';
import { handleInventoryIntent } from '../handlers/inventoryHandler';
import { handleProcurementIntent } from '../handlers/procurementHandler';
import { handleHelpIntent, handleUnknownIntent } from '../handlers/helpHandler';
import { hasAccess } from '../auth/rbac';
import { extractUserIdentity } from '../auth/aadAuth';
import { logQuery, logError } from '../utils/logger';
import {
  createConversationDataAccessor,
  createUserDataAccessor,
  getConversationData,
  saveState,
} from './conversationState';
import { buildWelcomeCard, buildErrorCard } from './adaptiveCards';
import { getConfig } from '../utils/config';
import enStrings from '../i18n/en.json';
import heStrings from '../i18n/he.json';

/** Sales-related intents */
const SALES_INTENTS = new Set(['SALES_PIPELINE', 'SALES_PERFORMANCE', 'SALES_DEAL_DETAIL']);
/** Inventory-related intents */
const INVENTORY_INTENTS = new Set(['INVENTORY_LEVELS', 'INVENTORY_ALERTS', 'INVENTORY_SKU']);
/** Procurement-related intents */
const PROCUREMENT_INTENTS = new Set([
  'PROCUREMENT_PO_STATUS',
  'PROCUREMENT_APPROVALS',
  'PROCUREMENT_SUPPLIER',
]);

/**
 * BIAgent is the main Teams bot class.
 * It handles all incoming messages, routes them through the NLP/RBAC/Handler pipeline,
 * and sends Adaptive Card responses back to users.
 */
export class BIAgent extends ActivityHandler {
  private readonly conversationDataAccessor;
  private readonly userDataAccessor;

  constructor() {
    super();

    this.conversationDataAccessor = createConversationDataAccessor();
    this.userDataAccessor = createUserDataAccessor();

    // ── On Members Added: send welcome card ──────────────────────────────────
    this.onMembersAdded(async (context, next) => {
      const membersAdded = context.activity.membersAdded ?? [];
      const config = getConfig();

      for (const member of membersAdded) {
        // Don't welcome the bot itself
        if (member.id !== context.activity.recipient.id) {
          try {
            const welcomeCard = buildWelcomeCard(config.defaultLanguage);
            const cardAttachment = CardFactory.adaptiveCard(welcomeCard);
            await context.sendActivity(MessageFactory.attachment(cardAttachment));
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            logError(error, { context: 'onMembersAdded' }, 'welcome');
          }
        }
      }

      await next();
    });

    // ── On Message: main query processing pipeline ───────────────────────────
    this.onMessage(async (context, next) => {
      const sessionId = uuidv4();
      const startTime = Date.now();

      // Extract user identity from the activity
      const userIdentity = extractUserIdentity(context);

      // Load conversation state
      const conversationData = await getConversationData(context, this.conversationDataAccessor);

      // Get user preferences
      const userData = await this.userDataAccessor.get(context, {});

      // Handle submit actions from Adaptive Card buttons
      const value = context.activity.value as Record<string, string> | undefined;
      let messageText = context.activity.text ?? '';

      if (value?.action === 'quick_query' && value.query) {
        messageText = value.query;
      }

      if (!messageText.trim()) {
        await next();
        return;
      }

      let detectedLanguage: 'en' | 'he' =
        userData.preferredLanguage ?? conversationData.lastLanguage;

      try {
        // ── Parse intent ──────────────────────────────────────────────────────
        const parsedIntent = await parseIntent(messageText);
        detectedLanguage = parsedIntent.detectedLanguage;

        // Update user language preference on explicit switch
        if (parsedIntent.intent === 'LANG_SWITCH' && parsedIntent.entities.language) {
          userData.preferredLanguage = parsedIntent.entities.language;
          detectedLanguage = parsedIntent.entities.language;
        }

        const s = detectedLanguage === 'he' ? heStrings : enStrings;

        // ── RBAC enforcement ──────────────────────────────────────────────────
        const allowed = await hasAccess(userIdentity.objectId, parsedIntent.intent);
        if (!allowed) {
          const deniedCard = buildErrorCard(s.error.permission_denied, detectedLanguage);
          await context.sendActivity(
            MessageFactory.attachment(CardFactory.adaptiveCard(deniedCard)),
          );
          await this.updateState(
            context,
            conversationData,
            userData,
            detectedLanguage,
            parsedIntent.intent,
          );

          logQuery(
            {
              userId: userIdentity.objectId,
              userUpn: userIdentity.upn,
              intent: parsedIntent.intent,
              dataSourceAccessed: 'RBAC',
              responseTimeMs: Date.now() - startTime,
              success: false,
              language: detectedLanguage,
              timestamp: new Date(),
            },
            sessionId,
          );
          await next();
          return;
        }

        // ── Route to correct handler ──────────────────────────────────────────
        let botResponse;

        if (SALES_INTENTS.has(parsedIntent.intent)) {
          botResponse = await handleSalesIntent(parsedIntent, userIdentity.objectId, sessionId);
        } else if (INVENTORY_INTENTS.has(parsedIntent.intent)) {
          botResponse = await handleInventoryIntent(parsedIntent, sessionId);
        } else if (PROCUREMENT_INTENTS.has(parsedIntent.intent)) {
          botResponse = await handleProcurementIntent(
            parsedIntent,
            userIdentity.objectId,
            sessionId,
          );
        } else if (parsedIntent.intent === 'HELP' || parsedIntent.intent === 'LANG_SWITCH') {
          botResponse = handleHelpIntent(parsedIntent);
        } else {
          botResponse = handleUnknownIntent(detectedLanguage);
        }

        // ── Send response ─────────────────────────────────────────────────────
        if (botResponse.adaptiveCard) {
          const card = CardFactory.adaptiveCard(botResponse.adaptiveCard);
          await context.sendActivity(MessageFactory.attachment(card));
        } else if (botResponse.text) {
          await context.sendActivity(botResponse.text);
        }

        // ── Audit log ─────────────────────────────────────────────────────────
        logQuery(
          {
            userId: userIdentity.objectId,
            userUpn: userIdentity.upn,
            intent: parsedIntent.intent,
            dataSourceAccessed: botResponse.dataSource,
            responseTimeMs: Date.now() - startTime,
            success: true,
            language: detectedLanguage,
            timestamp: new Date(),
          },
          sessionId,
        );

        await this.updateState(
          context,
          conversationData,
          userData,
          detectedLanguage,
          parsedIntent.intent,
        );
      } catch (err) {
        // ── Error handling ────────────────────────────────────────────────────
        const error = err instanceof Error ? err : new Error(String(err));
        logError(error, { userId: userIdentity.objectId, intent: 'ERROR' }, sessionId);

        const s = detectedLanguage === 'he' ? heStrings : enStrings;
        const errorMessage = error.message.includes('not found')
          ? s.error.no_data
          : error.message.includes('timeout')
            ? s.error.timeout
            : s.error.generic;

        const errorCard = buildErrorCard(errorMessage, detectedLanguage);
        await context.sendActivity(MessageFactory.attachment(CardFactory.adaptiveCard(errorCard)));

        logQuery(
          {
            userId: userIdentity.objectId,
            userUpn: userIdentity.upn,
            intent: 'ERROR',
            dataSourceAccessed: 'unknown',
            responseTimeMs: Date.now() - startTime,
            success: false,
            language: detectedLanguage,
            timestamp: new Date(),
          },
          sessionId,
        );
      }

      await next();
    });
  }

  /**
   * Update conversation and user state after a successful turn.
   *
   * @param context - The current TurnContext
   * @param conversationData - Mutable conversation data
   * @param userData - Mutable user data
   * @param language - The language used in the response
   * @param intent - The intent that was processed
   */
  private async updateState(
    context: TurnContext,
    conversationData: {
      lastLanguage: 'en' | 'he';
      lastIntent: string;
      interactionCount: number;
      lastInteraction?: string;
    },
    userData: { preferredLanguage?: 'en' | 'he'; displayName?: string },
    language: 'en' | 'he',
    intent: string,
  ): Promise<void> {
    conversationData.lastLanguage = language;
    conversationData.lastIntent = intent;
    conversationData.interactionCount = (conversationData.interactionCount ?? 0) + 1;
    conversationData.lastInteraction = new Date().toISOString();

    if (!userData.displayName) {
      userData.displayName = context.activity.from.name ?? 'User';
    }

    await saveState(context);
  }
}
