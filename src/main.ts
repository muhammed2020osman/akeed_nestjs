import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { ValidationException } from './common/exceptions/validation.exception';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS - matching Laravel configuration
  app.enableCors({
    origin: [
      process.env.APP_URL,
      process.env.LARAVEL_APP_URL,
      'https://tafaahum.vercel.app',
      'https://school.gumra-ai.com',
      'https://marketplace.zoom.us',
      'https://souglink.com',
      'https://www.souglink.com',
    ].filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'X-Workspace-Id'],
  });

  // Global prefix for API routes
  app.setGlobalPrefix('api');

  // Global Validation Pipe - matching Laravel validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors) => {
        // Format validation errors to match Laravel format
        const formattedErrors: Record<string, string[]> = {};
        errors.forEach((error) => {
          formattedErrors[error.property] = Object.values(
            error.constraints || {},
          );
        });
        return new ValidationException(formattedErrors);
      },
    }),
  );

  // Global Exception Filter - matching Laravel error format
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global Response Interceptor - matching Laravel response format
  app.useGlobalInterceptors(new ResponseInterceptor());

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();
