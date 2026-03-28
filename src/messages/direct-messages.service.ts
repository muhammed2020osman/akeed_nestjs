import {
    ForbiddenException,
    forwardRef,
    Inject,
    Injectable,
    NotFoundException,
    Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateDirectMessageDto } from './dto/create-direct-message.dto';
import { Attachment } from './entities/attachment.entity';
import { Conversation } from './entities/conversation.entity';
import { DirectMessage } from './entities/direct-message.entity';
import { MessageAction } from './entities/message-action.entity';
import { MessageReaction } from './entities/message-reaction.entity';
import { MessagesGateway } from './messages.gateway';

@Injectable()
export class DirectMessagesService {
    constructor(
        @InjectRepository(DirectMessage)
        private directMessageRepository: Repository<DirectMessage>,
        @InjectRepository(Conversation)
        private conversationRepository: Repository<Conversation>,
        @InjectRepository(MessageReaction)
        private reactionRepository: Repository<MessageReaction>,
        @InjectRepository(MessageAction)
        private actionRepository: Repository<MessageAction>,
        @InjectRepository(Attachment)
        private attachmentRepository: Repository<Attachment>,
        private notificationsService: NotificationsService,
        private configService: ConfigService,
        @Optional()
        @Inject(forwardRef(() => MessagesGateway))
        private messagesGateway?: MessagesGateway,
    ) { }

    public transformDirectMessage(message: DirectMessage, currentUserId?: number) {
        const baseUrl = this.configService.get<string>('LARAVEL_APP_URL') || process.env.LARAVEL_APP_URL || 'https://slackapi.sootnote.com';

        // Add domain to attachmentUrl if it's relative
        let attachmentUrl = message.attachmentUrl;
        if (attachmentUrl && !attachmentUrl.startsWith('http')) {
            attachmentUrl = `${baseUrl}/${attachmentUrl.startsWith('/') ? attachmentUrl.slice(1) : attachmentUrl}`;
        }

        // Add domain to attachments array items
        let attachments = (message.attachments || []).map(att => ({
            ...att,
            url: att.url && !att.url.startsWith('http')
                ? `${baseUrl}/${att.url.startsWith('/') ? att.url.slice(1) : att.url}`
                : att.url
        }));

        // Backward compatibility: If attachments is empty but attachmentUrl is present
        if (attachments.length === 0 && attachmentUrl) {
            attachments.push({
                id: message.id || 0,
                url: attachmentUrl,
                filename: message.attachmentName || 'attachment',
                originalName: message.attachmentName || 'attachment',
                mimeType: message.attachmentType || 'application/octet-stream',
                size: '0',
                companyId: message.companyId,
                messageId: message.id,
                createdBy: message.fromUserId,
                createdAt: message.createdAt,
                updatedAt: message.updatedAt,
            } as any);
        }

        return {
            ...message,
            attachmentUrl,
            attachments,
            is_urgent: !!message.isUrgent,
            reactions: this.transformReactions(message.reactions || []),
            is_pinned: (message.actions || []).some(a => a.actionType === 'pin' && a.isActive),
            is_starred: currentUserId
                ? (message.actions || []).some(a => a.userId === currentUserId && a.actionType === 'favorite' && a.isActive)
                : (message.actions || []).some(a => a.actionType === 'favorite' && a.isActive),
        };
    }

    private transformReactions(reactions: MessageReaction[]) {
        const grouped = new Map<string, number[]>();
        reactions.forEach((r) => {
            if (!grouped.has(r.emoji)) {
                grouped.set(r.emoji, []);
            }
            grouped.get(r.emoji)!.push(r.userId);
        });

        return Array.from(grouped.entries()).map(([emoji, users]) => ({
            emoji,
            users,
        }));
    }

    async findAll(
        userId: number,
        companyId: number,
        workspaceId: number,
        page: number = 1,
        perPage: number = 50,
    ): Promise<{ data: any[]; meta: any }> {
        if (!workspaceId) {
            throw new Error('Workspace ID is required for direct messages');
        }

        const skip = (page - 1) * perPage;

        // Build where conditions with workspaceId filter
        const whereConditions: any[] = [
            { fromUserId: userId, companyId, conversation: { workspaceId } },
            { toUserId: userId, companyId, conversation: { workspaceId } },
        ];

        // This fetches all DMs for the user (inbox/outbox style)
        const [data, total] = await this.directMessageRepository.findAndCount({
            where: whereConditions,
            relations: ['fromUser', 'toUser', 'replyTo', 'conversation', 'reactions', 'actions', 'attachments'],
            order: { createdAt: 'DESC' },
            skip,
            take: perPage,
        });

        const totalPages = Math.ceil(total / perPage);

        return {
            data: data.map((message) => this.transformDirectMessage(message, userId)),
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
        workspaceId: number,
        page: number = 1,
        perPage: number = 50,
    ): Promise<{ data: any[]; meta: any; conversation: Conversation }> {
        if (!workspaceId) {
            throw new Error('Workspace ID is required for direct messages');
        }

        // Find or create conversation record
        const u1 = Math.min(userId, otherUserId);
        const u2 = Math.max(userId, otherUserId);

        let conversation = await this.conversationRepository.findOne({
            where: { workspaceId, user1Id: u1, user2Id: u2 }
        });

        if (!conversation) {
            conversation = this.conversationRepository.create({
                companyId,
                workspaceId,
                user1Id: u1,
                user2Id: u2,
            });
            conversation = await this.conversationRepository.save(conversation);
        }

        const skip = (page - 1) * perPage;

        const [data, total] = await this.directMessageRepository.findAndCount({
            where: { conversationId: conversation.id },
            relations: ['fromUser', 'toUser', 'replyTo', 'reactions', 'actions', 'attachments'],
            order: { createdAt: 'DESC' },
            skip,
            take: perPage,
        });

        const totalPages = Math.ceil(total / perPage);

        return {
            data: data.map((message) => this.transformDirectMessage(message, userId)),
            meta: {
                current_page: page,
                per_page: perPage,
                total,
                last_page: totalPages,
            },
            conversation,
        };
    }
    async getConversationById(
        id: number,
        userId: number,
        workspaceId: number | null,
        page: number = 1,
        perPage: number = 50,
    ): Promise<{ data: any[]; meta: any; conversation: Conversation }> {
        // Convert userId to number to ensure type consistency
        const userIdNum = Number(userId);

        console.log('🔍 getConversationById called with:', {
            conversationId: id,
            userId: userIdNum,
            userIdType: typeof userIdNum,
            workspaceId,
            page,
            perPage
        });

        const whereCondition: any = { id };
        if (workspaceId !== null) {
            whereCondition.workspaceId = workspaceId;
        }

        console.log('🔍 Searching for conversation with condition:', whereCondition);

        const conversation = await this.conversationRepository.findOne({
            where: whereCondition,
            relations: ['user1', 'user2']
        });

        console.log('🔍 Conversation found:', conversation ? {
            id: conversation.id,
            workspaceId: conversation.workspaceId,
            user1Id: conversation.user1Id,
            user1IdType: typeof conversation.user1Id,
            user2Id: conversation.user2Id,
            user2IdType: typeof conversation.user2Id
        } : 'NOT FOUND');

        if (!conversation) {
            throw new NotFoundException(`Conversation with ID ${id} not found in workspace ${workspaceId}`);
        }

        // Verify user is part of the conversation (with type-safe comparison)
        if (conversation.user1Id !== userIdNum && conversation.user2Id !== userIdNum) {
            console.log('❌ User not part of conversation:', {
                userId: userIdNum,
                userIdType: typeof userIdNum,
                user1Id: conversation.user1Id,
                user1IdType: typeof conversation.user1Id,
                user2Id: conversation.user2Id,
                user2IdType: typeof conversation.user2Id,
                comparison1: conversation.user1Id !== userIdNum,
                comparison2: conversation.user2Id !== userIdNum
            });
            throw new ForbiddenException('You are not part of this conversation');
        }

        // Verify workspaceId matches if provided (with type-safe comparison)
        if (workspaceId !== null && Number(conversation.workspaceId) !== Number(workspaceId)) {
            console.log('❌ Workspace mismatch:', {
                requestedWorkspaceId: workspaceId,
                requestedWorkspaceIdType: typeof workspaceId,
                conversationWorkspaceId: conversation.workspaceId,
                conversationWorkspaceIdType: typeof conversation.workspaceId,
                comparison: Number(conversation.workspaceId) !== Number(workspaceId)
            });
            throw new ForbiddenException('Conversation does not belong to this workspace');
        }

        const skip = (page - 1) * perPage;

        console.log('🔍 Fetching messages for conversationId:', id);

        const [data, total] = await this.directMessageRepository.findAndCount({
            where: { conversationId: id },
            relations: ['fromUser', 'toUser', 'replyTo', 'reactions', 'actions', 'attachments'],
            order: { createdAt: 'DESC' },
            skip,
            take: perPage,
        });

        console.log('✅ Found messages:', {
            count: data.length,
            total,
            page,
            perPage
        });

        const totalPages = Math.ceil(total / perPage);

        return {
            data: data.map((message) => this.transformDirectMessage(message, userIdNum)),
            meta: {
                current_page: page,
                per_page: perPage,
                total,
                last_page: totalPages,
            },
            conversation,
        };
    }

    async getSelfConversation(
        userId: number,
        companyId: number,
        workspaceId: number,
        page: number = 1,
        perPage: number = 50,
    ): Promise<{ data: any[]; meta: any; conversation: Conversation }> {
        if (!workspaceId) {
            throw new Error('Workspace ID is required for direct messages');
        }

        // Find or create self-conversation record
        let conversation = await this.conversationRepository.findOne({
            where: { workspaceId, user1Id: userId, user2Id: userId }
        });

        if (!conversation) {
            conversation = this.conversationRepository.create({
                companyId,
                workspaceId,
                user1Id: userId,
                user2Id: userId,
            });
            conversation = await this.conversationRepository.save(conversation);
        }

        const skip = (page - 1) * perPage;

        const [data, total] = await this.directMessageRepository.findAndCount({
            where: { conversationId: conversation.id },
            relations: ['fromUser', 'toUser', 'replyTo', 'reactions', 'actions', 'attachments'],
            order: { createdAt: 'DESC' },
            skip,
            take: perPage,
        });

        const totalPages = Math.ceil(total / perPage);

        return {
            data: data.map((message) => this.transformDirectMessage(message, userId)),
            meta: {
                current_page: page,
                per_page: perPage,
                total,
                last_page: totalPages,
            },
            conversation,
        };
    }

    async create(
        createDto: CreateDirectMessageDto,
        userId: number,
        companyId: number,
        workspaceId: number,
        files?: any[],
    ): Promise<any> {
        if (!workspaceId) {
            throw new Error('Workspace ID is required for direct messages');
        }

        // STRICT LOGIC: Conversation ID is REQUIRED
        if (!createDto.conversationId) {
            throw new Error('Conversation ID is required. Please call get-or-create endpoint first.');
        }

        // ✅ IDEMPOTENCY CHECK: If localId is provided, check for existing message
        if (createDto.localId) {
            const existingMessage = await this.directMessageRepository.findOne({
                where: {
                    localId: createDto.localId,
                    fromUserId: userId,
                },
                relations: ['fromUser', 'toUser', 'replyTo', 'attachments'],
            });

            if (existingMessage) {
                console.log(`🔄 [DirectMessagesService] Idempotent request detected: localId=${createDto.localId}, returning existing message id=${existingMessage.id}`);
                return existingMessage;
            }
        }

        // Validate conversation exists and belongs to workspace
        const conversation = await this.conversationRepository.findOne({
            where: { id: createDto.conversationId, workspaceId }
        });

        if (!conversation) {
            throw new NotFoundException('Conversation not found in this workspace');
        }

        // Validate user is part of conversation
        if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
            throw new ForbiddenException('You are not part of this conversation');
        }

        // Determine recipient
        const toUserId = conversation.user1Id === userId ? conversation.user2Id : conversation.user1Id;

        const newMessage = this.directMessageRepository.create({
            content: createDto.content,
            fromUserId: userId,
            toUserId: toUserId,
            companyId,
            conversationId: conversation.id,
            localId: createDto.localId, // Store localId for idempotency
            replyToId: createDto.replyToId,
            attachmentUrl: createDto.attachmentUrl,
            attachmentType: createDto.attachmentType,
            attachmentName: createDto.attachmentName,
            isUrgent: createDto.isUrgent || false,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const savedMessage = await this.directMessageRepository.save(newMessage);

        // Handle File Uploads via internal API (Laravel)
        if (files && files.length > 0) {
            console.log(`📂 [DirectMessagesService] Forwarding ${files.length} files to Laravel...`);

            const baseUrl = this.configService.get<string>('LARAVEL_APP_URL');
            const internalToken = this.configService.get<string>('INTERNAL_API_TOKEN', 'temp_internal_token_123');
            const uploadUrl = `${baseUrl}/api/internal/upload`;

            const axios = require('axios');
            const FormData = require('form-data');

            for (const file of files) {
                try {
                    const formData = new FormData();
                    formData.append('file', file.buffer, {
                        filename: file.originalname,
                        contentType: file.mimetype,
                    });
                    formData.append('directory', 'attachments');

                    const response = await axios.post(uploadUrl, formData, {
                        headers: {
                            ...formData.getHeaders(),
                            'X-Internal-Token': internalToken,
                        },
                    });

                    if (response.data && response.data.success) {
                        const filename = response.data.filename;
                        const relativeUrl = `uploads/attachments/${filename}`;

                        // Create Attachment Entity
                        const attachment = this.attachmentRepository.create({
                            companyId,
                            directMessageId: savedMessage.id,
                            filename: filename,
                            originalName: file.originalname,
                            mimeType: file.mimetype,
                            size: String(file.size),
                            url: relativeUrl,
                            createdBy: userId,
                        });

                        await this.attachmentRepository.save(attachment);

                        // Single attachment compatibility
                        if (!savedMessage.attachmentUrl) {
                            savedMessage.attachmentUrl = relativeUrl;
                            savedMessage.attachmentType = file.mimetype;
                            savedMessage.attachmentName = file.originalname;
                            await this.directMessageRepository.save(savedMessage);
                        }
                    }
                } catch (error) {
                    console.error('❌ [DirectMessagesService] Error uploading file to Laravel:', error.message);
                }
            }
        }

        // Update conversation last message
        await this.conversationRepository.update(conversation.id, {
            lastMessageId: savedMessage.id,
            lastMessageText: savedMessage.content,
            lastMessageAt: savedMessage.createdAt,
            updatedAt: new Date(),
        });

        const loadedMessage = await this.directMessageRepository.findOne({
            where: { id: savedMessage.id },
            relations: ['fromUser', 'toUser', 'replyTo', 'attachments'],
        });

        if (!loadedMessage) {
            throw new NotFoundException('Message not found after creation');
        }

        // Broadcast DM sent event via Socket gateway
        if (this.messagesGateway) {
            this.messagesGateway.broadcastDirectMessageSent(this.transformDirectMessage(loadedMessage, userId));
        }

        // Send Push Notification to Recipient
        try {
            await this.notificationsService.sendNotificationToUser(
                loadedMessage.toUserId,
                loadedMessage.fromUser.name, // Title: Sender Name
                loadedMessage.content, // Body: Message
                {
                    type: 'direct_message',
                    direct_message_id: String(loadedMessage.id),
                    from_user_id: String(loadedMessage.fromUserId),
                    user_name: loadedMessage.fromUser.name,
                    sender_name: loadedMessage.fromUser.name, // Added for Android compatibility
                    content: loadedMessage.content,
                    notification_tag: `dm_${loadedMessage.fromUserId}`,
                    is_urgent: loadedMessage.isUrgent ? 'true' : 'false',
                }
            );

            // Record in Database
            await this.notificationsService.recordDatabaseNotification(
                loadedMessage.toUserId,
                {
                    message_id: loadedMessage.id,
                    sender_id: loadedMessage.fromUserId,
                    sender_name: loadedMessage.fromUser.name,
                    sender_avatar: loadedMessage.fromUser.profileImageUrl,
                    content: loadedMessage.content,
                    channel_type: 'direct_message'
                }
            );
        } catch (error) {
            console.error('Error sending DM push notification:', error);
        }

        return this.transformDirectMessage(loadedMessage, userId);
    }

    async getOne(id: number, userId: number): Promise<any> {
        const message = await this.directMessageRepository.findOne({
            where: { id },
            relations: ['fromUser', 'toUser', 'replyTo', 'reactions', 'actions', 'conversation', 'attachments']
        });

        if (!message) throw new NotFoundException('Message not found');
        return this.transformDirectMessage(message, userId);
    }

    async toggleReaction(messageId: number, emoji: string, userId: number, companyId: number): Promise<any> {
        const existing = await this.reactionRepository.findOne({
            where: { directMessageId: messageId, userId, emoji },
        });

        if (existing) {
            await this.reactionRepository.remove(existing);
        } else {
            const reaction = this.reactionRepository.create({
                directMessageId: messageId,
                userId,
                companyId,
                emoji,
            });
            await this.reactionRepository.save(reaction);
        }

        const updatedMessage = await this.getOne(messageId, userId);

        if (this.messagesGateway) {
            this.messagesGateway.broadcastDirectMessageUpdated(updatedMessage);
        }

        return updatedMessage;
    }

    async toggleFavorite(messageId: number, userId: number, companyId: number): Promise<any> {
        const existing = await this.actionRepository.findOne({
            where: { directMessageId: messageId, userId, actionType: 'favorite' },
        });

        if (existing) {
            existing.isActive = !existing.isActive;
            await this.actionRepository.save(existing);
        } else {
            const action = this.actionRepository.create({
                directMessageId: messageId,
                userId,
                actionType: 'favorite',
                isActive: true,
            });
            await this.actionRepository.save(action);
        }

        const updatedMessage = await this.getOne(messageId, userId);

        // Broadcast to user's other devices
        if (this.messagesGateway) {
            this.messagesGateway.server.to(`private-user-${userId}`).emit('dm.updated', {
                message: updatedMessage,
            });
        }

        return updatedMessage;
    }

    async update(id: number, content: string, userId: number): Promise<any> {
        const message = await this.directMessageRepository.findOne({
            where: { id },
            relations: ['fromUser', 'toUser', 'replyTo', 'attachments']
        });

        if (!message) throw new NotFoundException('Message not found');
        if (message.fromUserId != userId) {
            throw new ForbiddenException('You can only update your own messages');
        }

        message.content = content;
        message.updatedAt = new Date();
        const updated = await this.directMessageRepository.save(message);

        // Load with attachments for broadcast
        const loadedUpdated = await this.getOne(id, userId);

        // Broadcast update
        if (this.messagesGateway) {
            this.messagesGateway.broadcastDirectMessageUpdated(loadedUpdated);
        }

        return loadedUpdated;
    }

    async markAsRead(id: number, userId: number): Promise<void> {
        const message = await this.directMessageRepository.findOne({ where: { id } });
        if (!message) throw new NotFoundException('Message not found');

        if (message.toUserId != userId) {
            throw new ForbiddenException('You can only mark your own messages as read');
        }

        message.isRead = true;
        await this.directMessageRepository.save(message);

        // Mark associated notifications as read
        try {
            await this.notificationsService.markDirectMessageNotificationsAsRead(userId, message.fromUserId);
        } catch (e) {
            console.error('Error marking DM notifications as read:', e);
        }
    }

    async markConversationAsRead(userId: number, otherUserId: number): Promise<void> {
        await this.directMessageRepository.update(
            { toUserId: userId, fromUserId: otherUserId, isRead: false },
            { isRead: true }
        );

        // Mark associated notifications as read
        try {
            await this.notificationsService.markDirectMessageNotificationsAsRead(userId, otherUserId);
        } catch (e) {
            console.error('Error marking DM conversation notifications as read:', e);
        }

        // Broadcast read event if gateway is available
        if (this.messagesGateway) {
            this.messagesGateway.broadcastDirectMessagesRead(userId, otherUserId);
        }
    }

    async remove(id: number, userId: number): Promise<void> {
        const message = await this.directMessageRepository.findOne({
            where: { id },
            relations: ['attachments']
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
                order: { createdAt: 'DESC' },
                relations: ['attachments']
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

    async getUnreadCount(userId: number, companyId: number, workspaceId: number): Promise<number> {
        if (!workspaceId) {
            throw new Error('Workspace ID is required for direct messages');
        }

        const whereCondition: any = {
            toUserId: userId,
            companyId,
            isRead: false,
            conversation: { workspaceId }
        };

        return await this.directMessageRepository.count({
            where: whereCondition,
            relations: ['conversation'],
        });
    }

    async getConversations(
        userId: number,
        _companyId: number, // companyId is kept for interface compatibility but ignored to fetch ALL user's DMs
        workspaceId: number | undefined | null,
        limit: number = 50,
    ): Promise<any[]> {
        // Build where conditions with workspaceId filter if provided
        const baseCondition = { lastMessageId: Not(IsNull()) };
        const whereConditions: any[] = [];

        if (workspaceId) {
            whereConditions.push({ user1Id: userId, workspaceId, ...baseCondition });
            whereConditions.push({ user2Id: userId, workspaceId, ...baseCondition });
        } else {
            whereConditions.push({ user1Id: userId, ...baseCondition });
            whereConditions.push({ user2Id: userId, ...baseCondition });
        }

        // Fetch conversations where the user is either user1 or user2
        const conversations = await this.conversationRepository.find({
            where: whereConditions,
            relations: ['user1', 'user2', 'lastMessage'],
            order: { updatedAt: 'DESC' },
            take: limit,
        });

        if (conversations.length === 0) return [];

        // Group unread counts by peer to fetch them efficiently in one query
        const unreadQuery = this.directMessageRepository
            .createQueryBuilder('dm')
            .select('dm.fromUserId', 'peerId')
            .addSelect('COUNT(dm.id)', 'count')
            .where('dm.toUserId = :userId', { userId })
            .andWhere('dm.isRead = :isRead', { isRead: false })
            .andWhere('dm.deletedAt IS NULL');

        if (workspaceId) {
            unreadQuery
                .innerJoin('dm.conversation', 'conv')
                .andWhere('conv.workspaceId = :workspaceId', { workspaceId });
        }

        const unreadCountsRaw = await unreadQuery
            .groupBy('dm.fromUserId')
            .getRawMany();

        const unreadCountsMap = new Map<number, number>();
        unreadCountsRaw.forEach(r => unreadCountsMap.set(Number(r.peerId), Number(r.count)));

        // Assemble results
        return conversations.map(conv => {
            const otherUser = conv.user1Id === Number(userId) ? conv.user2 : conv.user1;
            return {
                id: conv.id,
                user: otherUser,
                last_message: conv.lastMessage,
                unread_count: unreadCountsMap.get(otherUser.id) || 0,
            };
        });
    }

    async getOrCreateConversation(
        userId: number,
        otherUserId: number,
        companyId: number,
        workspaceId: number,
    ): Promise<any> {
        if (!workspaceId) {
            throw new Error('Workspace ID is required for direct messages');
        }

        // Find or create conversation record
        const u1 = Math.min(userId, otherUserId);
        const u2 = Math.max(userId, otherUserId);

        let conversation = await this.conversationRepository.findOne({
            where: { workspaceId, user1Id: u1, user2Id: u2 },
            relations: ['user1', 'user2'],
        });

        if (!conversation) {
            conversation = this.conversationRepository.create({
                companyId,
                workspaceId,
                user1Id: u1,
                user2Id: u2,
            });
            conversation = await this.conversationRepository.save(conversation);

            // Load relations after save
            conversation = await this.conversationRepository.findOne({
                where: { id: conversation.id },
                relations: ['user1', 'user2'],
            }) as Conversation;
        }

        // Map to consistent format
        const otherUser = conversation.user1Id === Number(userId) ? conversation.user2 : conversation.user1;

        // Get unread count for this specific conversation
        const unreadCount = await this.directMessageRepository.count({
            where: {
                toUserId: userId,
                fromUserId: otherUser.id,
                isRead: false,
                conversationId: conversation.id
            }
        });

        return {
            ...conversation,
            user: otherUser,
            unread_count: unreadCount,
            is_direct_message: true,
        };
    }

    async debugConversation(conversationId: number, userId: number): Promise<any> {
        console.log('🔍 DEBUG: Fetching conversation', { conversationId, userId });

        // Get conversation without any filters
        const conversation = await this.conversationRepository.findOne({
            where: { id: conversationId },
            relations: ['user1', 'user2']
        });

        if (!conversation) {
            return {
                found: false,
                conversationId,
                message: 'Conversation not found in database'
            };
        }

        // Get all conversations for this user
        const userConversations = await this.conversationRepository.find({
            where: [
                { user1Id: userId },
                { user2Id: userId }
            ],
            relations: ['user1', 'user2']
        });

        return {
            found: true,
            conversation: {
                id: conversation.id,
                workspaceId: conversation.workspaceId,
                user1Id: conversation.user1Id,
                user1Name: conversation.user1?.name,
                user2Id: conversation.user2Id,
                user2Name: conversation.user2?.name,
            },
            currentUser: {
                id: userId,
                isUser1: conversation.user1Id === userId,
                isUser2: conversation.user2Id === userId,
                isPartOfConversation: conversation.user1Id === userId || conversation.user2Id === userId
            },
            userConversations: userConversations.map(c => ({
                id: c.id,
                workspaceId: c.workspaceId,
                user1Id: c.user1Id,
                user2Id: c.user2Id,
            }))
        };
    }
}
