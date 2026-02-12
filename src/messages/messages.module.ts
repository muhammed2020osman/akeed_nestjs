import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionItem } from '../action-items/entities/action-item.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { User } from '../users/entities/user.entity';
import { DirectMessagesController } from './direct-messages.controller';
import { DirectMessagesService } from './direct-messages.service';
import { Attachment } from './entities/attachment.entity';
import { Conversation } from './entities/conversation.entity';
import { DirectMessage } from './entities/direct-message.entity';
import { MessageAction } from './entities/message-action.entity';
import { MessageMention } from './entities/message-mention.entity';
import { MessageReaction } from './entities/message-reaction.entity';
import { Message } from './entities/message.entity';
import { PollOption } from './entities/poll-option.entity';
import { PollVote } from './entities/poll-vote.entity';
import { Poll } from './entities/poll.entity';
import { Topic } from './entities/topic.entity';
import { MessagesController } from './messages.controller';
import { MessagesGateway } from './messages.gateway';
import { MessagesService } from './messages.service';

import { ChannelsModule } from '../channels/channels.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Message,
      DirectMessage,
      Attachment,
      User,
      Poll,
      PollOption,
      PollVote,
      Topic,
      Conversation,
      MessageReaction,
      MessageAction,
      MessageMention,
      Ticket,
      ActionItem,
    ]),
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

