import {
    BadRequestException,
    ForbiddenException,
    forwardRef,
    Inject,
    Injectable,
    NotFoundException,
    Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { In, Repository } from 'typeorm';
import { ActionItem } from '../action-items/entities/action-item.entity';
import { ChannelsService } from '../channels/channels.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Ticket } from '../tickets/entities/ticket.entity';
import { DirectMessagesService } from './direct-messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { MessageQueryDto } from './dto/message-query.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
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
import { MessagesGateway } from './messages.gateway';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    @InjectRepository(Poll)
    private pollRepository: Repository<Poll>,
    @InjectRepository(PollOption)
    private pollOptionRepository: Repository<PollOption>,
    @InjectRepository(PollVote)
    private pollVoteRepository: Repository<PollVote>,
    @InjectRepository(Attachment)
    private attachmentRepository: Repository<Attachment>,
    @InjectRepository(MessageReaction)
    private reactionRepository: Repository<MessageReaction>,
    @InjectRepository(MessageAction)
    private actionRepository: Repository<MessageAction>,
    @InjectRepository(MessageMention)
    private messageMentionRepository: Repository<MessageMention>,
    @InjectRepository(DirectMessage)
    private directMessageRepository: Repository<DirectMessage>,
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    @InjectRepository(Ticket)
    private ticketRepository: Repository<Ticket>,
    @InjectRepository(ActionItem)
    private actionItemRepository: Repository<ActionItem>,
    @Inject(forwardRef(() => ChannelsService))
    private channelsService: ChannelsService,
    @Inject(forwardRef(() => DirectMessagesService))
    private directMessagesService: DirectMessagesService,
    private notificationsService: NotificationsService,
    private configService: ConfigService,
    @Optional()
    @Inject(forwardRef(() => MessagesGateway))
    private messagesGateway?: MessagesGateway,
  ) { }

  private transformPoll(poll: Poll) {
    if (!poll) return null;

    const options = (poll.options || []).map((option) => {
      const voterIds = (option.votes || []).map((v) => Number(v.userId));
      return {
        ...option,
        voter_ids: voterIds,
        voterIds: voterIds,
        vote_count: voterIds.length,
        voteCount: voterIds.length,
      };
    });

    const totalVotes = options.reduce((acc, opt) => acc + opt.vote_count, 0);

    return {
      ...poll,
      options,
      total_votes: totalVotes,
      totalVotes: totalVotes,
    };
  }

  private transformMessage(message: Message, currentUserId?: number) {
    const baseUrl = this.configService.get<string>('LARAVEL_APP_URL') || process.env.LARAVEL_APP_URL || 'https://slack.gumra-ai.com';

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
        id: (message as any).id || 0,
        url: attachmentUrl,
        filename: message.attachmentName || 'attachment',
        originalName: message.attachmentName || 'attachment',
        mimeType: message.attachmentType || 'application/octet-stream',
        size: '0',
        companyId: message.companyId,
        messageId: (message as any).id,
        createdBy: (message as any).userId || (message as any).fromUserId,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
      } as any);
    }

    return {
      ...message,
      attachmentUrl,
      attachments,
      is_urgent: !!message.isUrgent,
      replies_count:
        (message.replies?.length || 0) + (message.threadReplies?.length || 0),
      poll: this.transformPoll(message.poll),
      reactions: this.transformReactions(message.reactions || []),
      is_pinned: (message.actions || []).some(a => a.actionType === 'pin' && a.isActive),
      is_starred: currentUserId
        ? (message.actions || []).some(a => a.userId === currentUserId && a.actionType === 'favorite' && a.isActive)
        : (message.actions || []).some(a => a.actionType === 'favorite' && a.isActive),
      tickets: (message as any).tickets || [],
      action_items: (message as any).actionItems || (message as any).action_items || [],
    };
  }

  private async enrichMessagesWithTickets(messages: any[]) {
    if (!messages || messages.length === 0) return messages;

    const messageIds = messages.map(m => m.id).filter(id => id !== undefined);
    if (messageIds.length === 0) return messages;

    const tickets = await this.ticketRepository.find({
      where: { messageId: In(messageIds) },
    });

    const actionItems = await this.actionItemRepository.find({
      where: { messageId: In(messageIds) },
    });

    messages.forEach(msg => {
      msg.tickets = tickets.filter(t => Number(t.messageId) === Number(msg.id));
      msg.action_items = actionItems.filter(ai => Number(ai.messageId) === Number(msg.id));
    });

    return messages;
  }

  private transformReactions(reactions: MessageReaction[]) {
    const grouped = new Map<string, number[]>();
    reactions.forEach(r => {
      if (!grouped.has(r.emoji)) {
        grouped.set(r.emoji, []);
      }
      grouped.get(r.emoji)!.push(Number(r.userId));
    });

    return Array.from(grouped.entries()).map(([emoji, users]) => ({
      emoji,
      users,
    }));
  }

  async findAll(
    userId: number,
    companyId: number,
    query: MessageQueryDto,
  ): Promise<{ data: any[]; meta: any; links: any }> {
    const page = query.page || 1;
    const perPage = query.perPage || 50;
    const skip = (page - 1) * perPage;

    const queryBuilder = this.messageRepository
      .createQueryBuilder('message')
      .where('message.replyToId IS NULL')
      .andWhere('message.threadParentId IS NULL')
      .andWhere('message.companyId = :companyId', { companyId })
      .leftJoinAndSelect('message.user', 'user')
      .leftJoinAndSelect('message.channel', 'channel')
      .leftJoinAndSelect('message.replies', 'replies')
      .leftJoinAndSelect('message.threadReplies', 'threadReplies')
      .leftJoinAndSelect('message.poll', 'poll')
      .leftJoinAndSelect('poll.options', 'options')
      .leftJoinAndSelect('options.votes', 'votes')
      .leftJoinAndSelect('message.topic', 'topic')
      .leftJoinAndSelect('message.attachments', 'attachments')
      .leftJoinAndSelect('message.reactions', 'reactions')
      .leftJoinAndSelect('message.actions', 'actions')
      .orderBy('message.createdAt', 'DESC');

    if (query.channelId) {
      queryBuilder.andWhere('message.channelId = :channelId', {
        channelId: query.channelId,
      });
    }

    const [data, total] = await queryBuilder
      .skip(skip)
      .take(perPage)
      .getManyAndCount();

    const totalPages = Math.ceil(total / perPage);

    const enrichedData = data.map((msg) => this.transformMessage(msg, userId));
    await this.enrichMessagesWithTickets(enrichedData);

    return {
      data: enrichedData,
      meta: {
        current_page: page,
        per_page: perPage,
        total,
        last_page: totalPages,
        from: skip + 1,
        to: Math.min(skip + perPage, total),
      },
      links: {
        first: page === 1 ? null : `?page=1&per_page=${perPage}`,
        last: page === totalPages ? null : `?page=${totalPages}&per_page=${perPage}`,
        prev: page > 1 ? `?page=${page - 1}&per_page=${perPage}` : null,
        next: page < totalPages ? `?page=${page + 1}&per_page=${perPage}` : null,
      },
    };
  }

  async findByChannel(
    channelId: number,
    userId: number,
    companyId: number,
    query: MessageQueryDto,
    role?: string,
  ): Promise<{ data: any[]; meta: any; links: any }> {
    // Check channel access
    await this.channelsService.checkChannelAccess(channelId, userId, companyId, role);

    // Mark notifications as read for this channel
    try {
      await this.notificationsService.markChannelNotificationsAsRead(userId, channelId);
    } catch (e) {
      console.error('Error marking channel notifications as read:', e);
    }

    const page = query.page || 1;
    const perPage = query.perPage || 50;
    const skip = (page - 1) * perPage;

    const queryBuilder = this.messageRepository
      .createQueryBuilder('message')
      .where('message.channelId = :channelId', { channelId })
      .andWhere('message.companyId = :companyId', { companyId })
      .andWhere('message.threadParentId IS NULL')
      .leftJoinAndSelect('message.user', 'user')
      .leftJoinAndSelect('message.channel', 'channel')
      .leftJoinAndSelect('message.replies', 'replies')
      .leftJoinAndSelect('message.threadReplies', 'threadReplies')
      .leftJoinAndSelect('message.poll', 'poll')
      .leftJoinAndSelect('poll.options', 'options')
      .leftJoinAndSelect('options.votes', 'votes')
      .leftJoinAndSelect('message.topic', 'topic')
      .leftJoinAndSelect('message.attachments', 'attachments')
      .leftJoinAndSelect('message.reactions', 'reactions')
      .leftJoinAndSelect('message.actions', 'actions')
      .orderBy('message.createdAt', 'DESC');

    if (query.topicId !== undefined) {
      if (query.topicId > 0) {
        queryBuilder.andWhere('message.topicId = :topicId', {
          topicId: query.topicId,
        });
      } else {
        queryBuilder.andWhere('message.topicId IS NULL');
      }
    }

    const [data, total] = await queryBuilder
      .skip(skip)
      .take(perPage)
      .getManyAndCount();

    const totalPages = Math.ceil(total / perPage);

    const enrichedData = data.map((message) => this.transformMessage(message, userId));
    await this.enrichMessagesWithTickets(enrichedData);

    return {
      data: enrichedData,
      meta: {
        current_page: page,
        per_page: perPage,
        total,
        last_page: totalPages,
        from: skip + 1,
        to: Math.min(skip + perPage, total),
      },
      links: {
        first: page === 1 ? null : `?page=1&per_page=${perPage}`,
        last: page === totalPages ? null : `?page=${totalPages}&per_page=${perPage}`,
        prev: page > 1 ? `?page=${page - 1}&per_page=${perPage}` : null,
        next: page < totalPages ? `?page=${page + 1}&per_page=${perPage}` : null,
      },
    };
  }

  async findOne(id: number, userId: number, companyId: number): Promise<any> {
    console.log(`[findOne] Looking for message id=${id}, userId=${userId}, companyId=${companyId}`);
    const message = await this.messageRepository.findOne({
      where: { id },
      relations: [
        'user',
        'channel',
        'replies',
        'threadReplies',
        'poll',
        'poll.options',
        'poll.options.votes',
        'topic',
        'attachments',
        'reactions',
        'actions',
      ],
    });

    if (!message) {
      console.log(`[findOne] Message not found: id=${id}`);
      throw new NotFoundException('Message not found');
    }

    console.log(`[findOne] Found message: id=${message.id}, companyId=${message.companyId}`);
    if (message.companyId !== companyId) {
      console.log(`[findOne] Company mismatch: message.companyId=${message.companyId}, requested companyId=${companyId}`);
      throw new ForbiddenException('Access denied to this message');
    }

    const transformed = this.transformMessage(message, userId);
    await this.enrichMessagesWithTickets([transformed]);
    return transformed;
  }

  async create(
    createMessageDto: CreateMessageDto,
    userId: number,
    companyId: number,
    role?: string,
    files?: any[],
  ): Promise<any> {
    // ✅ IDEMPOTENCY CHECK: If localId is provided, check for existing message
    if (createMessageDto.localId) {
      const existingMessage = await this.messageRepository.findOne({
        where: {
          localId: createMessageDto.localId,
          userId: userId,
        },
        relations: ['user', 'channel', 'replyTo', 'topic', 'attachments', 'poll'],
      });

      if (existingMessage) {
        console.log(`🔄 [MessagesService] Idempotent request detected: localId=${createMessageDto.localId}, returning existing message id=${existingMessage.id}`);
        return existingMessage;
      }
    }

    // Check channel access
    const channel = await this.channelsService.checkChannelAccess(
      createMessageDto.channelId,
      userId,
      companyId,
      role,
    );

    // 🔍 DEBUG: Log incoming data for multipart handling
    console.log('📦 [MessagesService] create:', {
      channelId: createMessageDto.channelId,
      threadParentId: createMessageDto.threadParentId,
      thread_parent_id: (createMessageDto as any).thread_parent_id,
      content: createMessageDto.content,
      filesCount: files?.length || 0
    });

    const { poll: pollData, ...messageData } = createMessageDto;

    // Support both camelCase and snake_case from multipart/form-data
    const threadParentId = createMessageDto.threadParentId || (createMessageDto as any).thread_parent_id;
    const replyToId = createMessageDto.replyToId || (createMessageDto as any).reply_to_id;
    const localId = createMessageDto.localId || (createMessageDto as any).local_id;
    const attachmentUrl = createMessageDto.attachmentUrl || (createMessageDto as any).attachment_url;
    const attachmentType = createMessageDto.attachmentType || (createMessageDto as any).attachment_type;
    const attachmentName = createMessageDto.attachmentName || (createMessageDto as any).attachment_name;
    const isUrgent = createMessageDto.isUrgent || (createMessageDto as any).is_urgent || false;
    const mentionedUserIds = createMessageDto.mentionedUserIds || (createMessageDto as any)['mentioned_user_ids[]'] || (createMessageDto as any).mentioned_user_ids || [];

    // FINAL SOLUTION: QUAX CLEANING - Strip domain manually before entity creation
    let cleanedAttachmentUrl = attachmentUrl;
    if (cleanedAttachmentUrl && cleanedAttachmentUrl.includes('uploads/')) {
      const parts = cleanedAttachmentUrl.split('uploads/');
      cleanedAttachmentUrl = 'uploads/' + parts[parts.length - 1];
    }

    const newMessage = this.messageRepository.create({
      ...messageData,
      content: createMessageDto.content,
      userId,
      companyId,
      channelId: createMessageDto.channelId,
      threadParentId: threadParentId ? Number(threadParentId) : null,
      replyToId: replyToId ? Number(replyToId) : null,
      localId,
      attachmentUrl: cleanedAttachmentUrl,
      attachmentType,
      attachmentName,
      isUrgent: !!isUrgent,
      mentions: Array.isArray(mentionedUserIds) ? mentionedUserIds.map(id => Number(id)) : [],
      topic: createMessageDto.topicId
        ? ({ id: createMessageDto.topicId } as Topic)
        : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const savedMessage = (await this.messageRepository.save(
      newMessage,
    )) as Message;

    // Handle File Uploads via internal API
    if (files && files.length > 0) {
      console.log(`📂 [MessagesService] Forwarding ${files.length} files to Laravel...`);

      const baseUrl = this.configService.get<string>('LARAVEL_APP_URL');
      const internalToken = this.configService.get<string>('INTERNAL_API_TOKEN', 'temp_internal_token_123');
      const uploadUrl = `${baseUrl}/api/internal/upload`;

      for (const file of files) {
        try {
          const formData = new (require('form-data'))();
          formData.append('file', file.buffer, {
            filename: file.originalname,
            contentType: file.mimetype,
          });
          formData.append('directory', 'attachments');

          console.log(`🚀 [MessagesService] Uploading file to Laravel: ${file.originalname}`);

          const response = await axios.post(uploadUrl, formData, {
            headers: {
              ...formData.getHeaders(),
              'X-Internal-Token': internalToken,
            },
          });

          if (response.data && response.data.success) {
            const filename = response.data.filename;
            const relativeUrl = `uploads/attachments/${filename}`;
            console.log(`✅ [MessagesService] File uploaded successfully: ${relativeUrl}`);

            // Create Attachment Entity
            const attachment = this.attachmentRepository.create({
              companyId,
              messageId: savedMessage.id,
              filename: filename,
              originalName: file.originalname,
              mimeType: file.mimetype,
              size: String(file.size),
              url: relativeUrl,
              createdBy: userId,
            });

            await this.attachmentRepository.save(attachment);

            // For backward compatibility / single attachment support
            if (!savedMessage.attachmentUrl) {
              savedMessage.attachmentUrl = relativeUrl;
              savedMessage.attachmentType = file.mimetype;
              savedMessage.attachmentName = file.originalname;
              await this.messageRepository.save(savedMessage);
            }
          } else {
            console.error('❌ [MessagesService] Laravel upload failed:', response.data);
          }
        } catch (error) {
          console.error('❌ [MessagesService] Error uploading file to Laravel:', error.message);
          if (error.response) {
            console.error('Response data:', error.response.data);
          }
        }
      }
    }

    // Handle Poll creation if provided
    if (pollData) {
      const poll = this.pollRepository.create({
        question: pollData.question,
        allowMultipleSelection: pollData.allowMultipleSelection ?? false,
        isAnonymous: pollData.isAnonymous ?? false,
        companyId,
        createdBy: userId,
        messageId: savedMessage.id,
      });

      const savedPoll = await this.pollRepository.save(poll);

      // Create poll options with support for both string and object formats from client
      const options = pollData.options.map((opt) => {
        const textValue = typeof opt === 'string' ? opt : opt.text || '';
        return this.pollOptionRepository.create({
          text: textValue,
          pollId: savedPoll.id,
        });
      });
      await this.pollOptionRepository.save(options);
    }

    // Save Mentions to relational table
    if (mentionedUserIds.length > 0) {
      const mentionsToSave = mentionedUserIds.map((uid) => {
        return this.messageMentionRepository.create({
          messageId: savedMessage.id,
          userId: Number(uid),
          companyId: companyId,
        });
      });
      await this.messageMentionRepository.save(mentionsToSave);
    }

    // Load relations
    const loadedMessage = await this.messageRepository.findOne({
      where: { id: savedMessage.id },
      relations: [
        'user',
        'channel',
        'replies',
        'threadReplies',
        'poll',
        'poll.options',
        'poll.options.votes',
        'topic',
        'attachments',
        'reactions',
        'actions',
      ],
    });

    if (!loadedMessage) {
      throw new NotFoundException('Message not found after creation');
    }

    const transformedMessage = this.transformMessage(loadedMessage);

    // Broadcast message sent event
    try {
      if (this.messagesGateway) {
        this.messagesGateway.broadcastMessageSent(transformedMessage);
      }
    } catch (error) {
      // Gateway error
    }

    // Send Push Notifications
    try {
      if (channel) {
        // Fetch members explicitly if not already loaded (performance optimization)
        const members = await this.channelsService.getMembers(channel.id);

        // Filter out the sender
        const recipients = members.filter(member => member.id !== userId);

        for (const recipient of recipients) {
          // 1. Send Push Notification
          await this.notificationsService.sendNotificationToUser(
            recipient.id,
            channel.name, // Title: Channel Name
            `${loadedMessage.user.name}: ${loadedMessage.content}`, // Body: User: Message
            {
              type: 'channel_message',
              channel_id: String(channel.id),
              channel_name: channel.name,
              message_id: String(loadedMessage.id),
              user_name: loadedMessage.user.name,
              content: loadedMessage.content,
              notification_tag: `channel_${channel.id}`,
              is_urgent: loadedMessage.isUrgent ? 'true' : 'false',
            }
          );

          // 2. Record in Database
          await this.notificationsService.recordDatabaseNotification(
            recipient.id,
            {
              message_id: loadedMessage.id,
              channel_id: channel.id,
              channel_name: channel.name,
              sender_id: userId,
              sender_name: loadedMessage.user.name,
              sender_avatar: loadedMessage.user.profileImageUrl,
              content: loadedMessage.content,
              channel_type: 'channel'
            }
          );
        }
      }
    } catch (error) {
      console.error('Error sending push notifications:', error);
    }

    return transformedMessage;
  }

  async update(
    id: number,
    updateMessageDto: UpdateMessageDto,
    userId: number,
    companyId: number,
  ): Promise<any> {
    const message = await this.messageRepository.findOne({
      where: { id, companyId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Check if user owns the message
    if (message.userId !== userId) {
      throw new ForbiddenException('You can only update your own messages');
    }

    if (updateMessageDto.content !== undefined) {
      message.content = updateMessageDto.content;
      message.editedAt = new Date();
    }

    if (updateMessageDto.mentionedUserIds !== undefined) {
      message.mentions = updateMessageDto.mentionedUserIds;
    }

    if (updateMessageDto.isUrgent !== undefined) {
      message.isUrgent = updateMessageDto.isUrgent;
    }

    await this.messageRepository.save(message);

    // Load relations
    const updatedMessage = await this.messageRepository.findOne({
      where: { id: message.id },
      relations: [
        'user',
        'channel',
        'replies',
        'threadReplies',
        'poll',
        'poll.options',
        'poll.options.votes',
        'topic',
        'attachments',
        'reactions',
        'actions',
      ],
    });

    if (!updatedMessage) {
      throw new NotFoundException('Message not found after update');
    }

    const transformedMessage = this.transformMessage(updatedMessage, userId);

    // Broadcast message updated event
    try {
      if (this.messagesGateway) {
        this.messagesGateway.broadcastMessageUpdated(transformedMessage);
      }
    } catch (error) {
      // Gateway error
    }

    return transformedMessage;
  }

  async updateTopic(
    id: number,
    topicId: number | null,
    userId: number,
    companyId: number,
    role?: string,
  ): Promise<any> {
    const message = await this.messageRepository.findOne({
      where: { id, companyId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Check channel access for the user
    if (message.channelId) {
      await this.channelsService.checkChannelAccess(
        message.channelId,
        userId,
        companyId,
        role,
      );
    }

    // Allow updating topicId regardless of ownership
    message.topicId = topicId;
    message.editedAt = new Date(); // Optional: mark as edited? Maybe not for structural changes.
    // Let's decide NOT to update editedAt for topic moves, as it's meta-organization, not content change.
    // Actually, keeping editedAt update might be confusing if content hasn't changed.
    // Commenting it out for now.
    // message.editedAt = new Date();

    await this.messageRepository.save(message);

    // Load relations
    const updatedMessage = await this.messageRepository.findOne({
      where: { id: message.id },
      relations: [
        'user',
        'channel',
        'replies',
        'threadReplies',
        'poll',
        'poll.options',
        'poll.options.votes',
        'topic',
        'attachments',
      ],
    });

    if (!updatedMessage) {
      throw new NotFoundException('Message not found after update');
    }

    const transformedMessage = this.transformMessage(updatedMessage, userId);

    // Broadcast message updated event
    try {
      if (this.messagesGateway) {
        this.messagesGateway.broadcastMessageUpdated(transformedMessage);
      }
    } catch (error) {
      // Gateway error
    }

    return transformedMessage;
  }

  async remove(id: number, userId: number, companyId: number): Promise<void> {
    const message = await this.messageRepository.findOne({
      where: { id, companyId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Check if user owns the message
    if (message.userId !== userId) {
      throw new ForbiddenException('You can only delete your own messages');
    }

    const channelId = message.channelId;
    await this.messageRepository.remove(message);

    // Broadcast message deleted event
    try {
      if (this.messagesGateway && channelId) {
        this.messagesGateway.broadcastMessageDeleted(id, channelId);
      }
    } catch (error) {
      // Gateway error
    }
  }

  async getReplies(
    messageId: number,
    userId: number,
    companyId: number,
  ): Promise<{ message: any; replies: any[]; replies_count: number }> {
    console.log(`Getting replies for message ${messageId}`);

    let message: any;
    let replies: any[] = [];
    let isDirectMessage = false;

    try {
      // Try to find it as a channel message first
      message = await this.findOne(messageId, userId, companyId);
    } catch (error) {
      // Only proceed to check DM if it's a NotFoundException or ForbiddenException (meaning not a channel msg)
      // If it's a database connection error, we should probably fail fast
      if (
        !(error instanceof NotFoundException) &&
        !(error instanceof ForbiddenException)
      ) {
        console.error(
          `❌ [getReplies] Database or other error while fetching channel message ${messageId}:`,
          error,
        );
        throw error; // Re-throw critical errors
      }

      console.log(
        `Message ${messageId} not found in channels, trying DirectMessages...`,
      );

      try {
        const directMessage = await this.directMessageRepository.findOne({
          where: { id: messageId },
          relations: [
            'fromUser',
            'toUser',
            'reactions',
            'actions',
            'attachments',
            'conversation',
          ],
        });

        if (!directMessage) {
          console.log(`❌ Message ${messageId} not found in DirectMessages either`);
          throw new NotFoundException('Message not found');
        }

        // Verify access - check if user is part of the conversation or sender/receiver
        if (
          directMessage.fromUserId !== userId &&
          directMessage.toUserId !== userId
        ) {
          // Double check conversation participants just in case
          if (!directMessage.conversationId) {
            console.log(`❌ DM ${messageId} has no conversationId and user is not sender/receiver`);
            throw new ForbiddenException('Access denied to this message');
          }

          const conversation = await this.conversationRepository.findOne({
            where: { id: directMessage.conversationId },
          });

          if (
            !conversation ||
            (conversation.user1Id !== userId && conversation.user2Id !== userId)
          ) {
            console.log(
              `❌ User ${userId} does not have access to DM ${messageId}`,
            );
            throw new ForbiddenException('Access denied to this message');
          }
        }

        isDirectMessage = true;
        message = this.directMessagesService.transformDirectMessage(
          directMessage,
          userId,
        );

        const directReplies = await this.directMessageRepository.find({
          where: { replyToId: messageId },
          relations: [
            'fromUser',
            'toUser',
            'reactions',
            'actions',
            'attachments',
          ],
          order: { createdAt: 'ASC' },
        });

        replies = directReplies.map((reply) =>
          this.directMessagesService.transformDirectMessage(reply, userId),
        );

        console.log(
          `Found ${replies.length} direct message replies for message ${messageId}`,
        );

        return {
          message,
          replies,
          replies_count: replies.length,
        };
      } catch (dmError) {
        console.error(
          `❌ [getReplies] Error fetching DM ${messageId}:`,
          dmError,
        );
        throw dmError;
      }
    }

    if (!message.channelId) {
      throw new BadRequestException('Message does not belong to a channel');
    }

    replies = await this.messageRepository.find({
      where: [{ replyToId: messageId }, { threadParentId: messageId }],
      relations: [
        'user',
        'channel',
        'poll',
        'poll.options',
        'poll.options.votes',
        'topic',
        'attachments',
        'reactions',
        'actions',
      ],
      order: { createdAt: 'ASC' },
    });

    console.log(`Found ${replies.length} replies for message ${messageId}`);

    const transformedReplies = replies.map((reply) =>
      this.transformMessage(reply, userId),
    );

    return {
      message,
      replies: transformedReplies,
      replies_count: replies.length,
    };
  }

  async getThreads(
    userId: number,
    companyId: number,
    query: MessageQueryDto,
  ): Promise<{ data: any[]; meta: any; links: any }> {
    const page = query.page || 1;
    const perPage = query.perPage || 20;
    const skip = (page - 1) * perPage;

    const queryBuilder = this.messageRepository
      .createQueryBuilder('message')
      .where('message.companyId = :companyId', { companyId })
      .andWhere('message.replyToId IS NULL')
      .andWhere('message.threadParentId IS NULL')
      .leftJoinAndSelect('message.user', 'user')
      .leftJoinAndSelect('message.channel', 'channel')
      .leftJoinAndSelect('message.replies', 'replies')
      .leftJoinAndSelect('message.threadReplies', 'threadReplies')
      .leftJoinAndSelect('message.poll', 'poll')
      .leftJoinAndSelect('poll.options', 'options')
      .leftJoinAndSelect('options.votes', 'votes')
      .leftJoinAndSelect('message.topic', 'topic')
      .leftJoinAndSelect('message.attachments', 'attachments')
      .leftJoinAndSelect('message.reactions', 'reactions')
      .leftJoinAndSelect('message.actions', 'actions')
      .andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('1')
          .from('messages', 'r')
          .where('r.reply_to_id = message.id OR r.thread_parent_id = message.id')
          .limit(1)
          .getQuery();
        return 'EXISTS (' + subQuery + ')';
      })
      .orderBy('message.createdAt', 'DESC');

    const [data, total] = await queryBuilder
      .skip(skip)
      .take(perPage)
      .getManyAndCount();

    const totalPages = Math.ceil(total / perPage);

    return {
      data: data.map((msg) => this.transformMessage(msg, userId)),
      meta: {
        current_page: page,
        per_page: perPage,
        total,
        last_page: totalPages,
        from: skip + 1,
        to: Math.min(skip + perPage, total),
      },
      links: {
        first: page === 1 ? null : `?page=1&per_page=${perPage}`,
        last:
          page === totalPages ? null : `?page=${totalPages}&per_page=${perPage}`,
        prev: page > 1 ? `?page=${page - 1}&per_page=${perPage}` : null,
        next: page < totalPages ? `?page=${page + 1}&per_page=${perPage}` : null,
      },
    };
  }

  async search(
    channelId: number,
    searchQuery: string,
    userId: number,
    companyId: number,
    query: MessageQueryDto,
    role?: string,
  ): Promise<{ data: any[]; meta: any; links: any }> {
    if (!searchQuery || searchQuery.trim().length === 0) {
      throw new BadRequestException('Query parameter is required');
    }

    // Check channel access
    await this.channelsService.checkChannelAccess(channelId, userId, companyId, role);

    const page = query.page || 1;
    const perPage = query.perPage || 50;
    const skip = (page - 1) * perPage;

    const queryBuilder = this.messageRepository
      .createQueryBuilder('message')
      .where('message.channelId = :channelId', { channelId })
      .andWhere('message.content LIKE :searchQuery', {
        searchQuery: `%${searchQuery}%`,
      })
      .leftJoinAndSelect('message.user', 'user')
      .leftJoinAndSelect('message.channel', 'channel')
      .leftJoinAndSelect('message.replies', 'replies')
      .leftJoinAndSelect('message.threadReplies', 'threadReplies')
      .leftJoinAndSelect('message.poll', 'poll')
      .leftJoinAndSelect('poll.options', 'options')
      .leftJoinAndSelect('options.votes', 'votes')
      .leftJoinAndSelect('message.topic', 'topic')
      .leftJoinAndSelect('message.attachments', 'attachments')
      .leftJoinAndSelect('message.reactions', 'reactions')
      .leftJoinAndSelect('message.actions', 'actions')
      .orderBy('message.createdAt', 'DESC');

    const [data, total] = await queryBuilder
      .skip(skip)
      .take(perPage)
      .getManyAndCount();

    const totalPages = Math.ceil(total / perPage);

    return {
      data: data.map((msg) => this.transformMessage(msg, userId)),
      meta: {
        current_page: page,
        per_page: perPage,
        total,
        last_page: totalPages,
        from: skip + 1,
        to: Math.min(skip + perPage, total),
      },
      links: {
        first: page === 1 ? null : `?page=1&per_page=${perPage}`,
        last: page === totalPages ? null : `?page=${totalPages}&per_page=${perPage}`,
        prev: page > 1 ? `?page=${page - 1}&per_page=${perPage}` : null,
        next: page < totalPages ? `?page=${page + 1}&per_page=${perPage}` : null,
      },
    };
  }

  async votePoll(pollId: number, optionId: number, userId: number): Promise<any> {
    const poll = await this.pollRepository.findOne({
      where: { id: pollId },
      relations: ['options'],
    });
    if (!poll) throw new NotFoundException('Poll not found');
    if (poll.isClosed) throw new BadRequestException('Poll is closed');

    const existingVotes = await this.pollVoteRepository.find({
      where: { userId, pollId },
    });
    const targetVote = existingVotes.find(
      (v) => Number(v.pollOptionId) === optionId,
    );

    if (targetVote) {
      // Toggle off: if already voted for this option, remove it
      await this.pollVoteRepository.remove(targetVote);
    } else {
      // Toggle on: if voting for a new option
      if (!poll.allowMultipleSelection && existingVotes.length > 0) {
        // If single selection poll, remove all other existing votes first
        await this.pollVoteRepository.remove(existingVotes);
      }

      const vote = this.pollVoteRepository.create({
        pollId,
        pollOptionId: optionId,
        userId,
      });
      await this.pollVoteRepository.save(vote);
    }

    const updatedPoll = await this.getPollWithVotes(pollId);

    // Broadcast poll update
    try {
      if (this.messagesGateway && poll.messageId) {
        this.messagesGateway.broadcastPollUpdated(updatedPoll, poll.messageId);
      }
    } catch (e) { }

    return updatedPoll;
  }

  async getPollWithVotes(pollId: number): Promise<any> {
    const poll = await this.pollRepository.findOne({
      where: { id: pollId },
      relations: ['options', 'options.votes'],
    });
    if (!poll) throw new NotFoundException('Poll not found');

    return this.transformPoll(poll);
  }

  async closePoll(pollId: number, userId: number): Promise<any> {
    const poll = await this.pollRepository.findOne({ where: { id: pollId } });
    if (!poll) throw new NotFoundException('Poll not found');
    if (Number(poll.createdBy) !== userId)
      throw new ForbiddenException('Only creator can close the poll');

    poll.isClosed = true;
    await this.pollRepository.save(poll);

    const updatedPoll = await this.getPollWithVotes(pollId);
    // Broadcast
    try {
      if (this.messagesGateway && poll.messageId) {
        this.messagesGateway.broadcastPollUpdated(updatedPoll, poll.messageId);
      }
    } catch (e) { }

    return updatedPoll;
  }

  async markChannelAsRead(channelId: number, userId: number, companyId: number, role?: string): Promise<void> {
    // Check channel access
    await this.channelsService.checkChannelAccess(channelId, userId, companyId, role);

    // Mark notifications as read for this channel
    try {
      await this.notificationsService.markChannelNotificationsAsRead(userId, channelId);
    } catch (e) {
      console.error('Error marking channel notifications as read:', e);
    }
  }

  async toggleReaction(messageId: number, emoji: string, userId: number, companyId: number): Promise<any> {
    const existing = await this.reactionRepository.findOne({
      where: { messageId, userId, emoji },
    });

    if (existing) {
      await this.reactionRepository.remove(existing);
    } else {
      const reaction = this.reactionRepository.create({
        messageId,
        userId,
        companyId,
        emoji,
      });
      await this.reactionRepository.save(reaction);
    }

    const updatedMessage = await this.findOne(messageId, userId, companyId);

    // Broadcast
    if (this.messagesGateway) {
      this.messagesGateway.broadcastMessageUpdated(updatedMessage);
    }

    return updatedMessage;
  }

  async togglePin(messageId: number, userId: number, companyId: number): Promise<any> {
    const existing = await this.actionRepository.findOne({
      where: { messageId, actionType: 'pin' },
    });

    if (existing) {
      existing.isActive = !existing.isActive;
      await this.actionRepository.save(existing);
    } else {
      const action = this.actionRepository.create({
        messageId,
        userId,
        actionType: 'pin',
        isActive: true,
      });
      await this.actionRepository.save(action);
    }

    const updatedMessage = await this.findOne(messageId, userId, companyId);

    // Broadcast
    if (this.messagesGateway) {
      this.messagesGateway.broadcastMessageUpdated(updatedMessage);
    }

    return updatedMessage;
  }

  async toggleFavorite(messageId: number, userId: number, companyId: number): Promise<any> {
    const existing = await this.actionRepository.findOne({
      where: { messageId, userId, actionType: 'favorite' },
    });

    if (existing) {
      existing.isActive = !existing.isActive;
      await this.actionRepository.save(existing);
    } else {
      const action = this.actionRepository.create({
        messageId,
        userId,
        actionType: 'favorite',
        isActive: true,
      });
      await this.actionRepository.save(action);
    }

    const updatedMessage = await this.findOne(messageId, userId, companyId);

    // Broadcast to user's other devices
    if (this.messagesGateway) {
      this.messagesGateway.server.to(`private-user-${userId}`).emit('message.updated', {
        message: updatedMessage,
      });
    }

    return updatedMessage;
  }

  async forwardMessage(
    messageId: number,
    targetId: number,
    userId: number,
    companyId: number,
    role?: string,
    isSourceDm: boolean = false,
  ): Promise<any> {
    try {
      let sourceMessage: any;

      if (isSourceDm) {
        sourceMessage = await this.directMessageRepository.findOne({
          where: { id: messageId },
          relations: ['reactions', 'actions'],
        });
        if (!sourceMessage) throw new NotFoundException('Source direct message not found');
      } else {
        sourceMessage = await this.findOne(messageId, userId, companyId);
      }

      // Check if target is a Channel
      let channel: any = null;
      try {
        channel = await this.channelsService.findOne(targetId);
      } catch (err) {
        // Not a channel or not found, will try as DM
      }

      if (channel) {
        // Forward to Channel
        await this.channelsService.checkChannelAccess(targetId, userId, companyId, role);

        const createDto: CreateMessageDto = {
          channelId: targetId,
          content: sourceMessage.content,
          attachmentUrl: sourceMessage.attachmentUrl,
          attachmentType: sourceMessage.attachmentType,
          attachmentName: sourceMessage.attachmentName,
        };

        const newMessage = await this.create(createDto, userId, companyId, role);

        // Copy attachments if any
        if (sourceMessage.attachments && sourceMessage.attachments.length > 0) {
          for (const att of sourceMessage.attachments) {
            const newAttachment = this.attachmentRepository.create({
              companyId,
              messageId: newMessage.id,
              filename: att.filename,
              originalName: att.originalName,
              mimeType: att.mimeType,
              size: att.size,
              url: att.url,
              createdBy: userId,
            });
            await this.attachmentRepository.save(newAttachment);
          }
        }

        // Copy poll if any
        if (sourceMessage.poll) {
          const newPoll = this.pollRepository.create({
            question: sourceMessage.poll.question,
            allowMultipleSelection: sourceMessage.poll.allowMultipleSelection,
            isAnonymous: sourceMessage.poll.isAnonymous,
            companyId,
            createdBy: userId,
            messageId: newMessage.id,
          });
          const savedPoll = await this.pollRepository.save(newPoll);

          if (sourceMessage.poll.options) {
            const newOptions = sourceMessage.poll.options.map(opt => this.pollOptionRepository.create({
              text: opt.text,
              pollId: savedPoll.id,
            }));
            await this.pollOptionRepository.save(newOptions);
          }
        }

        return await this.findOne(newMessage.id, userId, companyId);
      } else {
        // Try forwarding as DM (targetId is conversationId)
        console.log(`[Forward] Looking for conversation with id=${targetId}`);
        const conversation = await this.conversationRepository.findOne({
          where: { id: targetId }
        });
        console.log(`[Forward] Conversation found:`, conversation);

        if (!conversation) {
          throw new NotFoundException('Target channel or conversation not found');
        }

        // Verify user is part of conversation
        if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
          throw new ForbiddenException('You are not part of this conversation');
        }

        const toUserId = conversation.user1Id === userId ? conversation.user2Id : conversation.user1Id;

        console.log(`[Forward] Creating DM with workspaceId=${conversation.workspaceId}`);
        const newDm = this.directMessageRepository.create({
          content: sourceMessage.content,
          fromUserId: userId,
          toUserId: toUserId,
          companyId,
          conversationId: conversation.id,
          attachmentUrl: sourceMessage.attachmentUrl,
          attachmentType: sourceMessage.attachmentType,
          attachmentName: sourceMessage.attachmentName,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        let savedDm;
        try {
          savedDm = await this.directMessageRepository.save(newDm);
          console.log(`[Forward] DM saved successfully with id=${savedDm.id}`);
        } catch (saveError) {
          console.error(`[Forward] Error saving DM:`, saveError);
          throw new BadRequestException(`Failed to save DM: ${saveError.message}`);
        }

        // Update conversation last message
        await this.conversationRepository.update(conversation.id, {
          lastMessageId: savedDm.id,
          lastMessageText: savedDm.content,
          lastMessageAt: savedDm.createdAt,
          updatedAt: new Date(),
        });

        const loadedDm = await this.directMessageRepository.findOne({
          where: { id: savedDm.id },
          relations: ['fromUser', 'toUser', 'replyTo', 'reactions', 'actions'],
        });

        if (!loadedDm) {
          throw new BadRequestException('Failed to load saved direct message');
        }

        if (this.messagesGateway) {
          this.messagesGateway.broadcastDirectMessageSent(loadedDm);
        }

        // Return formatted for Flutter - wrap in standard response format
        const transformedMessage = {
          ...loadedDm,
          user: loadedDm.fromUser,
          is_dm: true,
          conversation_id: loadedDm.conversationId,
        };

        return {
          status: true,
          code: 201,
          message: 'Message forwarded successfully',
          payload: transformedMessage,
        };
      }
    } catch (error) {
      console.error('Forward Message Error:', error);
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException(`Failed to forward: ${error.message}`);
    }
  }

  async getStarredMessages(userId: number, companyId: number, query: MessageQueryDto): Promise<any> {
    const page = query.page || 1;
    const perPage = query.perPage || 20;
    const skip = (page - 1) * perPage;

    const [actions, total] = await this.actionRepository.findAndCount({
      where: {
        userId,
        actionType: 'favorite',
        isActive: true,
      },
      relations: ['message', 'message.user', 'message.channel', 'message.attachments', 'message.reactions', 'message.poll'],
      skip,
      take: perPage,
      order: { createdAt: 'DESC' },
    });

    const messages = actions
      .filter((action): action is any => !!action.message)
      .map(action => this.transformMessage(action.message, userId));
    const lastPage = Math.ceil(total / perPage);

    return {
      data: messages,
      meta: {
        current_page: page,
        per_page: perPage,
        total,
        last_page: lastPage,
        from: skip + 1,
        to: skip + messages.length,
      },
    };
  }

  async getStarredCount(userId: number): Promise<number> {
    return await this.actionRepository.count({
      where: {
        userId,
        actionType: 'favorite',
        isActive: true,
      },
    });
  }
}
