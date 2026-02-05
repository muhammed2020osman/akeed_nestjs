import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { MessagesModule } from './messages/messages.module';
import { ChannelsModule } from './channels/channels.module';
import { NotificationsModule } from './notifications/notifications.module';
import { FCMModule } from './fcm/fcm.module';
import { ActionItemsModule } from './action-items/action-items.module';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { SaveApiResponsesMiddleware } from './common/middleware/save-api-responses.middleware';
import { TicketsModule } from './tickets/tickets.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport: {
          targets: [
            {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'yyyy-mm-dd HH:MM:ss',
                ignore: 'pid,hostname',
              },
            },
            {
              target: 'pino/file',
              options: { destination: './debug/pino.log', mkdir: true },
            },
          ],
        },
        serializers: {
          req: (req) => ({
            method: req.method,
            url: req.url,
            body: req.raw.body,
            query: req.query,
            params: req.params,
          }),
        },
      },
    }),
    DatabaseModule,
    AuthModule,
    MessagesModule,
    ChannelsModule,
    NotificationsModule,
    FCMModule,
    ActionItemsModule,
    TicketsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply LoggerMiddleware to all routes
    consumer.apply(LoggerMiddleware).forRoutes('*');

    // Apply SaveApiResponsesMiddleware to all routes
    // It will internally check for /api/* paths and development environment
    consumer.apply(SaveApiResponsesMiddleware).forRoutes('*');
  }
}
