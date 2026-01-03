import {
  IsString,
  IsInt,
  IsOptional,
  IsArray,
  IsNotEmpty,
  ValidateIf,
  MaxLength,
  IsBoolean,
  IsObject,
} from 'class-validator';
import { Expose, Type } from 'class-transformer';
import { CreatePollDto } from './create-poll.dto';


export class CreateMessageDto {
  @ValidateIf((o) => !o.attachments || o.attachments.length === 0)
  @IsString()
  @IsNotEmpty()
  content?: string;

  @IsInt()
  @IsNotEmpty()
  @Expose({ name: 'channel_id' })
  channelId: number;

  @IsOptional()
  @IsInt()
  @Expose({ name: 'reply_to_id' })
  replyToId?: number;

  @IsOptional()
  @IsInt()
  @Expose({ name: 'thread_parent_id' })
  threadParentId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Expose({ name: 'attachment_url' })
  attachmentUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Expose({ name: 'attachment_type' })
  attachmentType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Expose({ name: 'attachment_name' })
  attachmentName?: string;

  @IsOptional()
  @IsArray()
  attachments?: any[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Expose({ name: 'mentioned_user_ids' })
  mentionedUserIds?: number[];

  @IsOptional()
  @IsInt()
  @Expose({ name: 'topic_id' })
  topicId?: number;

  @IsOptional()
  @IsBoolean()
  @Expose({ name: 'is_urgent' })
  isUrgent?: boolean;
  @IsOptional()
  @IsObject()
  @Type(() => CreatePollDto)
  poll?: CreatePollDto;
}

