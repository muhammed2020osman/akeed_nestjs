import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response, Request } from 'express';
import * as fs from 'fs';
import * as path from 'path';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private errorLogFilePath = path.resolve(__dirname, '../../../../error.log');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: any = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as any;
        message = responseObj.message || exception.message;
        errors = responseObj.errors || null;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    // Log detailed error information
    const errorLogEntry = `[${new Date().toISOString()}] EXCEPTION ${request.method} ${request.originalUrl} ${status}\n` +
      `Message: ${JSON.stringify(message)}\n` +
      `Errors: ${JSON.stringify(errors)}\n` +
      `Stack: ${exception instanceof Error ? exception.stack : 'No stack trace'}\n` +
      `Request Body: ${JSON.stringify(request.body)}\n` +
      `Request Query: ${JSON.stringify(request.query)}\n` +
      `Request Params: ${JSON.stringify(request.params)}\n` +
      `============================================================\n`;

    try {
      fs.appendFileSync(this.errorLogFilePath, errorLogEntry);
    } catch (err) {
      console.error('Failed to write error log:', err);
    }

    // Log to console for immediate visibility
    console.error(`[EXCEPTION] ${request.method} ${request.originalUrl} => ${status}`);
    console.error(`[EXCEPTION MESSAGE]`, message);
    if (exception instanceof Error && exception.stack) {
      console.error(`[EXCEPTION STACK]`, exception.stack);
    }

    // Laravel-like error response format
    const errorResponse = {
      success: false,
      message: Array.isArray(message) ? message[0] : message,
      payload: errors || null,
      status: status,
    };

    response.status(status).json(errorResponse);
  }
}












