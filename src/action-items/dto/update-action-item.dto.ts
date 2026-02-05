
import { PartialType } from '@nestjs/mapped-types';
import { CreateActionItemDto } from './create-action-item.dto';
import { IsEnum, IsOptional } from 'class-validator';
import { ActionStatus } from '../entities/action-item.entity';

export class UpdateActionItemDto extends PartialType(CreateActionItemDto) {
    @IsEnum(ActionStatus)
    @IsOptional()
    status?: ActionStatus;
}
