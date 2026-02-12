import {
    Controller,
    Get,
    Param,
    Patch,
    Query,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MessageQueryDto } from '../messages/dto/message-query.dto';
import { MessagesService } from '../messages/messages.service';
import { ChannelsService } from './channels.service';

@Controller('channels')
@UseGuards(JwtAuthGuard)
export class ChannelsController {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly messagesService: MessagesService,
  ) { }

  @Get(':id/messages')
  async getChannelMessages(
    @Param('id') id: string,
    @Query() query: MessageQueryDto,
    @CurrentUser() user: any,
  ) {
    const result = await this.messagesService.findByChannel(
      parseInt(id),
      user.userId,
      user.companyId || user.company_id,
      query,
      user.role,
    );
    return {
      status: true,
      code: 200,
      message: 'Messages retrieved successfully',
      payload: result,
    };
  }

  @Get(':id/search')
  async searchChannelMessages(
    @Param('id') id: string,
    @Query('query') searchQuery: string,
    @Query() query: MessageQueryDto,
    @CurrentUser() user: any,
  ) {
    const result = await this.messagesService.search(
      parseInt(id),
      searchQuery,
      user.userId,
      user.companyId || user.company_id,
      query,
      user.role,
    );
    return {
      success: true,
      message: 'Messages found successfully',
      payload: result,
    };
  }

  @Patch(':id/mark-read')
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    await this.messagesService.markChannelAsRead(
      parseInt(id),
      user.userId,
      user.companyId || user.company_id,
      user.role,
    );
    return {
      success: true,
      message: 'Channel notifications marked as read',
    };
  }

  @Get(':id/members')
  async getChannelMembersList(
    @Param('id') id: string,
    @Query('query') query: string,
  ) {
    const members = await this.channelsService.getMembers(parseInt(id), query);
    return {
      success: true,
      data: members,
    };
  }
}

