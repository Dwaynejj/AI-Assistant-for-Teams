/**
 * @file webSession.ts
 * @description Lightweight in-memory session store for the Web Chat demo channel.
 * Mirrors the role of `conversationState.ts` on the Teams channel (tracks the
 * last language used per conversation) without any Bot Framework dependency.
 *
 * NOTE: Like the Teams channel's MemoryStorage, this is NOT persistent —
 * sessions are lost on server restart. That is fine for a local demo.
 */

/** State tracked per browser chat session */
export interface WebSessionData {
  /** The last language used in this conversation */
  lastLanguage: 'en' | 'he';
  /** The last intent processed, for debugging/telemetry */
  lastIntent: string;
  /** Number of messages exchanged in this session */
  interactionCount: number;
}

const sessions = new Map<string, WebSessionData>();

/**
 * Get the session for a given ID, creating it with defaults if it doesn't exist yet.
 *
 * @param sessionId - Client-generated session identifier
 * @param defaultLanguage - Language to seed a brand-new session with
 * @returns The (possibly newly created) session data
 */
export function getOrCreateSession(
  sessionId: string,
  defaultLanguage: 'en' | 'he',
): WebSessionData {
  let session = sessions.get(sessionId);
  if (!session) {
    session = { lastLanguage: defaultLanguage, lastIntent: 'UNKNOWN', interactionCount: 0 };
    sessions.set(sessionId, session);
  }
  return session;
}

/**
 * Apply a partial update to an existing session.
 *
 * @param sessionId - Session identifier
 * @param patch - Fields to merge into the existing session
 */
export function updateSession(sessionId: string, patch: Partial<WebSessionData>): void {
  const existing = sessions.get(sessionId);
  if (existing) {
    Object.assign(existing, patch);
  }
}

/** Clear all in-memory sessions. Exposed for tests. */
export function clearAllSessions(): void {
  sessions.clear();
}
