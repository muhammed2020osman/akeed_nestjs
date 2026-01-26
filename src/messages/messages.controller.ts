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
    console.log('📝 [MessagesController] Store Request Received');
    console.log('📦 [MessagesController] Body:', JSON.stringify(createMessageDto));
    console.log('TBH [MessagesController] Files Count:', files ? files.length : 0);
    if (files && files.length > 0) {
      files.forEach((f, i) => {
        console.log(`__ File ${i}: Field=${f.fieldname}, Name=${f.originalname}, Size=${f.size}, Mime=${f.mimetype}`);
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
    // TODO: Implement favorite toggle
    return {
      success: true,
      message: 'Message added to favorites',
      payload: {
        is_starred: true,
        message: 'Message added to favorites',
      },
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

