import { Controller, Post, Body, Get } from '@nestjs/common';
import { FCMService, NotificationData, NotificationPriority } from './fcm.service';

@Controller('fcm')
export class FCMController {
    constructor(private readonly fcmService: FCMService) {}

    /**
     * Send single notification
     */
    @Post('send')
    async sendNotification(@Body() body: {
        token: string;
        title: string;
        body: string;
        data?: NotificationData;
        priority?: NotificationPriority;
        imageUrl?: string;
    }) {
        return this.fcmService.sendChatNotification(body);
    }

    /**
     * Send to multiple devices
     */
    @Post('send-batch')
    async sendBatch(@Body() body: {
        tokens: string[];
        title: string;
        body: string;
        data?: NotificationData;
        priority?: NotificationPriority;
    }) {
        return this.fcmService.sendToMultipleDevices(body);
    }

    /**
     * Send to topic
     */
    @Post('send-topic')
    async sendToTopic(@Body() body: {
        topic: string;
        title: string;
        body: string;
        data?: NotificationData;
    }) {
        return this.fcmService.sendToTopic(body);
    }

    /**
     * Subscribe to topic
     */
    @Post('subscribe')
    async subscribe(@Body() body: { token: string; topic: string }) {
        return this.fcmService.subscribeToTopic(body.topic, body.token);
    }

    /**
     * Unsubscribe from topic
     */
    @Post('unsubscribe')
    async unsubscribe(@Body() body: { token: string; topic: string }) {
        return this.fcmService.unsubscribeFromTopic(body.topic, body.token);
    }

    /**
     * Send with retry
     */
    @Post('send-retry')
    async sendWithRetry(@Body() body: {
        token: string;
        title: string;
        body: string;
        data?: NotificationData;
        priority?: NotificationPriority;
        maxRetries?: number;
    }) {
        return this.fcmService.sendWithRetry(
            {
                token: body.token,
                title: body.title,
                body: body.body,
                data: body.data,
                priority: body.priority,
            },
            body.maxRetries || 3
        );
    }

    /**
     * Test endpoint - send chat notification like WhatsApp
     */
    @Post('test-chat')
    async testChatNotification(@Body() body: {
        token: string;
        senderName: string;
        message: string;
        chatId?: string;
    }) {
        const { token, senderName, message, chatId } = body;

        return this.fcmService.sendChatNotification({
            token,
            title: senderName,
            body: message,
            data: {
                type: 'chat',
                chat_id: chatId,
                sender_name: senderName,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
            },
            priority: 'high',
        });
    }

    /**
     * Health check
     */
    @Get('health')
    healthCheck() {
        return { status: 'ok', message: 'FCM service is running' };
    }
}
