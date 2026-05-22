/**
 * @file config.ts
 * @description Centralised configuration loader for the Teams BI Agent.
 *
 * Load order:
 *  1. Azure Key Vault (if KEY_VAULT_URL is set and DefaultAzureCredential succeeds)
 *  2. Environment variables / .env file (local development)
 *
 * This is the ONLY file in the codebase that reads from process.env.
 * All other modules must import Config from here.
 */

import * as appInsights from 'applicationinsights';
import dotenv from 'dotenv';

// Load .env file in non-production environments
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

/** Typed configuration interface — every field is required for the bot to start */
export interface Config {
  // Bot Identity
  microsoftAppId: string;
  microsoftAppPassword: string;

  // CRM
  crmApiUrl: string;
  crmApiKey: string;

  // ERP
  erpApiUrl: string;
  erpApiKey: string;

  // Inventory
  inventoryDbConnectionString: string;

  // Alert thresholds
  lowStockThreshold: number;
  criticalStockThreshold: number;
  poOverdueDays: number;

  // Alert channel targets
  alertTeamsChannelId: string;
  alertTeamsTeamId: string;

  // Azure Application Insights
  appInsightsInstrumentationKey: string;

  // Azure AD / RBAC
  aadTenantId: string;
  aadRoleGroupSales: string;
  aadRoleGroupInventory: string;
  aadRoleGroupProcurement: string;
  aadRoleGroupManager: string;
  aadRoleGroupAdmin: string;

  // Azure AI Language (optional — falls back to keyword matching)
  azureLanguageEndpoint: string | undefined;
  azureLanguageKey: string | undefined;
  azureCluProjectName: string | undefined;
  azureCluDeploymentName: string | undefined;

  // Key Vault URL (optional)
  keyVaultUrl: string | undefined;

  // Application
  nodeEnv: string;
  port: number;
  appVersion: string;
  defaultLanguage: 'en' | 'he';
  botServiceUrl: string;
}

/**
 * Required environment variable keys that must be present for the application to start.
 * Optional keys are not listed here.
 */
const REQUIRED_KEYS: ReadonlyArray<string> = [
  'MICROSOFT_APP_ID',
  'MICROSOFT_APP_PASSWORD',
  'CRM_API_URL',
  'CRM_API_KEY',
  'ERP_API_URL',
  'ERP_API_KEY',
  'INVENTORY_DB_CONNECTION_STRING',
  'LOW_STOCK_THRESHOLD',
  'CRITICAL_STOCK_THRESHOLD',
  'PO_OVERDUE_DAYS',
  'ALERT_TEAMS_CHANNEL_ID',
  'ALERT_TEAMS_TEAM_ID',
  'APPINSIGHTS_INSTRUMENTATIONKEY',
  'AAD_TENANT_ID',
  'AAD_ROLE_GROUP_SALES',
  'AAD_ROLE_GROUP_INVENTORY',
  'AAD_ROLE_GROUP_PROCUREMENT',
  'AAD_ROLE_GROUP_MANAGER',
  'AAD_ROLE_GROUP_ADMIN',
];

/**
 * Attempt to load secrets from Azure Key Vault.
 * Falls back silently if KEY_VAULT_URL is not configured.
 *
 * @param keyVaultUrl - The full URI of the Azure Key Vault
 * @returns A map of secret name → secret value, or empty map on failure
 */
async function loadFromKeyVault(keyVaultUrl: string): Promise<Record<string, string>> {
  try {
    // Dynamic import to avoid loading Azure SDK when Key Vault is not configured
    const { SecretClient } = await import('@azure/keyvault-secrets');
    const { DefaultAzureCredential } = await import('@azure/identity');

    const credential = new DefaultAzureCredential();
    const client = new SecretClient(keyVaultUrl, credential);

    const secrets: Record<string, string> = {};

    // Map Key Vault secret names to env var names
    const secretMappings: Record<string, string> = {
      'Microsoft-App-Id': 'MICROSOFT_APP_ID',
      'Microsoft-App-Password': 'MICROSOFT_APP_PASSWORD',
      'Crm-Api-Key': 'CRM_API_KEY',
      'Erp-Api-Key': 'ERP_API_KEY',
      'Inventory-Db-Connection-String': 'INVENTORY_DB_CONNECTION_STRING',
      'Azure-Language-Key': 'AZURE_LANGUAGE_KEY',
      'Appinsights-Instrumentationkey': 'APPINSIGHTS_INSTRUMENTATIONKEY',
    };

    for (const [kvName, envName] of Object.entries(secretMappings)) {
      try {
        const secret = await client.getSecret(kvName);
        if (secret.value) {
          secrets[envName] = secret.value;
        }
      } catch {
        // Secret not found in KV — will fall back to env var
      }
    }

    return secrets;
  } catch (err) {
    // Key Vault not available — proceed with env vars
    console.warn('[Config] Key Vault not available, using environment variables only:', err);
    return {};
  }
}

/**
 * Validate that all required environment keys are present.
 * Throws a descriptive error listing all missing keys on failure.
 *
 * @param env - The merged environment map to validate
 */
function validateConfig(env: Record<string, string | undefined>): void {
  const missing = REQUIRED_KEYS.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(
      `[Config] Missing required environment variables:\n  ${missing.join('\n  ')}\n` +
        `Copy .env.example to .env and fill in all required values.`,
    );
  }
}

/**
 * Load and validate the complete application configuration.
 * Must be called once at application startup before any other module.
 *
 * @returns A fully-validated, typed Config object
 */
export async function loadConfig(): Promise<Config> {
  // Start with process.env
  const env: Record<string, string | undefined> = { ...process.env };

  // Attempt Key Vault overlay
  const keyVaultUrl = process.env['KEY_VAULT_URL'];
  if (keyVaultUrl) {
    const kvSecrets = await loadFromKeyVault(keyVaultUrl);
    // Key Vault secrets override env vars
    Object.assign(env, kvSecrets);
  }

  // Validate all required keys before constructing Config
  validateConfig(env);

  const defaultLang = (env['DEFAULT_LANGUAGE'] ?? 'en') as 'en' | 'he';

  return {
    microsoftAppId: env['MICROSOFT_APP_ID']!,
    microsoftAppPassword: env['MICROSOFT_APP_PASSWORD']!,

    crmApiUrl: env['CRM_API_URL']!,
    crmApiKey: env['CRM_API_KEY']!,

    erpApiUrl: env['ERP_API_URL']!,
    erpApiKey: env['ERP_API_KEY']!,

    inventoryDbConnectionString: env['INVENTORY_DB_CONNECTION_STRING']!,

    lowStockThreshold: parseInt(env['LOW_STOCK_THRESHOLD']!, 10),
    criticalStockThreshold: parseInt(env['CRITICAL_STOCK_THRESHOLD']!, 10),
    poOverdueDays: parseInt(env['PO_OVERDUE_DAYS']!, 10),

    alertTeamsChannelId: env['ALERT_TEAMS_CHANNEL_ID']!,
    alertTeamsTeamId: env['ALERT_TEAMS_TEAM_ID']!,

    appInsightsInstrumentationKey: env['APPINSIGHTS_INSTRUMENTATIONKEY']!,

    aadTenantId: env['AAD_TENANT_ID']!,
    aadRoleGroupSales: env['AAD_ROLE_GROUP_SALES']!,
    aadRoleGroupInventory: env['AAD_ROLE_GROUP_INVENTORY']!,
    aadRoleGroupProcurement: env['AAD_ROLE_GROUP_PROCUREMENT']!,
    aadRoleGroupManager: env['AAD_ROLE_GROUP_MANAGER']!,
    aadRoleGroupAdmin: env['AAD_ROLE_GROUP_ADMIN']!,

    azureLanguageEndpoint: env['AZURE_LANGUAGE_ENDPOINT'],
    azureLanguageKey: env['AZURE_LANGUAGE_KEY'],
    azureCluProjectName: env['AZURE_CLU_PROJECT_NAME'],
    azureCluDeploymentName: env['AZURE_CLU_DEPLOYMENT_NAME'],

    keyVaultUrl,

    nodeEnv: env['NODE_ENV'] ?? 'development',
    port: parseInt(env['PORT'] ?? '3978', 10),
    appVersion: env['APP_VERSION'] ?? '1.0.0',
    defaultLanguage: defaultLang,
    botServiceUrl: env['BOT_SERVICE_URL'] ?? 'https://smba.trafficmanager.net/teams/',
  };
}

// Singleton — populated once by loadConfig(), then reused
let _config: Config | undefined;

/**
 * Get the singleton config instance.
 * Throws if loadConfig() has not been called first.
 *
 * @returns The loaded Config object
 */
export function getConfig(): Config {
  if (!_config) {
    throw new Error('[Config] Configuration has not been loaded. Call loadConfig() at startup.');
  }
  return _config;
}

/**
 * Initialise the application configuration singleton.
 * Should be called exactly once, at the very start of src/index.ts.
 *
 * @returns The loaded Config object
 */
export async function initConfig(): Promise<Config> {
  _config = await loadConfig();
  return _config;
}

/**
 * Initialise Azure Application Insights using the loaded config.
 * Must be called before any other module to ensure all requests are tracked.
 *
 * @param config - The loaded application config
 */
export function initAppInsights(config: Config): void {
  appInsights
    .setup(config.appInsightsInstrumentationKey)
    .setAutoDependencyCorrelation(true)
    .setAutoCollectRequests(true)
    .setAutoCollectPerformance(true)
    .setAutoCollectExceptions(true)
    .setAutoCollectDependencies(true)
    .setAutoCollectConsole(true)
    .setUseDiskRetryCaching(true)
    .start();

  // Tag all telemetry with application version and environment
  appInsights.defaultClient.commonProperties = {
    bot_version: config.appVersion,
    environment: config.nodeEnv,
  };
}
