import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  forwardRef,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from './entities/message.entity';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { MessageQueryDto } from './dto/message-query.dto';
import { ChannelsService } from '../channels/channels.service';
import { MessagesGateway } from './messages.gateway';
import { Poll } from './entities/poll.entity';
import { PollOption } from './entities/poll-option.entity';
import { PollVote } from './entities/poll-vote.entity';
import { Topic } from './entities/topic.entity';
import { Attachment } from './entities/attachment.entity';
import { NotificationsService } from '../notifications/notifications.service';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import axios from 'axios';

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
    @Inject(forwardRef(() => ChannelsService))
    private channelsService: ChannelsService,
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

  private transformMessage(message: Message) {
    const baseUrl = this.configService.get<string>('LARAVEL_APP_URL');

    // Add domain to attachmentUrl if it's relative
    let attachmentUrl = message.attachmentUrl;
    if (attachmentUrl && !attachmentUrl.startsWith('http')) {
      attachmentUrl = `${baseUrl}/${attachmentUrl.startsWith('/') ? attachmentUrl.slice(1) : attachmentUrl}`;
    }

    // Add domain to attachments array items
    const attachments = (message.attachments || []).map(att => ({
      ...att,
      url: att.url && !att.url.startsWith('http')
        ? `${baseUrl}/${att.url.startsWith('/') ? att.url.slice(1) : att.url}`
        : att.url
    }));

    return {
      ...message,
      attachmentUrl,
      attachments,
      is_urgent: !!message.isUrgent,
      replies_count:
        (message.replies?.length || 0) + (message.threadReplies?.length || 0),
      poll: this.transformPoll(message.poll),
    };
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

    return {
      data: data.map((msg) => this.transformMessage(msg)),
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

    return {
      data: data.map((message) => this.transformMessage(message)),
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
      ],
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.companyId !== companyId) {
      throw new ForbiddenException('Access denied to this message');
    }

    return this.transformMessage(message);
  }

  async create(
    createMessageDto: CreateMessageDto,
    userId: number,
    companyId: number,
    role?: string,
    files?: any[],
  ): Promise<any> {
    // Check channel access
    const channel = await this.channelsService.checkChannelAccess(
      createMessageDto.channelId,
      userId,
      companyId,
      role,
    );

    const { poll: pollData, ...messageData } = createMessageDto;

    // FINAL SOLUTION: QUAX CLEANING - Strip domain manually before entity creation
    if (messageData.attachmentUrl && messageData.attachmentUrl.includes('uploads/')) {
      const parts = messageData.attachmentUrl.split('uploads/');
      messageData.attachmentUrl = 'uploads/' + parts[parts.length - 1];
    }

    const newMessage = this.messageRepository.create({
      ...messageData,
      userId,
      companyId,
      channelId: createMessageDto.channelId,
      mentions: createMessageDto.mentionedUserIds || [],
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
      if (channel && channel.members) {
        // Filter out the sender
        const recipients = channel.members.filter(member => member.id !== userId);

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
      ],
    });

    if (!updatedMessage) {
      throw new NotFoundException('Message not found after update');
    }

    const transformedMessage = this.transformMessage(updatedMessage);

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

    const transformedMessage = this.transformMessage(updatedMessage);

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
    const message = await this.findOne(messageId, userId, companyId);

    if (!message.channelId) {
      throw new BadRequestException('Message does not belong to a channel');
    }

    // Use a direct find to ensure ALL types of replies and their relations are loaded
    const replies = await this.messageRepository.find({
      where: [{ replyToId: messageId }, { threadParentId: messageId }],
      relations: [
        'user',
        'channel',
        'poll',
        'poll.options',
        'poll.options.votes',
        'topic',
      ],
      order: { createdAt: 'ASC' },
    });

    console.log(`Found ${replies.length} replies for message ${messageId}`);

    const transformedReplies = replies.map((reply) =>
      this.transformMessage(reply),
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
      data: data.map((msg) => this.transformMessage(msg)),
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
      .orderBy('message.createdAt', 'DESC');

    const [data, total] = await queryBuilder
      .skip(skip)
      .take(perPage)
      .getManyAndCount();

    const totalPages = Math.ceil(total / perPage);

    return {
      data: data.map((msg) => this.transformMessage(msg)),
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
}
