import { IsNotEmpty, IsString, IsNumber, IsOptional, IsArray } from 'class-validator';

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
}
