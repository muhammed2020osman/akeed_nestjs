import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        // If response is already in Laravel format, return as is
        if (data && typeof data === 'object' && 'status' in data && 'code' in data) {
          return this.toSnakeCase(data);
        }

        // Transform to Laravel-like response format
        const response = context.switchToHttp().getResponse();
        const statusCode = response.statusCode || 200;

        return this.toSnakeCase({
          status: statusCode >= 200 && statusCode < 400,
          code: statusCode,
          message: this.getDefaultMessage(statusCode),
          payload: data,
        });
      }),
    );
  }

  private getDefaultMessage(statusCode: number): string {
    const messages: Record<number, string> = {
      200: 'Request successful',
      201: 'Resource created successfully',
      204: 'Resource deleted successfully',
    };
    return messages[statusCode] || 'Request successful';
  }

  private toSnakeCase(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (obj instanceof Date) {
      return obj.toISOString();
    }
    if (Array.isArray(obj)) {
      return obj.map((v) => this.toSnakeCase(v));
    }
    return Object.keys(obj).reduce((result, key) => {
      const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
      let value = obj[key];

      // Handle null or undefined timestamps to match Laravel style (always present)
      if (
        (snakeKey === 'created_at' || snakeKey === 'updated_at') &&
        (value === null || value === undefined)
      ) {
        value = new Date().toISOString();
      }

      result[snakeKey] = this.toSnakeCase(value);
      return result;
    }, {});
  }
}









