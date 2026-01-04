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
    @Inject(forwardRef(() => ChannelsService))
    private channelsService: ChannelsService,
    @Optional()
    @Inject(forwardRef(() => MessagesGateway))
    private messagesGateway?: MessagesGateway,
  ) { }

  async findAll(
    userId: number,
    companyId: number,
    query: MessageQueryDto,
  ): Promise<{ data: Message[]; meta: any; links: any }> {
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
      data,
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
  ): Promise<{ data: Message[]; meta: any; links: any }> {
    // Check channel access
    await this.channelsService.checkChannelAccess(channelId, userId, companyId);

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
      data,
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

  async findOne(id: number, userId: number, companyId: number): Promise<Message> {
    const message = await this.messageRepository.findOne({
      where: { id },
      relations: ['user', 'channel', 'replies', 'threadReplies', 'poll', 'poll.options', 'poll.options.votes'],
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.companyId !== companyId) {
      throw new ForbiddenException('Access denied to this message');
    }

    return message;
  }

  async create(
    createMessageDto: CreateMessageDto,
    userId: number,
    companyId: number,
  ): Promise<Message> {
    // Check channel access
    await this.channelsService.checkChannelAccess(
      createMessageDto.channelId,
      userId,
      companyId,
    );

    const { poll: pollData, ...messageData } = createMessageDto;

    const newMessage = this.messageRepository.create({
      ...messageData,
      userId,
      companyId,
      channelId: createMessageDto.channelId,
      mentions: createMessageDto.mentionedUserIds || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const savedMessage = (await this.messageRepository.save(newMessage)) as Message;

    // Handle Poll creation if provided
    if (pollData) {
      const poll = this.pollRepository.create({
        question: pollData.question,
        allowMultipleSelection: pollData.allowMultipleSelection,
        isAnonymous: pollData.isAnonymous,
        companyId,
        createdBy: userId,
        messageId: savedMessage.id,
      });

      const savedPoll = await this.pollRepository.save(poll);

      // Create poll options
      const options = pollData.options.map(text => this.pollOptionRepository.create({
        text,
        pollId: savedPoll.id,
      }));
      await this.pollOptionRepository.save(options);
    }

    // Load relations
    const loadedMessage = await this.messageRepository.findOne({
      where: { id: savedMessage.id },
      relations: ['user', 'channel', 'replies', 'threadReplies', 'poll', 'poll.options', 'poll.options.votes'],
    });

    if (!loadedMessage) {
      throw new NotFoundException('Message not found after creation');
    }

    // Broadcast message sent event
    try {
      if (this.messagesGateway) {
        this.messagesGateway.broadcastMessageSent(loadedMessage);
      }
    } catch (error) {
      // Gateway error
    }

    return loadedMessage;
  }

  async update(
    id: number,
    updateMessageDto: UpdateMessageDto,
    userId: number,
    companyId: number,
  ): Promise<Message> {
    const message = await this.findOne(id, userId, companyId);

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

    await this.messageRepository.save(message);

    // Load relations
    const updatedMessage = await this.messageRepository.findOne({
      where: { id: message.id },
      relations: ['user', 'channel', 'replies', 'threadReplies', 'poll', 'poll.options', 'poll.options.votes'],
    });

    if (!updatedMessage) {
      throw new NotFoundException('Message not found after update');
    }

    // Broadcast message updated event
    try {
      if (this.messagesGateway) {
        this.messagesGateway.broadcastMessageUpdated(updatedMessage);
      }
    } catch (error) {
      // Gateway error
    }

    return updatedMessage;
  }

  async remove(id: number, userId: number, companyId: number): Promise<void> {
    const message = await this.findOne(id, userId, companyId);

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
  ): Promise<{ message: Message; replies: Message[]; replies_count: number }> {
    console.log(`Getting replies for message ${messageId}`);
    const message = await this.findOne(messageId, userId, companyId);

    if (!message.channelId) {
      throw new BadRequestException('Message does not belong to a channel');
    }

    // Use a direct find to ensure ALL types of replies and their relations are loaded
    const replies = await this.messageRepository.find({
      where: [
        { replyToId: messageId },
        { threadParentId: messageId },
      ],
      relations: ['user', 'channel', 'poll', 'poll.options', 'poll.options.votes'],
      order: { createdAt: 'ASC' },
    });

    console.log(`Found ${replies.length} replies for message ${messageId}`);

    return {
      message,
      replies,
      replies_count: replies.length,
    };
  }

  async getThreads(
    userId: number,
    companyId: number,
    query: MessageQueryDto,
  ): Promise<{ data: Message[]; meta: any; links: any }> {
    const page = query.page || 1;
    const perPage = query.perPage || 20;
    const skip = (page - 1) * perPage;

    const queryBuilder = this.messageRepository
      .createQueryBuilder('message')
      .where('message.replyToId IS NULL')
      .andWhere('message.threadParentId IS NULL')
      .andWhere('message.companyId = :companyId', { companyId })
      .leftJoinAndSelect('message.user', 'user')
      .leftJoinAndSelect('message.channel', 'channel')
      .leftJoin('message.replies', 'replies')
      .leftJoinAndSelect('message.poll', 'poll')
      .leftJoinAndSelect('poll.options', 'options')
      .leftJoinAndSelect('options.votes', 'votes')
      .groupBy('message.id')
      .having('COUNT(replies.id) > 0')
      .orderBy('message.createdAt', 'DESC');

    const [data, total] = await queryBuilder
      .skip(skip)
      .take(perPage)
      .getManyAndCount();

    const totalPages = Math.ceil(total / perPage);

    return {
      data,
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

  async search(
    channelId: number,
    searchQuery: string,
    userId: number,
    companyId: number,
    query: MessageQueryDto,
  ): Promise<{ data: Message[]; meta: any; links: any }> {
    if (!searchQuery || searchQuery.trim().length === 0) {
      throw new BadRequestException('Query parameter is required');
    }

    // Check channel access
    await this.channelsService.checkChannelAccess(channelId, userId, companyId);

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
      .orderBy('message.createdAt', 'DESC');

    const [data, total] = await queryBuilder
      .skip(skip)
      .take(perPage)
      .getManyAndCount();

    const totalPages = Math.ceil(total / perPage);

    return {
      data,
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

  async votePoll(pollId: number, optionId: number, userId: number): Promise<Poll> {
    const poll = await this.pollRepository.findOne({ where: { id: pollId }, relations: ['options'] });
    if (!poll) throw new NotFoundException('Poll not found');
    if (poll.isClosed) throw new BadRequestException('Poll is closed');

    const existingVotes = await this.pollVoteRepository.find({ where: { userId, pollId } });
    const targetVote = existingVotes.find(v => Number(v.pollOptionId) === optionId);

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

    // Transform to include voter_ids for frontend compatibility
    return {
      ...poll,
      options: poll.options.map(option => ({
        ...option,
        voterIds: (option.votes || []).map(v => Number(v.userId)),
        voteCount: (option.votes || []).length,
      })),
    };
  }


  async closePoll(pollId: number, userId: number): Promise<Poll> {
    const poll = await this.pollRepository.findOne({ where: { id: pollId } });
    if (!poll) throw new NotFoundException('Poll not found');
    if (Number(poll.createdBy) !== userId) throw new ForbiddenException('Only creator can close the poll');

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
}
