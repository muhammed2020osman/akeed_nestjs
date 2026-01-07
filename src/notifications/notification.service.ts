import { Injectable, Logger } from '@nestjs/common';
import { FCMService } from './fcm.service';
import { DataSource } from 'typeorm';

interface ChatNotificationPayload {
    token: string;
    senderName: string;
    message: string;
    chatId?: string;
    channelId?: string;
    type?: 'chat' | 'channel' | 'direct_message';
    userId?: number;
    isUrgent?: boolean;
    imageUrl?: string;
}

@Injectable()
export class NotificationService {
    private readonly logger = new Logger(NotificationService.name);

    constructor(
        private readonly fcmService: FCMService,
        private readonly dataSource: DataSource,
    ) {}

    /**
     * Send chat notification (WhatsApp style)
     */
    async sendChatNotification(payload: ChatNotificationPayload) {
        const { token, senderName, message, chatId, type = 'chat', userId, isUrgent = false } = payload;

        try {
            // Get unread count for badge
            let unreadCount = 1;
            if (userId) {
                const result = await this.dataSource.query(
                    `SELECT COUNT(*) as unread FROM notifications 
                     WHERE notifiable_id = ? AND read_at IS NULL`,
                    [userId]
                );
                unreadCount = result[0]?.unread || 1;
            }

            // Send notification
            const result = await this.fcmService.sendChatNotification({
                token,
                title: senderName,
                body: message,
                data: {
                    type,
                    chat_id: chatId?.toString(),
                    channel_id: payload.channelId?.toString(),
                    sender_name: senderName,
                    unread_count: unreadCount.toString(),
                    is_urgent: isUrgent.toString(),
                    click_action: 'FLUTTER_NOTIFICATION_CLICK',
                },
                priority: isUrgent ? 'high' : 'high',
                imageUrl: payload.imageUrl,
            });

            if (result.success) {
                this.logger.log(`✅ Chat notification sent to ${senderName}`);
            } else {
                this.logger.warn(`⚠️ Failed to send notification: ${result.error}`);
            }

            return result;
        } catch (error) {
            this.logger.error('❌ Error sending chat notification:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send notification to user (all devices)
     */
    async notifyUser(params: {
        userId: number;
        title: string;
        body: string;
        data?: any;
        isUrgent?: boolean;
    }) {
        const { userId, title, body, data = {}, isUrgent = false } = params;

        // Get all user tokens
        const tokens = await this.dataSource.query(
            'SELECT fcm_token FROM push_subscriptions WHERE user_id = ? AND fcm_token IS NOT NULL',
            [userId]
        );

        if (!tokens || tokens.length === 0) {
            this.logger.warn(`⚠️ No FCM tokens for user ${userId}`);
            return { success: false, error: 'No tokens found' };
        }

        const tokenList = tokens.map((t: any) => t.fcm_token);

        // Send to all devices
        const result = await this.fcmService.sendToMultipleDevices({
            tokens: tokenList,
            title,
            body,
            data: {
                ...data,
                unread_count: data.unread_count?.toString() || '1',
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
            },
            priority: isUrgent ? 'high' : 'high',
        });

        this.logger.log(`📊 User notification sent: ${result.success}/${result.total} devices`);
        return result;
    }

    /**
     * Broadcast to topic (announcements, etc.)
     */
    async broadcast(params: {
        topic: string;
        title: string;
        body: string;
        data?: any;
    }) {
        const { topic, title, body, data = {} } = params;

        const result = await this.fcmService.sendToTopic({
            topic,
            title,
            body,
            data: {
                ...data,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
            },
        });

        if (result.success) {
            this.logger.log(`✅ Broadcast sent to topic: ${topic}`);
        } else {
            this.logger.warn(`⚠️ Broadcast failed: ${result.error}`);
        }

        return result;
    }
}
