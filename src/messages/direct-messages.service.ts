import {
    Injectable,
    NotFoundException,
    ForbiddenException,
    Inject,
    forwardRef,
    Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { DirectMessage } from './entities/direct-message.entity';
import { User } from '../users/entities/user.entity';
import { Conversation } from './entities/conversation.entity';
import { CreateDirectMessageDto } from './dto/create-direct-message.dto';
import { MessagesGateway } from './messages.gateway';

@Injectable()
export class DirectMessagesService {
    constructor(
        @InjectRepository(DirectMessage)
        private directMessageRepository: Repository<DirectMessage>,
        @InjectRepository(User)
        private userRepository: Repository<User>,
        @InjectRepository(Conversation)
        private conversationRepository: Repository<Conversation>,
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
        // Verify that the other user exists and is in the same company
        const otherUser = await this.userRepository.findOne({
            where: { id: otherUserId, companyId },
        });

        if (!otherUser) {
            throw new NotFoundException('User not found or not in the same company');
        }

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
    async getSelfConversation(
        userId: number,
        companyId: number,
        page: number = 1,
        perPage: number = 50,
    ): Promise<{ data: DirectMessage[]; meta: any }> {
        const skip = (page - 1) * perPage;

        const [data, total] = await this.directMessageRepository.findAndCount({
            where: {
                fromUserId: userId,
                toUserId: userId,
                companyId,
            },
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
        // Find or create conversation
        const u1 = Math.min(userId, createDto.toUserId);
        const u2 = Math.max(userId, createDto.toUserId);

        let conversation = await this.conversationRepository.findOne({
            where: { user1Id: u1, user2Id: u2 }
        });

        if (!conversation) {
            conversation = this.conversationRepository.create({
                companyId,
                user1Id: u1,
                user2Id: u2,
            });
            conversation = await this.conversationRepository.save(conversation);
        }

        const newMessage = this.directMessageRepository.create({
            ...createDto,
            fromUserId: userId,
            companyId,
            conversationId: conversation.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const savedMessage = await this.directMessageRepository.save(newMessage);

        // Update conversation last message
        await this.conversationRepository.update(conversation.id, {
            lastMessageId: savedMessage.id,
            lastMessageText: savedMessage.content,
            lastMessageAt: savedMessage.createdAt,
            updatedAt: new Date(),
        });

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
        const message = await this.directMessageRepository.findOne({
            where: { id },
        });
        if (!message) throw new NotFoundException('Message not found');

        if (message.fromUserId != userId) {
            throw new ForbiddenException('You can only delete your own messages');
        }

        const conversationId = message.conversationId;
        await this.directMessageRepository.remove(message);

        // Update conversation if it was the last message
        if (conversationId) {
            const conversation = await this.conversationRepository.findOne({
                where: { id: conversationId },
            });

            // If lastMessageId matches the deleted ID (it might be null already because of FK SET NULL)
            // or if we just want to be sure it's correct
            const newLastMessage = await this.directMessageRepository.findOne({
                where: { conversationId },
                order: { createdAt: 'DESC' }
            });

            if (newLastMessage) {
                await this.conversationRepository.update(conversationId, {
                    lastMessageId: newLastMessage.id,
                    lastMessageText: newLastMessage.content,
                    lastMessageAt: newLastMessage.createdAt,
                    updatedAt: newLastMessage.createdAt,
                });
            } else {
                await this.conversationRepository.update(conversationId, {
                    lastMessageId: null,
                    lastMessageText: null,
                    lastMessageAt: null,
                });
            }
        }

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
        _companyId: number, // companyId is kept for interface compatibility but ignored to fetch ALL user's DMs
        limit: number = 50,
    ): Promise<any[]> {
        // Fetch conversations where the user is either user1 or user2
        const conversations = await this.conversationRepository.find({
            where: [
                { user1Id: userId },
                { user2Id: userId },
            ],
            relations: ['user1', 'user2', 'lastMessage', 'lastMessage.fromUser', 'lastMessage.toUser'],
            order: { updatedAt: 'DESC' },
            take: limit,
        });

        if (conversations.length === 0) return [];

        // Group unread counts by peer to fetch them efficiently in one query
        const unreadCountsRaw = await this.directMessageRepository
            .createQueryBuilder('dm')
            .select('dm.fromUserId', 'peerId')
            .addSelect('COUNT(dm.id)', 'count')
            .where('dm.toUserId = :userId', { userId })
            .andWhere('dm.isRead = :isRead', { isRead: false })
            .andWhere('dm.deletedAt IS NULL')
            .groupBy('dm.fromUserId')
            .getRawMany();

        const unreadCountsMap = new Map<number, number>();
        unreadCountsRaw.forEach(r => unreadCountsMap.set(Number(r.peerId), Number(r.count)));

        // Assemble results
        return conversations.map(conv => {
            const otherUser = conv.user1Id === Number(userId) ? conv.user2 : conv.user1;
            return {
                user: otherUser,
                last_message: conv.lastMessage,
                unread_count: unreadCountsMap.get(otherUser.id) || 0,
            };
        });
    }
}
