/**
 * @file conversationState.ts
 * @description User and conversation state management for the Teams BI Agent.
 * Uses MemoryStorage for development; swap for Azure Table Storage in production.
 */

import {
  ConversationState,
  UserState,
  MemoryStorage,
  StatePropertyAccessor,
  TurnContext,
} from 'botbuilder';

/** State data persisted per conversation */
export interface ConversationData {
  /** The last detected language for the conversation */
  lastLanguage: 'en' | 'he';
  /** The last intent processed */
  lastIntent: string;
  /** Timestamp of last interaction */
  lastInteraction?: string;
  /** Number of interactions in this conversation */
  interactionCount: number;
}

/** State data persisted per user */
export interface UserData {
  /** User's preferred language (overrides auto-detection) */
  preferredLanguage?: 'en' | 'he';
  /** User's display name */
  displayName?: string;
}

/** Default conversation state values */
const DEFAULT_CONVERSATION_DATA: ConversationData = {
  lastLanguage: 'en',
  lastIntent: 'UNKNOWN',
  interactionCount: 0,
};

// ─────────────────────────────────────────────
// Storage setup
// ─────────────────────────────────────────────

// NOTE: MemoryStorage is NOT persistent — data is lost on restart.
// For production, replace with:
//   import { CosmosDbPartitionedStorage } from 'botbuilder-azure';
//   or Azure Table Storage via the botbuilder-azure package.
const storage = new MemoryStorage();

export const conversationState = new ConversationState(storage);
export const userState = new UserState(storage);

/**
 * Create a typed property accessor for conversation data.
 *
 * @returns StatePropertyAccessor for ConversationData
 */
export function createConversationDataAccessor(): StatePropertyAccessor<ConversationData> {
  return conversationState.createProperty<ConversationData>('conversationData');
}

/**
 * Create a typed property accessor for user data.
 *
 * @returns StatePropertyAccessor for UserData
 */
export function createUserDataAccessor(): StatePropertyAccessor<UserData> {
  return userState.createProperty<UserData>('userData');
}

/**
 * Get the current conversation data, initialising with defaults if not present.
 *
 * @param context - The current TurnContext
 * @param accessor - The conversation data accessor
 * @returns Current ConversationData
 */
export async function getConversationData(
  context: TurnContext,
  accessor: StatePropertyAccessor<ConversationData>,
): Promise<ConversationData> {
  const data = await accessor.get(context, { ...DEFAULT_CONVERSATION_DATA });
  return data;
}

/**
 * Save conversation state updates after a turn.
 *
 * @param context - The current TurnContext
 */
export async function saveState(context: TurnContext): Promise<void> {
  await conversationState.saveChanges(context, false);
  await userState.saveChanges(context, false);
}
