import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel } from './entities/channel.entity';
import { ChannelMember } from './entities/channel-member.entity';

@Injectable()
export class ChannelsService {
  constructor(
    @InjectRepository(Channel)
    private channelRepository: Repository<Channel>,
    @InjectRepository(ChannelMember)
    private channelMemberRepository: Repository<ChannelMember>,
  ) {}

  async findOne(id: number): Promise<Channel> {
    const channel = await this.channelRepository.findOne({
      where: { id },
      relations: ['creator', 'members'],
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    return channel;
  }

  async isUserMember(channelId: number, userId: number): Promise<boolean> {
    const member = await this.channelMemberRepository.findOne({
      where: { channelId, userId },
    });

    return !!member;
  }

  async checkChannelAccess(
    channelId: number,
    userId: number,
    companyId: number,
  ): Promise<Channel> {
    const channel = await this.findOne(channelId);

    // Check company match
    if (channel.companyId !== companyId) {
      throw new ForbiddenException('Access denied to this channel');
    }

    // Check if channel is private
    if (channel.isPrivate) {
      // Check if user is a member
      const isMember = await this.isUserMember(channelId, userId);
      if (!isMember) {
        throw new ForbiddenException('You are not a member of this private channel');
      }
    }

    return channel;
  }
}

