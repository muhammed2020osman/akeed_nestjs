import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
    private logFilePath = path.resolve(__dirname, '../../../../debug.log');

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
            } catch (err) {
                console.error('Failed to write to log file:', err);
            }
        });

        next();
    }
}
