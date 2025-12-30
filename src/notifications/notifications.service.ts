import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);
    private firebaseApp: admin.app.App;

    constructor(
        private configService: ConfigService,
        private dataSource: DataSource,
    ) {
        this.initializeFirebase();
    }

    private initializeFirebase() {
        try {
            // You can load credentials from file or environment variables
            // For this implementation, we'll try to use a service account file path from env
            // or standard Google Application Default Credentials if running in a cloud environment.
            const serviceAccountPath = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');

            if (serviceAccountPath) {
                const absolutePath = path.isAbsolute(serviceAccountPath)
                    ? serviceAccountPath
                    : path.resolve(process.cwd(), serviceAccountPath);

                if (fs.existsSync(absolutePath)) {
                    const serviceAccount = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
                    this.firebaseApp = admin.initializeApp({
                        credential: admin.credential.cert(serviceAccount),
                    });
                    this.logger.log(`✅ Firebase initialized with service account from: ${absolutePath}`);
                } else {
                    this.logger.error(`❌ Service account file not found at: ${absolutePath}`);
                }
            } else {
                // Try initializing without explicitly providing credentials (relies on ADC)
                // or check if it's already initialized
                if (!admin.apps.length) {
                    this.firebaseApp = admin.initializeApp();
                    this.logger.log('✅ Firebase initialized with default credentials');
                } else {
                    this.firebaseApp = admin.app();
                }
            }
        } catch (error) {
            this.logger.error('❌ Failed to initialize Firebase:', error);
        }
    }

    public async sendNotificationToUser(
        userId: number,
        title: string,
        body: string,
        data: Record<string, string> = {},
    ): Promise<void> {
        try {
            // 1. Fetch user's FCM tokens from push_subscriptions table
            const subscriptions = await this.dataSource.query(
                'SELECT fcm_token FROM push_subscriptions WHERE user_id = ? AND fcm_token IS NOT NULL',
                [userId],
            );

            // Also check legacy users table for backward compatibility during migration
            const user = await this.dataSource.query(
                'SELECT fcm_token FROM users WHERE id = ? AND fcm_token IS NOT NULL LIMIT 1',
                [userId],
            );

            const tokens: string[] = subscriptions.map((s: any) => s.fcm_token);
            if (user && user.length > 0 && user[0].fcm_token) {
                if (!tokens.includes(user[0].fcm_token)) {
                    tokens.push(user[0].fcm_token);
                }
            }

            if (tokens.length === 0) {
                this.logger.warn(`⚠️ No FCM tokens found for user ${userId}`);
                return;
            }

            // 2. Send to all tokens
            for (const fcmToken of tokens) {
                // Construct payloads
                const message: admin.messaging.Message = {
                    token: fcmToken,
                    notification: {
                        title,
                        body,
                    },
                    data: {
                        ...data,
                        click_action: 'FLUTTER_NOTIFICATION_CLICK', // Standard for Flutter
                    },
                    android: {
                        priority: 'high',
                        notification: {
                            sound: 'default',
                            channelId: 'messages_work', // Match Android channel ID
                        },
                    },
                    apns: {
                        payload: {
                            aps: {
                                sound: 'default',
                                badge: 1, // Optional: handle badges if needed
                            },
                        },
                    },
                };

                // Send via Firebase
                if (this.firebaseApp) {
                    await admin.messaging().send(message);
                }
            }
            this.logger.log(`📲 Notification sent to user ${userId} via FCM (${tokens.length} devices)`);
        } catch (error) {
            this.logger.error(`❌ Error sending notification to user ${userId}:`, error);
        }
    }

    /**
     * Create or update a notification in the Laravel database to match Laravel's behavior exactly
     */
    public async recordDatabaseNotification(userId: number, notificationData: any): Promise<string> {
        try {
            // 1. Check for existing unread notification for this channel to group them (same logic as Laravel Controller)
            const channelId = notificationData.channel_id;

            if (channelId) {
                const existing = await this.dataSource.query(
                    'SELECT id, data FROM notifications WHERE notifiable_id = ? AND notifiable_type = ? AND type = ? AND read_at IS NULL AND json_unquote(json_extract(data, "$.channel_id")) = ? LIMIT 1',
                    [userId, 'App\\Models\\User', 'App\\Notifications\\NewMessageNotification', String(channelId)]
                );

                if (existing && existing.length > 0) {
                    const row = existing[0];
                    let oldData = row.data;
                    if (typeof oldData === 'string') {
                        oldData = JSON.parse(oldData);
                    }

                    const unreadCount = (oldData.unread_count || 0) + 1;
                    const newData = {
                        ...oldData,
                        message_id: notificationData.message_id,
                        sender_id: notificationData.sender_id,
                        sender_name: notificationData.sender_name,
                        content: notificationData.content,
                        unread_count: unreadCount,
                        created_at: new Date().toISOString()
                    };

                    await this.dataSource.query(
                        'UPDATE notifications SET data = ?, updated_at = ? WHERE id = ?',
                        [JSON.stringify(newData), new Date(), row.id]
                    );

                    return row.id;
                }
            }

            // 2. Create new notification if none exists
            const id = randomUUID();
            const dataToSave = {
                type: 'new_message',
                message_id: notificationData.message_id,
                channel_id: channelId,
                channel_name: notificationData.channel_name,
                channel_type: 'channel',
                sender_id: notificationData.sender_id,
                sender_name: notificationData.sender_name,
                sender_avatar: notificationData.sender_avatar,
                content: notificationData.content,
                content_preview: notificationData.content ? (notificationData.content.substring(0, 100)) : '',
                created_at: new Date().toISOString(),
                unread_count: 1,
            };

            await this.dataSource.query(
                `INSERT INTO notifications (id, type, notifiable_type, notifiable_id, data, read_at, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
                [
                    id,
                    'App\\Notifications\\NewMessageNotification',
                    'App\\Models\\User',
                    userId,
                    JSON.stringify(dataToSave),
                    new Date(),
                    new Date()
                ]
            );

            return id;
        } catch (error) {
            this.logger.error(`❌ Failed to record database notification for user ${userId}:`, error);
            return '';
        }
    }
}
