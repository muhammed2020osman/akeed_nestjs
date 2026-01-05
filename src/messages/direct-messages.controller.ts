import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Delete,
    UseGuards,
    Query,
    Req,
    Patch,
} from '@nestjs/common';
import { DirectMessagesService } from './direct-messages.service';
import { CreateDirectMessageDto } from './dto/create-direct-message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('direct-messages')
@UseGuards(JwtAuthGuard)
export class DirectMessagesController {
    constructor(private readonly directMessagesService: DirectMessagesService) { }

    @Get()
    async findAll(
        @Req() req,
        @Query('page') page: number = 1,
        @Query('per_page') perPage: number = 50,
    ) {
        return this.directMessagesService.findAll(
            req.user.id,
            req.user.companyId,
            +page,
            +perPage,
        );
    }

    @Get('conversation/:userId')
    async getConversation(
        @Req() req,
        @Param('userId') otherUserId: string,
        @Query('page') page: number = 1,
        @Query('per_page') perPage: number = 50,
    ) {
        return this.directMessagesService.getConversation(
            req.user.id,
            +otherUserId,
            req.user.companyId,
            +page,
            +perPage,
        );
    }

    @Get('conversations/:id')
    async getConversationById(
        @Req() req,
        @Param('id') id: string,
        @Query('page') page: number = 1,
        @Query('per_page') perPage: number = 50,
    ) {
        return this.directMessagesService.getConversationById(
            +id,
            req.user.id,
            +page,
            +perPage,
        );
    }

    @Get('self')
    async getSelfConversation(
        @Req() req,
        @Query('page') page: number = 1,
        @Query('per_page') perPage: number = 50,
    ) {
        return this.directMessagesService.getSelfConversation(
            req.user.id,
            req.user.companyId,
            +page,
            +perPage,
        );
    }

    @Post()
    async create(@Req() req, @Body() createDto: CreateDirectMessageDto) {
        return this.directMessagesService.create(
            createDto,
            req.user.id,
            req.user.companyId,
        );
    }

    @Patch(':id/read')
    async markAsRead(@Req() req, @Param('id') id: string) {
        await this.directMessagesService.markAsRead(+id, req.user.id);
        return null;
    }

    @Get('unread-count')
    async getUnreadCount(@Req() req) {
        const count = await this.directMessagesService.getUnreadCount(
            req.user.id,
            req.user.companyId,
        );
        return count;
    }

    @Get('conversations')
    async getConversations(@Req() req, @Query('limit') limit?: number) {
        return this.directMessagesService.getConversations(
            req.user.id,
            req.user.companyId,
            limit ? +limit : 50,
        );
    }

    @Delete(':id')
    async remove(@Req() req, @Param('id') id: string) {
        await this.directMessagesService.remove(+id, req.user.id);
        return null;
    }
}
