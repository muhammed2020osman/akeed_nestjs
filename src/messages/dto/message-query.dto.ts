import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type, Expose } from 'class-transformer';

export class MessageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @Expose({ name: 'per_page' })
  perPage?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Expose({ name: 'channel_id' })
  channelId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Expose({ name: 'topic_id' })
  topicId?: number;
}

