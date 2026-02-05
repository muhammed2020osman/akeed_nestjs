import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Middleware to log HTTP requests and errors with full details
 */
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
    private logDir = path.join(process.cwd(), 'debug');
    private logFilePath = path.join(this.logDir, 'debug.log');
    private errorLogFilePath = path.join(this.logDir, 'error.log');

    private readonly sensitiveFields = [
        'password',
        'password_confirmation',
        'token',
        'api_key',
        'secret',
        'access_token',
        'refresh_token',
        'auth_token',
        'credentials',
    ];

    constructor() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    use(req: Request, res: Response, next: NextFunction) {
        const { method, originalUrl, body, ip } = req;
        const userAgent = req.headers['user-agent'] || 'Unknown';
        const start = Date.now();

        // Capture response body
        const originalSend = res.send.bind(res);
        const originalJson = res.json.bind(res);
        let responseBody: any;
        let responseCaptured = false;

        res.send = (body: any): Response => {
            if (!responseCaptured) {
                responseBody = body;
                responseCaptured = true;
            }
            return originalSend(body);
        };

        res.json = (body: any): Response => {
            if (!responseCaptured) {
                responseBody = body;
                responseCaptured = true;
            }
            return originalJson(body);
        };

        res.on('finish', () => {
            const duration = Date.now() - start;
            const statusCode = res.statusCode;
            const timestamp = this.getFormattedTimestamp();

            // Decoded response body
            let decodedResponse = responseBody;
            if (typeof responseBody === 'string') {
                try {
                    decodedResponse = JSON.parse(responseBody);
                } catch {
                    decodedResponse = responseBody;
                }
            }

            const logDetails = {
                url: `${req.protocol}://${req.get('host') || 'localhost'}${originalUrl}`,
                method,
                status_code: statusCode,
                ip,
                user_agent: userAgent,
                user_id: (req as any).user?.id || null,
                duration: `${duration}ms`,
                request_data: this.sanitizeData(body || {}),
                response_data: decodedResponse
            };

            const logEntry = `[${timestamp}] ${method} ${originalUrl} ${statusCode} - ${duration}ms\n` +
                `Details: ${JSON.stringify(logDetails)}\n` +
                `------------------------------------------------------------\n`;

            try {
                fs.appendFileSync(this.logFilePath, logEntry);

                if (statusCode >= 400) {
                    let stackTrace = '';
                    if (decodedResponse && decodedResponse.errors) {
                        stackTrace = `\nValidation Errors: ${JSON.stringify(decodedResponse.errors, null, 2)}`;
                    } else if (decodedResponse && decodedResponse.payload && decodedResponse.payload.errors) {
                        stackTrace = `\nValidation Errors: ${JSON.stringify(decodedResponse.payload.errors, null, 2)}`;
                    } else if (decodedResponse && decodedResponse.stack) {
                        stackTrace = `\nStack Trace: ${decodedResponse.stack}`;
                    } else if (decodedResponse && decodedResponse.message && typeof decodedResponse.message === 'string') {
                        stackTrace = `\nError Message: ${decodedResponse.message}`;
                    }

                    const errorLogEntry = `[${timestamp}] local.ERROR: HTTP Error Response ${JSON.stringify(logDetails)}${stackTrace}\n`;
                    fs.appendFileSync(this.errorLogFilePath, errorLogEntry);

                    // Console logging
                    console.error(`[${timestamp}] ERROR ${method} ${originalUrl} => ${statusCode}`);
                }
            } catch (err) {
                console.error('Failed to write to log file:', err);
            }
        });

        next();
    }

    private getFormattedTimestamp(): string {
        return new Date().toISOString().replace('T', ' ').split('.')[0];
    }

    private sanitizeData(data: any): any {
        if (!data || typeof data !== 'object') return data;

        if (Array.isArray(data)) {
            return data.map(item => this.sanitizeData(item));
        }

        const sanitized: Record<string, any> = {};
        for (const [key, value] of Object.entries(data)) {
            const isSensitive = this.sensitiveFields.some(
                field => key.toLowerCase().includes(field.toLowerCase())
            );

            if (isSensitive) {
                sanitized[key] = '***REDACTED***';
            } else if (value && typeof value === 'object') {
                sanitized[key] = this.sanitizeData(value);
            } else {
                sanitized[key] = value;
            }
        }
        return sanitized;
    }
}
