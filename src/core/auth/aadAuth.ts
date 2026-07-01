/**
 * @file aadAuth.ts
 * @description Azure Active Directory authentication utilities.
 * Extracts and validates user identity from Bot Framework activity objects.
 */

import { Activity, TurnContext } from 'botbuilder';

/** User identity extracted from an Azure AD activity */
export interface UserIdentity {
  /** Azure AD Object ID (unique across tenant) */
  objectId: string;
  /** User Principal Name (email) */
  upn: string;
  /** Display name from AAD */
  displayName: string;
  /** Teams user ID (for conversation references) */
  teamsUserId?: string;
}

/**
 * Extract the user's Azure AD identity from a Bot Framework TurnContext.
 * In a real Teams deployment, the Bot Framework token contains AAD claims.
 * This implementation extracts the identity from the activity's aadObjectId
 * and from fields set by the Teams channel.
 *
 * @param context - The Bot Framework TurnContext for the current turn
 * @returns The user's identity, or a placeholder if claims are not present
 */
export function extractUserIdentity(context: TurnContext): UserIdentity {
  const activity = context.activity as Activity & {
    channelData?: {
      tenant?: { id?: string };
    };
  };

  const fromAccount = activity.from as unknown as Record<string, unknown> & {
    aadObjectId?: string;
  };
  const objectId = fromAccount.aadObjectId ?? activity.from.id ?? 'unknown';

  // The user's email/UPN is available in from.name in some configurations,
  // or via the Graph API using the objectId. Here we extract what's available.
  const upn = activity.from.name ?? objectId;
  const displayName = activity.from.name ?? 'Unknown User';

  return {
    objectId,
    upn,
    displayName,
    teamsUserId: activity.from.id,
  };
}

/**
 * Validate that the bot received a properly formed activity from Teams.
 * The Bot Framework Adapter handles token validation on the transport layer;
 * this function performs additional sanity checks on the activity structure.
 *
 * @param activity - The incoming Bot Framework activity
 * @returns true if the activity appears to be from a legitimate Teams source
 */
export function isValidTeamsActivity(activity: Activity): boolean {
  if (!activity) return false;
  if (!activity.channelId) return false;
  if (!activity.from?.id) return false;
  // Accept activities from the 'msteams' channel or emulator (for local dev)
  return activity.channelId === 'msteams' || activity.channelId === 'emulator';
}
