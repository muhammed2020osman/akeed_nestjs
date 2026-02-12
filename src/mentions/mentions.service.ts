import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessageMention } from '../messages/entities/message-mention.entity';

@Injectable()
export class MentionsService {
  constructor(
    @InjectRepository(MessageMention)
    private readonly messageMentionRepository: Repository<MessageMention>,
  ) {}

  async countForUser({
    userId,
    companyId,
  }: {
    userId: number;
    companyId?: number;
  }) {
    const qb = this.messageMentionRepository
      .createQueryBuilder('mention')
      .where('mention.userId = :userId', { userId });

    if (companyId !== undefined && companyId !== null) {
      qb.andWhere('mention.companyId = :companyId', { companyId });
    }

    const count = await qb.getCount();
    return {
      userId,
      companyId: companyId ?? null,
      count,
    };
  }

  async latestForUser({
    userId,
    companyId,
    limit,
  }: {
    userId: number;
    companyId?: number;
    limit: number;
  }) {
    const qb = this.messageMentionRepository
      .createQueryBuilder('mention')
      .leftJoinAndSelect('mention.message', 'message')
      .leftJoinAndSelect('message.user', 'messageUser')
      .leftJoinAndSelect('message.channel', 'messageChannel')
      .leftJoinAndSelect('mention.user', 'user')
      .where('mention.userId = :userId', { userId });

    if (companyId !== undefined && companyId !== null) {
      qb.andWhere('mention.companyId = :companyId', { companyId });
    }

    const mentions = await qb
      .orderBy('mention.createdAt', 'DESC')
      .take(limit)
      .getMany();

    return {
      userId,
      companyId: companyId ?? null,
      data: mentions,
    };
  }

  async findAll({
    userId,
    companyId,
    page,
    perPage,
  }: {
    userId: number;
    companyId?: number;
    page?: any;
    perPage?: any;
  }) {
    const currentPage = page ? parseInt(page, 10) : 1;
    const limit = perPage ? parseInt(perPage, 10) : 50;
    const skip = (currentPage - 1) * limit;

    const qb = this.messageMentionRepository
      .createQueryBuilder('mention')
      .leftJoinAndSelect('mention.message', 'message')
      .leftJoinAndSelect('message.user', 'messageUser')
      .leftJoinAndSelect('message.channel', 'messageChannel')
      .leftJoinAndSelect('mention.user', 'user')
      .where('mention.userId = :userId', { userId });

    if (companyId !== undefined && companyId !== null) {
      qb.andWhere('mention.companyId = :companyId', { companyId });
    }

    const [mentions, total] = await qb
      .orderBy('mention.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: mentions,
      total,
      per_page: limit,
      current_page: currentPage,
      last_page: Math.ceil(total / limit),
      from: total === 0 ? 0 : skip + 1,
      to: Math.min(skip + limit, total),
    };
  }

  async findByChannel({
    channelId,
    userId,
    companyId,
    page,
    perPage,
  }: {
    channelId: number;
    userId: number;
    companyId?: number;
    page?: any;
    perPage?: any;
  }) {
    const currentPage = page ? parseInt(page, 10) : 1;
    const limit = perPage ? parseInt(perPage, 10) : 50;
    const skip = (currentPage - 1) * limit;

    const qb = this.messageMentionRepository
      .createQueryBuilder('mention')
      .leftJoinAndSelect('mention.message', 'message')
      .leftJoinAndSelect('message.user', 'messageUser')
      .leftJoinAndSelect('message.channel', 'messageChannel')
      .leftJoinAndSelect('mention.user', 'user')
      .where('mention.userId = :userId', { userId })
      .andWhere('message.channelId = :channelId', { channelId });

    if (companyId !== undefined && companyId !== null) {
      qb.andWhere('mention.companyId = :companyId', { companyId });
    }

    const [mentions, total] = await qb
      .orderBy('mention.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: mentions,
      total,
      per_page: limit,
      current_page: currentPage,
      last_page: Math.ceil(total / limit),
      from: total === 0 ? 0 : skip + 1,
      to: Math.min(skip + limit, total),
    };
  }
}
