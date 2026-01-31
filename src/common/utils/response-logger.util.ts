import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Utility functions for the API Response Logger
 * These helper functions can be used independently or by the middleware
 */

/**
 * Sensitive fields that should be redacted from request/response data
 */
export const SENSITIVE_FIELDS = [
  'password',
  'password_confirmation',
  'token',
  'api_key',
  'secret',
  'access_token',
  'refresh_token',
  'id_token',
  'auth_token',
  'credentials',
  'credit_card',
  'cvv',
  'ssn',
  'social_security',
  'pin',
  'otp',
  'verification_code',
  'security_code',
];

/**
 * Sensitive headers that should be redacted
 */
export const SENSITIVE_HEADERS = [
  'authorization',
  'cookie',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
  'x-refresh-token',
  'x-csrf-token',
  'x-xsrf-token',
];

/**
 * Check if the current environment is development
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Check if the request is from localhost
 */
export function isLocalhost(hostname: string): boolean {
  const localHosts = ['localhost', '127.0.0.1', '::1'];
  return (
    localHosts.includes(hostname) ||
    hostname.startsWith('127.0.0.1') ||
    hostname.startsWith('localhost') ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.')
  );
}

/**
 * Sanitize data by removing sensitive fields
 */
export function sanitizeData(data: any, sensitiveFields: string[] = SENSITIVE_FIELDS): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item, sensitiveFields));
  }

  // Handle objects
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    const isSensitive = sensitiveFields.some(
      (field) =>
        key.toLowerCase().includes(field.toLowerCase()) ||
        key.toLowerCase() === field.toLowerCase(),
    );

    if (isSensitive) {
      sanitized[key] = '***REDACTED***';
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizeData(value, sensitiveFields);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitize headers by removing sensitive information
 */
export function sanitizeHeaders(
  headers: Record<string, any>,
  sensitiveHeaders: string[] = SENSITIVE_HEADERS,
): Record<string, any> {
  if (!headers || typeof headers !== 'object') {
    return headers;
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(headers)) {
    const keyLower = key.toLowerCase();
    const isSensitive = sensitiveHeaders.some(
      (header) => keyLower === header.toLowerCase(),
    );

    if (isSensitive) {
      sanitized[key] = '***REDACTED***';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Generate a safe filename from route information
 */
export function generateSafeFilename(
  routeName: string,
  routeUri: string,
  method: string,
): string {
  let name: string;

  if (routeName && routeName !== 'unnamed' && routeName !== 'root') {
    name = routeName.replace(/[.\/\\]/g, '_');
  } else {
    name = routeUri
      .replace(/[\/\\{}:]/g, '_')
      .replace(/^_api_/, '')
      .replace(/^_/, '');
  }

  // Remove any non-alphanumeric characters except underscores and hyphens
  name = name.replace(/[^a-zA-Z0-9_-]/g, '_');

  // Remove consecutive underscores
  name = name.replace(/_+/g, '_');

  // Remove leading/trailing underscores
  name = name.replace(/^_+|_+$/g, '');

  // Prefix with HTTP method
  name = method.toLowerCase() + '_' + name;

  return name + '.json';
}

/**
 * Ensure directory exists
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    throw new Error(`Failed to create directory ${dirPath}: ${(error as Error).message}`);
  }
}

/**
 * Write JSON data to file
 */
export async function writeJsonFile(
  filePath: string,
  data: any,
  pretty: boolean = true,
): Promise<void> {
  try {
    const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    await fs.writeFile(filePath, content, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to write file ${filePath}: ${(error as Error).message}`);
  }
}

/**
 * Read JSON data from file
 */
export async function readJsonFile<T = any>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Parse response body (handles both JSON and string)
 */
export function parseResponseBody(body: any): any {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return body;
}

/**
 * Get route name from request path
 */
export function getRouteNameFromPath(path: string): string {
  const cleanPath = path.replace(/^\/api\//, '');
  return cleanPath.replace(/\//g, '.') || 'root';
}

/**
 * Format date to ISO string
 */
export function formatDate(date: Date = new Date()): string {
  return date.toISOString();
}

/**
 * Check if path should be skipped (health checks, static files, etc.)
 */
export function shouldSkipPath(path: string, skipPaths: string[] = []): boolean {
  const defaultSkipPaths = ['/health', '/ping', '/favicon.ico', '/robots.txt'];
  const allSkipPaths = [...defaultSkipPaths, ...skipPaths];
  return allSkipPaths.some((skipPath) => path.startsWith(skipPath));
}

/**
 * Create index entry for a route
 */
export function createIndexEntry(
  routeName: string,
  routeUri: string,
  method: string,
  filename: string,
  createdAt: string,
  updatedAt: string,
  updateCount: number,
): Record<string, any> {
  return {
    name: routeName || 'unnamed',
    uri: routeUri,
    method: method,
    file: filename,
    created_at: createdAt,
    last_updated: updatedAt,
    update_count: updateCount,
  };
}

/**
 * Sort object keys alphabetically
 */
export function sortObjectKeys<T extends Record<string, any>>(obj: T): T {
  const sorted: Record<string, any> = {};
  Object.keys(obj)
    .sort()
    .forEach((key) => {
      sorted[key] = obj[key];
    });
  return sorted as T;
}

/**
 * Response Logger Configuration
 */
export interface ResponseLoggerConfig {
  storagePath: string;
  sensitiveFields: string[];
  sensitiveHeaders: string[];
  skipPaths: string[];
  enabled: boolean;
  prettyPrint: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: ResponseLoggerConfig = {
  storagePath: './res',
  sensitiveFields: SENSITIVE_FIELDS,
  sensitiveHeaders: SENSITIVE_HEADERS,
  skipPaths: ['/health', '/ping', '/favicon.ico', '/robots.txt'],
  enabled: true,
  prettyPrint: true,
};

/**
 * Load configuration with defaults
 */
export function loadConfig(userConfig: Partial<ResponseLoggerConfig> = {}): ResponseLoggerConfig {
  return {
    ...DEFAULT_CONFIG,
    ...userConfig,
    sensitiveFields: [...DEFAULT_CONFIG.sensitiveFields, ...(userConfig.sensitiveFields || [])],
    sensitiveHeaders: [...DEFAULT_CONFIG.sensitiveHeaders, ...(userConfig.sensitiveHeaders || [])],
    skipPaths: [...DEFAULT_CONFIG.skipPaths, ...(userConfig.skipPaths || [])],
  };
}
