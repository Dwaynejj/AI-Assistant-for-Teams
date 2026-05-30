/**
 * @file rbac.ts
 * @description Role-based access control enforcement for the Teams BI Agent.
 * Maps Azure AD group memberships to permission roles and enforces per-intent access.
 */

import { getConfig } from '../utils/config';

/** All supported user roles */
export enum UserRole {
  VIEWER = 'viewer',
  SALES_USER = 'sales_user',
  INVENTORY_USER = 'inventory_user',
  PROCUREMENT_USER = 'procurement_user',
  MANAGER = 'manager',
  ADMIN = 'admin',
}

/** Intents and which roles can access them */
type RBACPolicy = Record<string, UserRole[]>;

/**
 * Access control policy.
 * HELP and LANG_SWITCH are open to all roles.
 * Domain-specific intents require the corresponding role (or MANAGER/ADMIN).
 */
const RBAC_POLICY: RBACPolicy = {
  SALES_PIPELINE: [UserRole.SALES_USER, UserRole.MANAGER, UserRole.ADMIN],
  SALES_PERFORMANCE: [UserRole.SALES_USER, UserRole.MANAGER, UserRole.ADMIN],
  SALES_DEAL_DETAIL: [UserRole.SALES_USER, UserRole.MANAGER, UserRole.ADMIN],
  INVENTORY_LEVELS: [UserRole.INVENTORY_USER, UserRole.MANAGER, UserRole.ADMIN],
  INVENTORY_ALERTS: [UserRole.INVENTORY_USER, UserRole.MANAGER, UserRole.ADMIN],
  INVENTORY_SKU: [UserRole.INVENTORY_USER, UserRole.MANAGER, UserRole.ADMIN],
  PROCUREMENT_PO_STATUS: [UserRole.PROCUREMENT_USER, UserRole.MANAGER, UserRole.ADMIN],
  PROCUREMENT_APPROVALS: [UserRole.PROCUREMENT_USER, UserRole.MANAGER, UserRole.ADMIN],
  PROCUREMENT_SUPPLIER: [UserRole.PROCUREMENT_USER, UserRole.MANAGER, UserRole.ADMIN],
  HELP: [
    UserRole.VIEWER,
    UserRole.SALES_USER,
    UserRole.INVENTORY_USER,
    UserRole.PROCUREMENT_USER,
    UserRole.MANAGER,
    UserRole.ADMIN,
  ],
  LANG_SWITCH: [
    UserRole.VIEWER,
    UserRole.SALES_USER,
    UserRole.INVENTORY_USER,
    UserRole.PROCUREMENT_USER,
    UserRole.MANAGER,
    UserRole.ADMIN,
  ],
  UNKNOWN: [
    UserRole.VIEWER,
    UserRole.SALES_USER,
    UserRole.INVENTORY_USER,
    UserRole.PROCUREMENT_USER,
    UserRole.MANAGER,
    UserRole.ADMIN,
  ],
};

/**
 * In-memory cache of user roles to avoid repeated AAD lookups within a session.
 * Key: user objectId, Value: resolved roles with timestamp
 */
const roleCache = new Map<string, { roles: UserRole[]; expiresAt: number }>();

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Build a mapping from AAD group object IDs to UserRole values.
 * Group IDs are loaded from the config at runtime.
 *
 * @returns Map of group object ID → UserRole
 */
function buildGroupRoleMap(): Map<string, UserRole> {
  const config = getConfig();
  const map = new Map<string, UserRole>();
  map.set(config.aadRoleGroupSales, UserRole.SALES_USER);
  map.set(config.aadRoleGroupInventory, UserRole.INVENTORY_USER);
  map.set(config.aadRoleGroupProcurement, UserRole.PROCUREMENT_USER);
  map.set(config.aadRoleGroupManager, UserRole.MANAGER);
  map.set(config.aadRoleGroupAdmin, UserRole.ADMIN);
  return map;
}

/**
 * Look up the Azure AD group memberships for a user and resolve their roles.
 * In production, this calls the Microsoft Graph API: GET /users/{id}/memberOf
 * For MVP, this falls back to a configurable default role (VIEWER) when
 * Graph API is not configured.
 *
 * @param userObjectId - Azure AD object ID of the user
 * @returns Array of resolved UserRole values
 */
async function resolveUserRoles(userObjectId: string): Promise<UserRole[]> {
  // Check in-memory cache first
  const cached = roleCache.get(userObjectId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.roles;
  }

  const groupRoleMap = buildGroupRoleMap();

  // In a production deployment, this would call:
  // GET https://graph.microsoft.com/v1.0/users/{userObjectId}/memberOf
  // with a token from DefaultAzureCredential.
  //
  // For MVP, we simulate role resolution based on the environment.
  // When NODE_ENV=development, grant ADMIN to allow full testing.
  const config = getConfig();
  let roles: UserRole[] = [];

  if (config.nodeEnv === 'development' || config.nodeEnv === 'test') {
    // In development/test, grant all roles for convenience
    roles = [UserRole.ADMIN];
  } else {
    // Production: call Graph API for group memberships
    try {
      const { DefaultAzureCredential } = await import('@azure/identity');
      const credential = new DefaultAzureCredential();
      const tokenResponse = await credential.getToken('https://graph.microsoft.com/.default');
      const token = tokenResponse.token;

      const { default: axios } = await import('axios');
      const response = await axios.get<{ value: Array<{ id: string }> }>(
        `https://graph.microsoft.com/v1.0/users/${userObjectId}/memberOf`,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000,
        },
      );

      for (const group of response.data.value) {
        const role = groupRoleMap.get(group.id);
        if (role) roles.push(role);
      }

      // Every authenticated user gets at least VIEWER
      if (roles.length === 0) roles.push(UserRole.VIEWER);
    } catch {
      // Graph API failed — grant minimal VIEWER access to allow HELP/LANG_SWITCH
      roles = [UserRole.VIEWER];
    }
  }

  // Cache the result
  roleCache.set(userObjectId, { roles, expiresAt: Date.now() + CACHE_TTL_MS });
  return roles;
}

/**
 * Check whether a user has permission to access a given intent.
 *
 * @param userObjectId - Azure AD object ID of the user
 * @param intent - The intent key being requested
 * @returns true if the user has a role permitted to access this intent
 */
export async function hasAccess(userObjectId: string, intent: string): Promise<boolean> {
  const allowedRoles = RBAC_POLICY[intent] ?? RBAC_POLICY['HELP'];
  const userRoles = await resolveUserRoles(userObjectId);

  return userRoles.some((role) => allowedRoles.includes(role));
}

/**
 * Get all roles assigned to a user.
 *
 * @param userObjectId - Azure AD object ID of the user
 * @returns Array of assigned UserRole values
 */
export async function getUserRoles(userObjectId: string): Promise<UserRole[]> {
  return resolveUserRoles(userObjectId);
}

/**
 * Invalidate the role cache for a specific user (e.g. after role change).
 *
 * @param userObjectId - Azure AD object ID of the user
 */
export function invalidateRoleCache(userObjectId: string): void {
  roleCache.delete(userObjectId);
}
