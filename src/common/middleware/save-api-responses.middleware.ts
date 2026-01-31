import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';

interface RouteInfo {
  name: string;
  uri: string;
  method: string;
  url: string;
}

interface RequestData {
  method: string;
  headers: Record<string, any>;
  body: any;
  query: any;
}

interface ResponseData {
  status_code: number;
  headers: Record<string, any>;
  body: any;
}

interface MetaData {
  created_at: string;
  updated_at: string;
  update_count: number;
  first_saved: boolean;
}

interface ApiResponseData {
  route: RouteInfo;
  request: RequestData;
  response: ResponseData;
  meta: MetaData;
}

interface IndexEntry {
  name: string;
  uri: string;
  method: string;
  file: string;
  created_at: string;
  last_updated: string;
  update_count: number;
}

interface IndexData {
  [key: string]: IndexEntry;
}

@Injectable()
export class SaveApiResponsesMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SaveApiResponsesMiddleware.name);
  private readonly storagePath: string;
  private readonly sensitiveFields = [
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
  ];
  private readonly sensitiveHeaders = [
    'authorization',
    'cookie',
    'x-api-key',
    'x-auth-token',
    'x-access-token',
    'x-refresh-token',
  ];

  constructor() {
    // Use absolute path from project root
    this.storagePath = path.resolve(process.cwd(), 'res');
    this.logger.log(`✅ SaveApiResponsesMiddleware initialized`);
    this.logger.log(`📁 Storage path: ${this.storagePath}`);
  }

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    // ALWAYS process the request - don't return early
    const shouldSave = this.shouldSaveResponse(req);
    
    this.logger.debug(`📝 ${req.method} ${req.path} - Host: ${req.hostname} - ShouldSave: ${shouldSave}`);

    if (!shouldSave) {
      // Just pass to next middleware without capturing
      return next();
    }

    this.logger.log(`🎯 Capturing: ${req.method} ${req.path}`);

    // Store original methods
    const originalSend = res.send.bind(res);
    const originalJson = res.json.bind(res);

    let responseBody: any;
    let responseCaptured = false;

    // Override res.send
    res.send = (body: any): Response => {
      if (!responseCaptured) {
        responseBody = body;
        responseCaptured = true;
        this.logger.debug(`📦 Response captured via send()`);
      }
      return originalSend(body);
    };

    // Override res.json
    res.json = (body: any): Response => {
      if (!responseCaptured) {
        responseBody = body;
        responseCaptured = true;
        this.logger.debug(`📦 Response captured via json()`);
      }
      return originalJson(body);
    };

    // Listen for response finish
    res.on('finish', async () => {
      this.logger.debug(`🏁 Response finished: ${res.statusCode}`);
      try {
        await this.saveResponse(req, res, responseBody);
      } catch (error) {
        this.logger.error(`❌ Failed to save: ${(error as Error).message}`);
      }
    });

    // Also listen for close event in case finish doesn't fire
    res.on('close', async () => {
      if (!responseCaptured) {
        this.logger.debug(`🚪 Response closed without finish`);
      }
    });

    next();
  }

  /**
   * Check if the response should be saved based on environment and request
   */
  private shouldSaveResponse(req: Request): boolean {
    // Check environment
    const nodeEnv = process.env.NODE_ENV || 'development';
    if (nodeEnv !== 'development') {
      this.logger.debug(`⛔ NODE_ENV=${nodeEnv} (not development)`);
      return false;
    }

    // Check if explicitly disabled
    if (process.env.DISABLE_API_RESPONSE_LOGGER === 'true') {
      this.logger.debug(`⛔ DISABLE_API_RESPONSE_LOGGER=true`);
      return false;
    }

    // Check if it's localhost or local network
    const host = req.hostname || req.headers.host || '';
    const hostLower = host.toLowerCase();
    
    // Allow localhost, local network, AND any host in development mode
    // This allows it to work with cloudflare tunnels, ngrok, etc.
    const isLocalhost =
      hostLower === 'localhost' ||
      hostLower === '127.0.0.1' ||
      hostLower === '::1' ||
      hostLower.startsWith('127.') ||
      hostLower.startsWith('192.168.') ||
      hostLower.startsWith('10.');

    // In development mode, we allow all hosts, not just localhost
    // This is useful when using cloudflare tunnels or ngrok
    const allowAllHostsInDev = process.env.API_LOGGER_ALLOW_ALL_HOSTS === 'true' || true;

    if (!isLocalhost && !allowAllHostsInDev) {
      this.logger.debug(`⛔ Host ${host} is not localhost and allowAllHostsInDev is false`);
      return false;
    }

    // Save ALL routes (not just /api/*) in development mode
    // This is because NestJS uses global prefix 'api' which removes it from req.path
    const isApiRoute = req.path.startsWith('/api/') || req.path.startsWith('/');
    
    // Skip certain routes
    const skipPaths = ['/health', '/ping', '/favicon.ico', '/robots.txt'];
    const shouldSkip = skipPaths.some((skipPath) =>
      req.path.startsWith(skipPath),
    );

    if (shouldSkip) {
      this.logger.debug(`⛔ Path ${req.path} is in skip list`);
      return false;
    }

    this.logger.debug(`✅ All checks passed for ${req.path}`);
    return true;
  }

  /**
   * Save the API response to a JSON file
   */
  private async saveResponse(
    req: Request,
    res: Response,
    responseBody: any,
  ): Promise<void> {
    try {
      // Ensure storage directory exists
      await fs.mkdir(this.storagePath, { recursive: true });

      const routeMethod = req.method;
      const routeUri = req.route?.path || req.path;
      const routeName = this.getRouteName(req);

      // Parse response body if it's a string
      let decodedResponse: any = responseBody;
      if (typeof responseBody === 'string') {
        try {
          decodedResponse = JSON.parse(responseBody);
        } catch {
          decodedResponse = responseBody;
        }
      }

      // Generate filename
      const filename = this.generateFilename(routeName, routeUri, routeMethod);
      const filePath = path.join(this.storagePath, filename);

      // Read existing data to get update count
      let existingData: ApiResponseData | null = null;
      let updateCount = 0;

      try {
        const existingContent = await fs.readFile(filePath, 'utf-8');
        existingData = JSON.parse(existingContent) as ApiResponseData;
        if (existingData?.meta?.update_count) {
          updateCount = existingData.meta.update_count;
        }
      } catch {
        // File doesn't exist or is invalid, start fresh
      }

      const now = new Date().toISOString();
      const responseData: ApiResponseData = {
        route: {
          name: routeName,
          uri: routeUri,
          method: routeMethod,
          url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
        },
        request: {
          method: req.method,
          headers: this.sanitizeHeaders(req.headers),
          body: this.sanitizeRequestData(req.body || {}),
          query: req.query || {},
        },
        response: {
          status_code: res.statusCode,
          headers: this.sanitizeHeaders(res.getHeaders()),
          body: decodedResponse,
        },
        meta: {
          created_at: existingData?.meta?.created_at || now,
          updated_at: now,
          update_count: updateCount + 1,
          first_saved: existingData === null,
        },
      };

      // Write response data to file
      await fs.writeFile(filePath, JSON.stringify(responseData, null, 2));

      // Update index file
      await this.updateIndexFile(
        routeName,
        routeUri,
        routeMethod,
        filename,
        responseData.meta,
      );

      this.logger.log(
        `✅ Saved: ${routeMethod} ${req.path} → ${filename} (#${responseData.meta.update_count})`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Error saving: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Generate a route name from the request
   */
  private getRouteName(req: Request): string {
    if (req.route?.path) {
      return req.route.path.replace(/\//g, '.').replace(/^\./, '');
    }
    const pathStr = req.path.replace(/^\/api\//, '');
    return pathStr.replace(/\//g, '.') || 'root';
  }

  /**
   * Generate a filename based on route information
   */
  private generateFilename(
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

    name = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    name = name.replace(/_+/g, '_');
    name = name.replace(/^_+|_+$/g, '');
    name = method.toLowerCase() + '_' + name;

    return name + '.json';
  }

  /**
   * Update the index file with route information
   */
  private async updateIndexFile(
    routeName: string,
    routeUri: string,
    method: string,
    filename: string,
    meta: MetaData,
  ): Promise<void> {
    const indexPath = path.join(this.storagePath, 'index.json');

    let index: IndexData = {};
    try {
      const indexContent = await fs.readFile(indexPath, 'utf-8');
      index = JSON.parse(indexContent) as IndexData;
    } catch {
      // Index file doesn't exist, start fresh
    }

    const routeKey = routeName || routeUri;

    index[routeKey] = {
      name: routeName || 'unnamed',
      uri: routeUri,
      method: method,
      file: filename,
      created_at: meta.created_at,
      last_updated: meta.updated_at,
      update_count: meta.update_count,
    };

    // Sort index by route name
    const sortedIndex: IndexData = {};
    Object.keys(index)
      .sort()
      .forEach((key) => {
        sortedIndex[key] = index[key];
      });

    await fs.writeFile(indexPath, JSON.stringify(sortedIndex, null, 2));
  }

  /**
   * Sanitize request data by removing sensitive fields
   */
  private sanitizeRequestData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeRequestData(item));
    }

    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(data)) {
      const isSensitive = this.sensitiveFields.some(
        (field) =>
          key.toLowerCase().includes(field.toLowerCase()) ||
          key.toLowerCase() === field.toLowerCase(),
      );

      if (isSensitive) {
        sanitized[key] = '***REDACTED***';
      } else if (value && typeof value === 'object') {
        sanitized[key] = this.sanitizeRequestData(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Sanitize headers by removing sensitive information
   */
  private sanitizeHeaders(headers: any): Record<string, any> {
    if (!headers || typeof headers !== 'object') {
      return headers;
    }

    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(headers)) {
      const keyLower = key.toLowerCase();
      const isSensitive = this.sensitiveHeaders.some(
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
}
