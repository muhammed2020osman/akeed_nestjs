
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActionItem, ActionStatus } from './entities/action-item.entity';
import { CreateActionItemDto } from './dto/create-action-item.dto';
import { UpdateActionItemDto } from './dto/update-action-item.dto';
import { Message } from '../messages/entities/message.entity';

@Injectable()
export class ActionItemsService {
    constructor(
        @InjectRepository(ActionItem)
        private actionItemsRepository: Repository<ActionItem>,
        @InjectRepository(Message)
        private messagesRepository: Repository<Message>,
    ) { }

    async create(createActionItemDto: CreateActionItemDto, userId: number): Promise<ActionItem> {
        const message = await this.messagesRepository.findOne({
            where: { id: createActionItemDto.messageId },
        });

        if (!message) {
            throw new NotFoundException(`Message with ID ${createActionItemDto.messageId} not found`);
        }

        if (!message.channelId) {
            throw new Error("Message must belong to a channel to create an action item");
        }

        const actionItem = this.actionItemsRepository.create({
            ...createActionItemDto,
            channelId: message.channelId,
            userId,
        } as ActionItem);

        return this.actionItemsRepository.save(actionItem);
    }

    async findAllByChannel(channelId: number): Promise<ActionItem[]> {
        return this.actionItemsRepository.find({
            where: { channelId },
            relations: ['creator', 'assignee', 'message'],
            order: { createdAt: 'DESC' },
        });
    }

    async findAllByMessage(messageId: number): Promise<ActionItem[]> {
        return this.actionItemsRepository.find({
            where: { messageId },
            relations: ['creator', 'assignee'],
            order: { createdAt: 'DESC' },
        });
    }

    async findOne(id: number): Promise<ActionItem> {
        const actionItem = await this.actionItemsRepository.findOne({
            where: { id },
            relations: ['creator', 'assignee', 'message'],
        });

        if (!actionItem) {
            throw new NotFoundException(`ActionItem with ID ${id} not found`);
        }

        return actionItem;
    }

    async update(id: number, updateActionItemDto: UpdateActionItemDto): Promise<ActionItem> {
        const actionItem = await this.findOne(id);

        // Check if status is correct enum value if provided
        if (updateActionItemDto.status && !Object.values(ActionStatus).includes(updateActionItemDto.status)) {
            // This validation is technically handled by DTO + ValidationPipe, but added for safety
            delete updateActionItemDto.status;
        }

        Object.assign(actionItem, updateActionItemDto);
        return this.actionItemsRepository.save(actionItem);
    }

    async remove(id: number): Promise<void> {
        const result = await this.actionItemsRepository.delete(id);
        if (result.affected === 0) {
            throw new NotFoundException(`ActionItem with ID ${id} not found`);
        }
    }
}
