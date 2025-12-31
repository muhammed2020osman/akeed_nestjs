import {
    Injectable,
    NotFoundException,
    ForbiddenException,
    Inject,
    forwardRef,
    Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DirectMessage } from './entities/direct-message.entity';
import { CreateDirectMessageDto } from './dto/create-direct-message.dto';
import { MessagesGateway } from './messages.gateway';

@Injectable()
export class DirectMessagesService {
    constructor(
        @InjectRepository(DirectMessage)
        private directMessageRepository: Repository<DirectMessage>,
        @Optional()
        @Inject(forwardRef(() => MessagesGateway))
        private messagesGateway?: MessagesGateway,
    ) { }

    async findAll(
        userId: number,
        companyId: number,
        page: number = 1,
        perPage: number = 50,
    ): Promise<{ data: DirectMessage[]; meta: any }> {
        const skip = (page - 1) * perPage;

        // This fetches all DMs for the user (inbox/outbox style)
        const [data, total] = await this.directMessageRepository.findAndCount({
            where: [
                { fromUserId: userId, companyId },
                { toUserId: userId, companyId },
            ],
            relations: ['fromUser', 'toUser', 'replyTo'],
            order: { createdAt: 'DESC' },
            skip,
            take: perPage,
        });

        const totalPages = Math.ceil(total / perPage);

        return {
            data,
            meta: {
                current_page: page,
                per_page: perPage,
                total,
                last_page: totalPages,
            },
        };
    }

    async getConversation(
        userId: number,
        otherUserId: number,
        companyId: number,
        page: number = 1,
        perPage: number = 50,
    ): Promise<{ data: DirectMessage[]; meta: any }> {
        const skip = (page - 1) * perPage;

        const [data, total] = await this.directMessageRepository.findAndCount({
            where: [
                { fromUserId: userId, toUserId: otherUserId, companyId },
                { fromUserId: otherUserId, toUserId: userId, companyId },
            ],
            relations: ['fromUser', 'toUser', 'replyTo'],
            order: { createdAt: 'DESC' },
            skip,
            take: perPage,
        });

        const totalPages = Math.ceil(total / perPage);

        return {
            data,
            meta: {
                current_page: page,
                per_page: perPage,
                total,
                last_page: totalPages,
            },
        };
    }

    async create(
        createDto: CreateDirectMessageDto,
        userId: number,
        companyId: number,
    ): Promise<DirectMessage> {
        const newMessage = this.directMessageRepository.create({
            ...createDto,
            fromUserId: userId,
            companyId,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const savedMessage = await this.directMessageRepository.save(newMessage);

        const loadedMessage = await this.directMessageRepository.findOne({
            where: { id: savedMessage.id },
            relations: ['fromUser', 'toUser', 'replyTo'],
        });

        if (!loadedMessage) {
            throw new NotFoundException('Message not found after creation');
        }

        // Broadcast DM sent event via Socket gateway
        if (this.messagesGateway) {
            this.messagesGateway.broadcastDirectMessageSent(loadedMessage);
        }

        return loadedMessage;
    }

    async markAsRead(id: number, userId: number): Promise<void> {
        const message = await this.directMessageRepository.findOne({ where: { id } });
        if (!message) throw new NotFoundException('Message not found');

        if (message.toUserId != userId) {
            throw new ForbiddenException('You can only mark your own messages as read');
        }

        message.isRead = true;
        await this.directMessageRepository.save(message);
    }

    async remove(id: number, userId: number): Promise<void> {
        const message = await this.directMessageRepository.findOne({ where: { id } });
        if (!message) throw new NotFoundException('Message not found');

        if (message.fromUserId != userId) {
            throw new ForbiddenException('You can only delete your own messages');
        }

        await this.directMessageRepository.remove(message);

        if (this.messagesGateway) {
            this.messagesGateway.broadcastDirectMessageDeleted(id, message.fromUserId, message.toUserId);
        }
    }

    async getUnreadCount(userId: number, companyId: number): Promise<number> {
        return await this.directMessageRepository.count({
            where: { toUserId: userId, companyId, isRead: false },
        });
    }

    async getConversations(
        userId: number,
        companyId: number,
    ): Promise<any[]> {
        // We need to find unique users that the current user has exchanged messages with.
        // We'll use a raw query or a complex query builder to get one latest message per user.

        // Let's use QueryBuilder for better performance and grouping
        const query = this.directMessageRepository
            .createQueryBuilder('dm')
            .leftJoinAndSelect('dm.fromUser', 'fromUser')
            .leftJoinAndSelect('dm.toUser', 'toUser')
            .where('dm.companyId = :companyId', { companyId })
            .andWhere('(dm.fromUserId = :userId OR dm.toUserId = :userId)', { userId })
            .orderBy('dm.createdAt', 'DESC');

        const allMessages = await query.getMany();

        const conversationsMap = new Map<number, any>();

        for (const msg of allMessages) {
            const otherUser = msg.fromUserId === userId ? msg.toUser : msg.fromUser;
            if (!otherUser) continue;

            if (!conversationsMap.has(otherUser.id)) {
                conversationsMap.set(otherUser.id, {
                    user: otherUser,
                    last_message: msg,
                    unread_count: 0
                });
            }

            if (!msg.isRead && msg.toUserId === userId) {
                conversationsMap.get(otherUser.id).unread_count++;
            }
        }

        return Array.from(conversationsMap.values());
    }
}
