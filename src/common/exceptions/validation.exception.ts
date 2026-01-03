import { HttpException, HttpStatus } from '@nestjs/common';

export class ValidationException extends HttpException {
  constructor(public errors: Record<string, string[]>) {
    super(
      {
        success: false,
        message: 'Validation failed',
        payload: {
          errors: errors,
        },
        status: HttpStatus.UNPROCESSABLE_ENTITY,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}









