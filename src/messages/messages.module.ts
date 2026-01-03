import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { DirectMessagesService } from './direct-messages.service';
import { DirectMessagesController } from './direct-messages.controller';
import { MessagesGateway } from './messages.gateway';
import { Message } from './entities/message.entity';
import { DirectMessage } from './entities/direct-message.entity';
import { User } from '../users/entities/user.entity';
import { ChannelsModule } from '../channels/channels.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Message, DirectMessage, User]),
    forwardRef(() => ChannelsModule),
    JwtModule,
    ConfigModule,
    NotificationsModule,
  ],
  controllers: [MessagesController, DirectMessagesController],
  providers: [MessagesService, DirectMessagesService, MessagesGateway],
  exports: [MessagesService, DirectMessagesService, MessagesGateway],
})
export class MessagesModule { }

