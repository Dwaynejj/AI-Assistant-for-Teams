/**
 * @file baseConnector.ts
 * @description Shared HTTP client for all data connectors.
 * Provides automatic retry logic, timeout enforcement, TLS validation,
 * and Application Insights integration.
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import * as https from 'https';
import { logConnectorCall, logError } from '../utils/logger';

/** Structured error thrown when a connector call permanently fails */
export class ConnectorError extends Error {
  constructor(
    public readonly system: string,
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ConnectorError';
    Object.setPrototypeOf(this, ConnectorError.prototype);
  }
}

/** Configuration for the base HTTP client */
export interface BaseConnectorConfig {
  /** Base URL of the target system */
  baseUrl: string;
  /** API key for Bearer token auth */
  apiKey: string;
  /** Logical name of the system (for logging) */
  systemName: string;
  /** Request timeout in milliseconds (default: 20000) */
  timeoutMs?: number;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
}

/** Status codes that trigger a retry attempt */
const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];

/** Initial backoff delays in ms for each retry attempt */
const RETRY_DELAYS_MS = [500, 1000, 2000];

/**
 * Sleep for a given number of milliseconds.
 *
 * @param ms - Milliseconds to wait
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check whether an Axios error should be retried.
 *
 * @param error - The Axios error
 * @returns true if the request should be retried
 */
function isRetryable(error: AxiosError): boolean {
  if (!error.response) return true; // Network error — always retry
  return RETRYABLE_STATUS_CODES.includes(error.response.status);
}

/**
 * Create a configured Axios instance for a specific backend system.
 * All instances enforce TLS, 20-second timeout, and Bearer token auth.
 *
 * @param config - Connector configuration
 * @returns A configured AxiosInstance
 */
export function createHttpClient(config: BaseConnectorConfig): AxiosInstance {
  const httpsAgent = new https.Agent({
    rejectUnauthorized: true, // Enforce TLS — never bypass in production
  });

  const instance = axios.create({
    baseURL: config.baseUrl,
    timeout: config.timeoutMs ?? 20_000,
    httpsAgent,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Client-Name': 'TeamsBI-Agent',
      'X-Client-Version': process.env['APP_VERSION'] ?? '1.0.0',
    },
  });

  return instance;
}

/**
 * Execute an HTTP request with automatic retry and Application Insights logging.
 *
 * @param client - The configured Axios instance
 * @param config - Request configuration
 * @param systemName - System name for logging
 * @param methodName - Connector method name for logging
 * @param sessionId - Session ID for log correlation
 * @returns The response data
 */
export async function executeWithRetry<T>(
  client: AxiosInstance,
  requestConfig: AxiosRequestConfig,
  systemName: string,
  methodName: string,
  sessionId: string,
): Promise<T> {
  const maxRetries = 3;
  let lastError: AxiosError | undefined;
  const startTime = Date.now();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.request<T>(requestConfig);
      const duration = Date.now() - startTime;
      logConnectorCall(systemName, methodName, duration, true, sessionId);
      return response.data;
    } catch (err) {
      const axiosErr = err as AxiosError;

      if (attempt < maxRetries && isRetryable(axiosErr)) {
        const delay = RETRY_DELAYS_MS[attempt] ?? 2000;
        await sleep(delay);
        lastError = axiosErr;
        continue;
      }

      // Permanent failure
      const duration = Date.now() - startTime;
      logConnectorCall(systemName, methodName, duration, false, sessionId);

      const statusCode = axiosErr.response?.status ?? 0;
      const message =
        (axiosErr.response?.data as Record<string, string>)?.message ??
        axiosErr.message ??
        'Unknown error';

      logError(
        new Error(`${systemName}.${methodName} failed: ${message}`),
        { system: systemName, method: methodName, statusCode: String(statusCode) },
        sessionId,
      );

      throw new ConnectorError(systemName, statusCode, `${systemName} request failed: ${message}`);
    }
  }

  // Should never reach here, but TypeScript requires it
  const duration = Date.now() - startTime;
  logConnectorCall(systemName, methodName, duration, false, sessionId);
  throw new ConnectorError(
    systemName,
    0,
    `Max retries exceeded for ${systemName}.${methodName}: ${lastError?.message ?? 'unknown'}`,
  );
}
