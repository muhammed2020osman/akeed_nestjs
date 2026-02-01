import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
    private logFilePath = path.resolve(__dirname, '../../../../debug.log');
    private errorLogFilePath = path.resolve(__dirname, '../../../../error.log');

    use(req: Request, res: Response, next: NextFunction) {
        const { method, originalUrl, body } = req;
        const start = Date.now();

        res.on('finish', () => {
            const duration = Date.now() - start;
            const statusCode = res.statusCode;

            const logEntry = `[${new Date().toISOString()}] ${method} ${originalUrl} ${statusCode} - ${duration}ms\n` +
                `Body: ${JSON.stringify(body)}\n` +
                `Files: ${JSON.stringify((req as any).files || (req as any).file || 'None')}\n` +
                `------------------------------------------------------------\n`;

            try {
                fs.appendFileSync(this.logFilePath, logEntry);
                
                // Log errors separately
                if (statusCode >= 400) {
                    const errorLogEntry = `[${new Date().toISOString()}] ERROR ${method} ${originalUrl} ${statusCode} - ${duration}ms\n` +
                        `Body: ${JSON.stringify(body)}\n` +
                        `Response: ${res.statusMessage || 'Unknown error'}\n` +
                        `============================================================\n`;
                    fs.appendFileSync(this.errorLogFilePath, errorLogEntry);
                    
                    // Also log to console for immediate visibility
                    console.error(`[ERROR REQUEST] ${method} ${originalUrl} => ${statusCode}`);
                    console.error(`[ERROR BODY]`, JSON.stringify(body, null, 2));
                }
            } catch (err) {
                console.error('Failed to write to log file:', err);
            }
        });

        next();
    }
}
