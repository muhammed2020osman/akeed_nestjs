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
import axios from 'axios';

@Controller('direct-messages')
@UseGuards(JwtAuthGuard)
export class DirectMessagesController {
    constructor(
        private readonly directMessagesService: DirectMessagesService,
    ) { }

    private getWorkspaceId(req: any): number | null {
        // Try to get workspaceId from query parameter first
        if (req.query?.workspaceId) {
            return +req.query.workspaceId;
        }
        // Then try header
        if (req.headers?.['x-workspace-id']) {
            return +req.headers['x-workspace-id'];
        }
        // Return null if not found
        return null;
    }

    @Get()
    async findAll(
        @Req() req,
        @Query('page') page: number = 1,
        @Query('per_page') perPage: number = 50,
    ) {
        const workspaceId = this.getWorkspaceId(req);
        return this.directMessagesService.findAll(
            req.user.id,
            req.user.companyId,
            workspaceId,
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
        const workspaceId = this.getWorkspaceId(req);
        return this.directMessagesService.getConversation(
            req.user.id,
            +otherUserId,
            req.user.companyId,
            workspaceId,
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
        const workspaceId = this.getWorkspaceId(req);
        return this.directMessagesService.getConversationById(
            +id,
            req.user.id,
            workspaceId,
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
        const workspaceId = this.getWorkspaceId(req);
        return this.directMessagesService.getSelfConversation(
            req.user.id,
            req.user.companyId,
            workspaceId,
            +page,
            +perPage,
        );
    }

    @Post()
    async create(@Req() req, @Body() createDto: CreateDirectMessageDto) {
        const workspaceId = this.getWorkspaceId(req);
        return this.directMessagesService.create(
            createDto,
            req.user.id,
            req.user.companyId,
            workspaceId,
        );
    }

    @Patch(':id/read')
    async markAsRead(@Req() req, @Param('id') id: string) {
        await this.directMessagesService.markAsRead(+id, req.user.id);
        return null;
    }

    @Get('unread-count')
    async getUnreadCount(@Req() req) {
        const workspaceId = this.getWorkspaceId(req);
        const count = await this.directMessagesService.getUnreadCount(
            req.user.id,
            req.user.companyId,
            workspaceId,
        );
        return count;
    }

    @Get('conversations')
    async getConversations(@Req() req, @Query('limit') limit?: number) {
        const workspaceId = this.getWorkspaceId(req);
        return this.directMessagesService.getConversations(
            req.user.id,
            req.user.companyId,
            workspaceId,
            limit ? +limit : 50,
        );
    }

    @Get('workspace-members')
    async getWorkspaceMembers(
        @Req() req,
        @Query('workspaceId') workspaceId?: string,
    ) {
        const targetWorkspaceId = workspaceId ? +workspaceId : this.getWorkspaceId(req);
        
        if (!targetWorkspaceId) {
            return { success: false, message: 'Workspace ID is required', payload: { data: [] } };
        }

        try {
            // Get Laravel API base URL from environment
            const laravelApiUrl = process.env.LARAVEL_API_URL || 'http://localhost:8000/api';
            const token = req.headers.authorization?.replace('Bearer ', '') || '';

            // Call Laravel API to get workspace members
            const response = await axios.get(
                `${laravelApiUrl}/workspaces/${targetWorkspaceId}/members`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json',
                    },
                }
            );

            // Handle Laravel response format
            if (response.data && response.data.payload && response.data.payload.data) {
                return {
                    success: true,
                    message: 'Workspace members retrieved successfully',
                    payload: {
                        data: response.data.payload.data,
                    },
                };
            }

            return {
                success: true,
                message: 'Workspace members retrieved successfully',
                payload: {
                    data: Array.isArray(response.data) ? response.data : [],
                },
            };
        } catch (error: any) {
            return {
                success: false,
                message: error.response?.data?.message || 'Failed to fetch workspace members',
                payload: { data: [] },
            };
        }
    }

    @Delete(':id')
    async remove(@Req() req, @Param('id') id: string) {
        await this.directMessagesService.remove(+id, req.user.id);
        return null;
    }
}
