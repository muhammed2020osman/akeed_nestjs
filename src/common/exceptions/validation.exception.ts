import { HttpException, HttpStatus } from '@nestjs/common';

export class ValidationException extends HttpException {
  constructor(public errors: Record<string, string[]>) {
    // Extract the first error message to be the primary message
    const firstField = Object.keys(errors)[0];
    const firstError = firstField ? errors[firstField][0] : 'Validation failed';

    super(
      {
        success: false,
        message: firstError,
        errors: errors,
        payload: {
          errors: errors,
        },
        status: HttpStatus.UNPROCESSABLE_ENTITY,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}












