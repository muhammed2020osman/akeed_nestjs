
import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    UseGuards,
    Query,
} from '@nestjs/common';
import { ActionItemsService } from './action-items.service';
import { CreateActionItemDto } from './dto/create-action-item.dto';
import { UpdateActionItemDto } from './dto/update-action-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('action-items')
@UseGuards(JwtAuthGuard)
export class ActionItemsController {
    constructor(private readonly actionItemsService: ActionItemsService) { }

    @Post()
    create(
        @Body() createActionItemDto: CreateActionItemDto,
        @CurrentUser() user: any,
    ) {
        return this.actionItemsService.create(createActionItemDto, user.userId);
    }

    @Get('channel/:channelId')
    findAllByChannel(@Param('channelId') channelId: string) {
        return this.actionItemsService.findAllByChannel(+channelId);
    }

    @Get('message/:messageId')
    findAllByMessage(@Param('messageId') messageId: string) {
        return this.actionItemsService.findAllByMessage(+messageId);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.actionItemsService.findOne(+id);
    }

    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() updateActionItemDto: UpdateActionItemDto,
    ) {
        return this.actionItemsService.update(+id, updateActionItemDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.actionItemsService.remove(+id);
    }
}
