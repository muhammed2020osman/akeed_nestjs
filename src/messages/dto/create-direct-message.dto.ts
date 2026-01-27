import { IsNotEmpty, IsString, IsNumber, IsOptional, IsArray, IsBoolean } from 'class-validator';
import { Expose } from 'class-transformer';

export class CreateDirectMessageDto {
    @IsNotEmpty()
    @IsNumber()
    toUserId: number;

    @IsNotEmpty()
    @IsString()
    content: string;

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
