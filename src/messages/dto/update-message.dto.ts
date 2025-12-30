import {
  IsString,
  IsInt,
  IsOptional,
  IsArray,
  IsBoolean,
  MaxLength,
  IsInt as IsIntArray,
} from 'class-validator';

export class UpdateMessageDto {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsArray()
  @IsIntArray({ each: true })
  mentionedUserIds?: number[];

  @IsOptional()
  @IsInt()
  topicId?: number;

  @IsOptional()
  @IsBoolean()
  isUrgent?: boolean;

  @IsOptional()
  @IsBoolean()
  isActionItem?: boolean;

  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;
}

