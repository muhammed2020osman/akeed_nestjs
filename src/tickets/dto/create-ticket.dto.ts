import { IsString, IsInt, IsOptional, IsBoolean, IsEnum, MaxLength, IsISO8601, IsIn } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export enum TicketType {
    ISSUE = 'issue',
    NON_CONFORMANCE = 'non_conformance',
    APPROVAL = 'approval',
    RFI = 'rfi',
    CHANGE = 'change',
    TASK = 'task',
}

export enum TicketStatus {
    OPEN = 'open',
    IN_PROGRESS = 'in_progress',
    PROCESSING = 'processing',
    PENDING_APPROVAL = 'pending_approval',
    NEW = 'new',
    CLOSED = 'closed',
    RESOLVED = 'resolved',
}

export enum TicketPriority {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    URGENT = 'urgent',
}

export class CreateTicketDto {
    @IsString()
    @MaxLength(255)
    title: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    type?: string;

    @IsOptional()
    @IsString()
    status?: string;

    @IsOptional()
    @IsString()
    priority?: string;

    @IsOptional()
    @Type(() => Number)
    channel_id?: number;

    @IsOptional()
    @Type(() => Number)
    channelId?: number;

    @IsOptional()
    @Type(() => Number)
    message_id?: number;

    @IsOptional()
    @Type(() => Number)
    messageId?: number;

    @IsOptional()
    @Type(() => Number)
    assigned_to?: number;

    @IsOptional()
    @Type(() => Number)
    assigneeId?: number;

    @IsOptional()
    @IsBoolean()
    requires_approval?: boolean;

    @IsOptional()
    @Type(() => Number)
    approver_id?: number;

    @IsOptional()
    @Type(() => Number)
    approverId?: number;

    @IsOptional()
    @IsString()
    dueDate?: string;

    @IsOptional()
    @IsString()
    due_at?: string;

    @IsOptional()
    location_context?: any;

    @IsOptional()
    material_items?: any;

    @IsOptional()
    @IsString()
    category?: string;

    @IsOptional()
    tags?: string[];
}
