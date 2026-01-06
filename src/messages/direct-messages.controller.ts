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
    HttpException,
    BadRequestException,
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


    private getWorkspaceId(req: any, required: boolean = true): number | undefined {
        // Try to get workspaceId from query parameter first
        if (req.query?.workspaceId) {
            return +req.query.workspaceId;
        }
        // Then try header
        if (req.headers?.['x-workspace-id']) {
            return +req.headers['x-workspace-id'];
        }

        // Throw error if needed
        if (required) {
            throw new Error('Workspace ID is required. Please provide workspaceId in query parameter or X-Workspace-Id header');
        }

        return undefined;
    }

    @Get()
    async findAll(
        @Req() req,
        @Query('page') page: number = 1,
        @Query('per_page') perPage: number = 50,
    ) {
        const workspaceId = this.getWorkspaceId(req, true) as number;
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
        const workspaceId = this.getWorkspaceId(req, true) as number;
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
        const workspaceId = this.getWorkspaceId(req, false);
        return this.directMessagesService.getConversationById(
            +id,
            req.user.id,
            workspaceId || null,
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
        const workspaceId = this.getWorkspaceId(req, true) as number;
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
        const workspaceId = this.getWorkspaceId(req, true) as number;
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
        const workspaceId = this.getWorkspaceId(req, true) as number;
        const count = await this.directMessagesService.getUnreadCount(
            req.user.id,
            req.user.companyId,
            workspaceId,
        );
        return count;
    }

    @Get('conversations')
    async getConversations(@Req() req, @Query('limit') limit?: number) {
        const workspaceId = this.getWorkspaceId(req, false);
        return this.directMessagesService.getConversations(
            req.user.id,
            req.user.companyId,
            workspaceId,
            limit ? +limit : 50,
        );
    }

    @Get('workspace/:workspaceId/conversations')
    async getConversationsByWorkspace(
        @Req() req,
        @Param('workspaceId') workspaceId: string,
        @Query('limit') limit?: number,
    ) {
        return this.directMessagesService.getConversations(
            req.user.id,
            req.user.companyId,
            +workspaceId,
            limit ? +limit : 50,
        );
    }

    @Get('workspace-members')
    async getWorkspaceMembers(
        @Req() req,
        @Query('workspaceId') workspaceId?: string,
    ) {
        const targetWorkspaceId = workspaceId ? +workspaceId : this.getWorkspaceId(req, false);

        if (!targetWorkspaceId) {
            throw new BadRequestException('Workspace ID is required');
        }

        try {
            // Get Laravel API base URL from environment
            // Laravel is hosted on a separate server: slack.gumra-ai.com
            const laravelApiUrl = process.env.LARAVEL_API_URL || 'https://slack.gumra-ai.com/api';
            console.log(`[Debug] Fetching members from: ${laravelApiUrl}/workspaces/${targetWorkspaceId}/members`);

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
            const data = response.data;

            // Case 1: Standard Laravel API Resource collection (wrapped in data) inside payload
            // Structure: { payload: { data: [...], meta: ... } }
            if (data?.payload?.data && Array.isArray(data.payload.data)) {
                return data.payload.data;
            }

            // Case 2: Direct array inside payload
            // Structure: { payload: [...] }
            if (data?.payload && Array.isArray(data.payload)) {
                return data.payload;
            }

            // Case 3: Direct array response
            // Structure: [...]
            if (Array.isArray(data)) {
                return data;
            }

            return [];
        } catch (error: any) {
            const status = error.response?.status || 500;
            const message = error.response?.data?.message || error.message || 'Failed to fetch workspace members';

            // Log full error for debugging
            console.error(`[Debug] Error fetching workspace members: ${message}`);
            if (error.response) {
                console.error('[Debug] Response Status:', error.response.status);
                // console.error('[Debug] Response Data:', JSON.stringify(error.response.data));
            } else if (error.request) {
                console.error('[Debug] No response received. Check Laravel URL/Port.');
            } else {
                console.error('[Debug] Request setup error:', error.message);
            }

            throw new HttpException(message, status);
        }
    }

    @Delete(':id')
    async remove(@Req() req, @Param('id') id: string) {
        await this.directMessagesService.remove(+id, req.user.id);
        return null;
    }
}
