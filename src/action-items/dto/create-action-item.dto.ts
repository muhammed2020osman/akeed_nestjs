
import {
    IsEnum,
    IsNotEmpty,
    IsString,
    IsOptional,
    IsNumber,
    IsDateString,
} from 'class-validator';
import { ActionType, ActionPriority } from '../entities/action-item.entity';

export class CreateActionItemDto {
    @IsEnum(ActionType)
    @IsNotEmpty()
    type: ActionType;

    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsNumber()
    @IsNotEmpty()
    messageId: number;

    @IsEnum(ActionPriority)
    @IsOptional()
    priority?: ActionPriority;

    @IsDateString()
    @IsOptional()
    dueDate?: Date;

    @IsNumber()
    @IsOptional()
    assigneeId?: number;

    @IsOptional()
    meta?: any;
}
