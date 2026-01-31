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
    // TODO: Implement starred messages
    return {
      success: true,
      message: 'Starred messages retrieved successfully',
      payload: {
        data: [],
        meta: {
          current_page: 1,
          per_page: query.perPage || 20,
          total: 0,
          last_page: 1,
          from: 0,
          to: 0,
        },
        links: {
          first: null,
          last: null,
          prev: null,
          next: null,
        },
      },
    };
  }

  @Get('starred/count')
  async getStarredCount(@CurrentUser() user: any) {
    // TODO: Implement starred count
    return {
      success: true,
      message: 'Starred messages count retrieved successfully',
      payload: { count: 0 },
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
    @CurrentUser() user: any,
  ) {
    return await this.messagesService.forwardMessage(
      parseInt(id),
      targetChannelId,
      user.userId,
      user.companyId || user.company_id,
      user.role,
    );
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
    // TODO: Implement check starred
    return {
      success: true,
      message: 'Starred status retrieved successfully',
      payload: { is_starred: false },
    };
  }

  @Get(':id/ticket')
  async getTicketByMessage(@Param('id') id: string, @CurrentUser() user: any) {
    // TODO: Implement ticket by message
    return {
      success: true,
      message: 'No ticket found for this message',
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

