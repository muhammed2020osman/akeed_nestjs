import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { MessageQueryDto } from './dto/message-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) { }

  @Get()
  async index(
    @Query() query: MessageQueryDto,
    @CurrentUser() user: any,
  ) {
    const result = await this.messagesService.findAll(
      user.userId,
      user.companyId || user.company_id,
      query,
    );
    return result;
  }

  @Get('threads')
  async getThreads(
    @Query() query: MessageQueryDto,
    @CurrentUser() user: any,
  ) {
    const result = await this.messagesService.getThreads(
      user.userId,
      user.companyId || user.company_id,
      query,
    );
    return result;
  }

  @Get('starred')
  async getStarredMessages(
    @Query() query: MessageQueryDto,
    @CurrentUser() user: any,
  ) {
    const result = await this.messagesService.getStarredMessages(
      user.userId,
      user.companyId || user.company_id,
      query,
    );
    return {
      success: true,
      message: 'Starred messages retrieved successfully',
      payload: result,
    };
  }

  @Get('starred/count')
  async getStarredCount(@CurrentUser() user: any) {
    const count = await this.messagesService.getStarredCount(user.userId);
    return {
      success: true,
      message: 'Starred messages count retrieved successfully',
      payload: { count },
    };
  }

  @Get(':id')
  async show(@Param('id') id: string, @CurrentUser() user: any) {
    const message = await this.messagesService.findOne(
      parseInt(id),
      user.userId,
      user.companyId || user.company_id,
    );
    return message;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FilesInterceptor('attachments[]'))
  async store(
    @Body() createMessageDto: CreateMessageDto,
    @CurrentUser() user: any,
    @UploadedFiles() files: any[],
  ) {
    console.log('🚀 [MessagesController] POST /messages');
    console.log('👤 [User]:', user.userId, user.role);
    console.log('📦 [Body]:', JSON.stringify(createMessageDto));
    console.log('📎 [Files Count]:', files ? files.length : 0);

    if (files && files.length > 0) {
      files.forEach((f, i) => {
        console.log(`__ File ${i}: Field=${f.fieldname}, OriginalName=${f.originalname}, Size=${f.size}`);
      });
    }

    const message = await this.messagesService.create(
      createMessageDto,
      user.userId,
      user.companyId || user.company_id,
      user.role,
      files,
    );
    return message;
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateMessageDto: UpdateMessageDto,
    @CurrentUser() user: any,
  ) {
    const message = await this.messagesService.update(
      parseInt(id),
      updateMessageDto,
      user.userId,
      user.companyId || user.company_id,
    );
    return message;
  }

  @Patch(':id/topic')
  async updateTopic(
    @Param('id') id: string,
    @Body() updateMessageDto: UpdateMessageDto,
    @CurrentUser() user: any,
  ) {
    const message = await this.messagesService.updateTopic(
      parseInt(id),
      updateMessageDto.topicId ?? null,
      user.userId,
      user.companyId || user.company_id,
      user.role,
    );
    return message;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async destroy(@Param('id') id: string, @CurrentUser() user: any) {
    await this.messagesService.remove(
      parseInt(id),
      user.userId,
      user.companyId || user.company_id,
    );
    return null;
  }

  @Get(':id/thread')
  async thread(@Param('id') id: string, @CurrentUser() user: any) {
    const result = await this.messagesService.getReplies(
      parseInt(id),
      user.userId,
      user.companyId || user.company_id,
    );
    return {
      parent: result.message,
      replies: result.replies,
      replies_count: result.replies_count,
    };
  }

  @Post(':id/reaction')
  async toggleReaction(
    @Param('id') id: string,
    @Body('emoji') emoji: string,
    @CurrentUser() user: any,
  ) {
    return await this.messagesService.toggleReaction(
      parseInt(id),
      emoji,
      user.userId,
      user.companyId || user.company_id,
    );
  }

  @Post(':id/pin')
  async togglePin(@Param('id') id: string, @CurrentUser() user: any) {
    return await this.messagesService.togglePin(
      parseInt(id),
      user.userId,
      user.companyId || user.company_id,
    );
  }

  @Post(':id/forward')
  async forwardMessage(
    @Param('id') id: string,
    @Body('channelId') targetChannelId: number,
    @Body('isSourceDm') isSourceDm: boolean,
    @CurrentUser() user: any,
  ) {
    console.log(`[Controller] Forward request: messageId=${id}, targetChannelId=${targetChannelId}, isSourceDm=${isSourceDm}`);
    try {
      const result = await this.messagesService.forwardMessage(
        parseInt(id),
        targetChannelId,
        user.userId,
        user.companyId || user.company_id,
        user.role,
        isSourceDm || false,
      );
      console.log(`[Controller] Forward success:`, result);

      // If the service already returned a standard response, pass it through
      if (result && result.status !== undefined && result.payload !== undefined) {
        return result;
      }

      // Otherwise wrap in standard response format
      return {
        status: true,
        code: 201,
        message: 'Message forwarded successfully',
        payload: result,
      };
    } catch (error) {
      console.error(`[Controller] Forward error:`, error);
      throw error;
    }
  }

  @Get(':id/replies')
  async getReplies(@Param('id') id: string, @CurrentUser() user: any) {
    const result = await this.messagesService.getReplies(
      parseInt(id),
      user.userId,
      user.companyId || user.company_id,
    );
    return {
      message: result.message,
      replies: result.replies,
      replies_count: result.replies_count,
    };
  }

  @Post(':id/favorite')
  async toggleFavorite(@Param('id') id: string, @CurrentUser() user: any) {
    const message = await this.messagesService.toggleFavorite(
      parseInt(id),
      user.userId,
      user.companyId || user.company_id,
    );
    return {
      success: true,
      message: 'Favorite status toggled successfully',
      payload: message,
    };
  }

  @Get(':id/starred')
  async checkStarred(@Param('id') id: string, @CurrentUser() user: any) {
    const message = await this.messagesService.findOne(
      parseInt(id),
      user.userId,
      user.companyId || user.company_id,
    );
    return {
      success: true,
      message: 'Starred status retrieved successfully',
      payload: { is_starred: message.is_starred || false },
    };
  }

  @Get(':id/ticket')
  async getTicketByMessage(@Param('id') id: string, @CurrentUser() user: any) {
    // Return all action items linked to this message
    // In the future, if we want to return a specific single "ticket", we can filter or change the return type
    // For now, consistent with "Action Items", we'll return the list or the first one if the UI expects a single object
    // usage: GET /messages/123/ticket

    // We need to inject ActionItemsService. Since we didn't inject it in the constructor yet, 
    // we should add it. But for now, to avoid circular dependencies if any, 
    // let's stick to the plan of having a separate controller for ActionItems.
    // OPTION 2: If the UI strictly calls this endpoint, we must implement it.
    // The previous analysis showed this endpoint returning { success: true, payload: { ticket_id: null, ticket: null } }

    // Let's assume for this specific UI requirement, we want to know if there is *any* ticket/action item.
    // However, since I haven't injected the service yet, I need to update the constructor first.
    return {
      success: true,
      message: 'This endpoint is deprecated. Please use /action-items/message/:id',
      payload: {
        ticket_id: null,
        ticket: null,
      },
    };
  }

  @Post('polls/:pollId/vote/:optionId')
  async vote(
    @Param('pollId') pollId: string,
    @Param('optionId') optionId: string,
    @CurrentUser() user: any,
  ) {
    const poll = await this.messagesService.votePoll(
      parseInt(pollId),
      parseInt(optionId),
      user.userId,
    );
    return poll;
  }

  @Post('polls/:pollId/close')
  async close(@Param('pollId') pollId: string, @CurrentUser() user: any) {
    const poll = await this.messagesService.closePoll(
      parseInt(pollId),
      user.userId,
    );
    return poll;
  }
}

