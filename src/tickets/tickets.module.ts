import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { Ticket } from './entities/ticket.entity';
import { ActionItem } from '../action-items/entities/action-item.entity';
import { User } from '../users/entities/user.entity';
import { Channel } from '../channels/entities/channel.entity';
import { Message } from '../messages/entities/message.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Ticket, ActionItem, User, Channel, Message])],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService]
})
export class TicketsModule { }
