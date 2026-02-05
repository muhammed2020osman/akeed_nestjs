
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionItemsService } from './action-items.service';
import { ActionItemsController } from './action-items.controller';
import { ActionItem } from './entities/action-item.entity';
import { Message } from '../messages/entities/message.entity';

@Module({
    imports: [TypeOrmModule.forFeature([ActionItem, Message])],
    controllers: [ActionItemsController],
    providers: [ActionItemsService],
    exports: [ActionItemsService],
})
export class ActionItemsModule { }
