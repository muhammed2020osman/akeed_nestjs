import { IsNotEmpty, IsString, IsNumber, IsOptional, IsArray, IsBoolean, MaxLength } from 'class-validator';
import { Expose } from 'class-transformer';

export class CreateDirectMessageDto {
    @IsNotEmpty()
    @IsNumber()
    toUserId: number;

    @IsNotEmpty()
    @IsString()
    content: string;

    @IsOptional()
    @IsString()
    @MaxLength(36)
    @Expose({ name: 'local_id' })
    localId?: string;

    @IsOptional()
    @IsNumber()
    replyToId?: number;

    @IsOptional()
    @IsString()
    attachmentUrl?: string;

    @IsOptional()
    @IsString()
    attachmentType?: string;

    @IsOptional()
    @IsString()
    attachmentName?: string;

    @IsOptional()
    @IsNumber()
    conversationId?: number;

    @IsOptional()
    @IsBoolean()
    @Expose({ name: 'is_urgent' })
    isUrgent?: boolean;
}
