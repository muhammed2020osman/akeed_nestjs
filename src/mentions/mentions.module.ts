import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from '../channels/entities/channel.entity';
import { User } from '../users/entities/user.entity';
import { MessageMention } from '../messages/entities/message-mention.entity';
import { Message } from '../messages/entities/message.entity';
import { MentionsController } from './mentions.controller';
import { MentionsService } from './mentions.service';

@Module({
  imports: [TypeOrmModule.forFeature([MessageMention, Message, User, Channel])],
  controllers: [MentionsController],
  providers: [MentionsService],
})
export class MentionsModule {}
