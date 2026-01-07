import { Controller, Post, Body, Get } from '@nestjs/common';
import { NotificationService } from './notification.service';

@Controller('notifications')
export class NotificationController {
    constructor(private readonly notificationService: NotificationService) {}

    /**
     * Send chat notification (WhatsApp style)
     */
    @Post('chat')
    async sendChatNotification(@Body() body: {
        token: string;
        senderName: string;
        message: string;
        chatId?: string;
        channelId?: string;
        type?: 'chat' | 'channel' | 'direct_message';
        userId?: number;
        isUrgent?: boolean;
        imageUrl?: string;
    }) {
        return this.notificationService.sendChatNotification(body);
    }

    /**
     * Notify user (all devices)
     */
    @Post('user')
    async notifyUser(@Body() body: {
        userId: number;
        title: string;
        body: string;
        data?: any;
        isUrgent?: boolean;
    }) {
        return this.notificationService.notifyUser(body);
    }

    /**
     * Broadcast to topic
     */
    @Post('broadcast')
    async broadcast(@Body() body: {
        topic: string;
        title: string;
        body: string;
        data?: any;
    }) {
        return this.notificationService.broadcast(body);
    }

    /**
     * Health check
     */
    @Get('health')
    health() {
        return {
            status: 'ok',
            service: 'notification-service',
            timestamp: new Date().toISOString(),
        };
    }
}
