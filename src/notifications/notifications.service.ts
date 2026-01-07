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

            // 2. Send to all tokens with retry and logging
            const results = await Promise.allSettled(
                tokens.map(fcmToken => this.sendWithRetry(fcmToken, title, body, data))
            );

            const successCount = results.filter(r => r.status === 'fulfilled').length;
            const failedCount = results.filter(r => r.status === 'rejected').length;

            if (failedCount > 0) {
                const failedIndices = results
                    .map((r, i) => r.status === 'rejected' ? i : -1)
                    .filter(i => i !== -1);
                
                this.logger.warn(`⚠️ ${failedCount}/${tokens.length} notifications failed for user ${userId}`);
            }

            this.logger.log(`📲 Notification sent to user ${userId}: ${successCount} success, ${failedCount} failed`);
        } catch (error) {
            this.logger.error(`❌ Error sending notification to user ${userId}:`, error);
        }
    }

    /**
     * Send notification with retry logic
     */
    private async sendWithRetry(
        fcmToken: string,
        title: string,
        body: string,
        data: Record<string, string>,
        maxRetries = 3
    ): Promise<void> {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const message: admin.messaging.Message = {
                    token: fcmToken,
                    notification: {
                        title,
                        body,
                    },
                    data: {
                        ...data,
                        click_action: 'FLUTTER_NOTIFICATION_CLICK',
                        sent_at: new Date().toISOString(),
                    },
                    android: {
                        priority: 'high',
                        ttl: 3600 * 4, // 4 hours TTL
                        notification: {
                            sound: 'default',
                            channelId: 'messages_work',
                            priority: 'high',
                            vibrationPattern: [500, 500, 500],
                            visibility: 'public',
                        },
                    },
                    apns: {
                        payload: {
                            aps: {
                                sound: 'default',
                                badge: 1,
                                'content-available': 1,
                                alert: {
                                    title,
                                    body,
                                },
                            },
                        },
                        headers: {
                            'apns-priority': '10',
                        },
                    },
                };

                if (!this.firebaseApp) {
                    throw new Error('Firebase app not initialized');
                }

                const messageId = await admin.messaging().send(message);
                this.logger.log(`✅ Notification sent successfully: ${messageId} (attempt ${attempt + 1})`);
                return;
            } catch (error: any) {
                const errorCode = error?.code;

                if (errorCode === 'messaging/registration-token-not-registered') {
                    this.logger.warn(`🗑️ Invalid token detected: ${fcmToken.substring(0, 20)}...`);
                    await this.removeToken(fcmToken);
                    return;
                }

                if (errorCode === 'messaging/invalid-argument') {
                    this.logger.error(`❌ Invalid argument for token: ${fcmToken.substring(0, 20)}...`, error);
                    await this.removeToken(fcmToken);
                    return;
                }

                if (attempt === maxRetries - 1) {
                    this.logger.error(`❌ Failed after ${maxRetries} attempts for token: ${fcmToken.substring(0, 20)}...`, error);
                    throw error;
                }

                const delay = Math.pow(2, attempt) * 1000;
                this.logger.warn(`⚠️ Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    /**
     * Remove invalid token from database
     */
    private async removeToken(fcmToken: string): Promise<void> {
        try {
            await this.dataSource.query(
                'DELETE FROM push_subscriptions WHERE fcm_token = ?',
                [fcmToken]
            );
            await this.dataSource.query(
                'UPDATE users SET fcm_token = NULL WHERE fcm_token = ?',
                [fcmToken]
            );
            this.logger.log(`🗑️ Removed invalid token from database`);
        } catch (error) {
            this.logger.error(`❌ Failed to remove invalid token:`, error);
        }
    }

    /**
     * Create or update a notification in the Laravel database to match Laravel's behavior exactly
     */
    public async recordDatabaseNotification(userId: number, notificationData: any): Promise<string> {
        try {
            // 1. Grouping Logic
            const channelId = notificationData.channel_id;
            const senderId = notificationData.sender_id;
            const isDM = notificationData.channel_type === 'direct_message';

            // Check for existing unread notification to group them
            let existing: any[] = [];

            if (isDM && senderId) {
                // Group DMs by sender
                existing = await this.dataSource.query(
                    'SELECT id, data FROM notifications WHERE notifiable_id = ? AND notifiable_type = ? AND type = ? AND read_at IS NULL AND json_unquote(json_extract(data, "$.sender_id")) = ? AND json_unquote(json_extract(data, "$.channel_type")) = "direct_message" LIMIT 1',
                    [userId, 'App\\Models\\User', 'App\\Notifications\\NewMessageNotification', String(senderId)]
                );
            } else if (channelId) {
                // Group Channel messages by channel
                existing = await this.dataSource.query(
                    'SELECT id, data FROM notifications WHERE notifiable_id = ? AND notifiable_type = ? AND type = ? AND read_at IS NULL AND json_unquote(json_extract(data, "$.channel_id")) = ? LIMIT 1',
                    [userId, 'App\\Models\\User', 'App\\Notifications\\NewMessageNotification', String(channelId)]
                );
            }

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

            // 2. Create new notification if none exists
            const id = randomUUID();
            const dataToSave = {
                type: 'new_message',
                message_id: notificationData.message_id,
                channel_id: channelId || null,
                channel_name: notificationData.channel_name || null,
                channel_type: isDM ? 'direct_message' : 'channel',
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

    /**
     * Subscribe a user to push notifications
     */
    public async subscribeToPush(userId: number, subscriptionData: { fcm_token: string, device_type: string, device_id?: string }): Promise<void> {
        try {
            // 1. Check if subscription already exists
            const existing = await this.dataSource.query(
                'SELECT id FROM push_subscriptions WHERE user_id = ? AND fcm_token = ? LIMIT 1',
                [userId, subscriptionData.fcm_token]
            );

            if (existing && existing.length > 0) {
                // Update timestamp
                await this.dataSource.query(
                    'UPDATE push_subscriptions SET updated_at = ?, device_type = ?, device_id = ? WHERE id = ?',
                    [new Date(), subscriptionData.device_type, subscriptionData.device_id || null, existing[0].id]
                );
            } else {
                // Create new subscription
                await this.dataSource.query(
                    'INSERT INTO push_subscriptions (user_id, fcm_token, device_type, device_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
                    [userId, subscriptionData.fcm_token, subscriptionData.device_type, subscriptionData.device_id || null, new Date(), new Date()]
                );
            }

            // 2. Also update users table for backward compatibility
            await this.dataSource.query(
                'UPDATE users SET fcm_token = ? WHERE id = ?',
                [subscriptionData.fcm_token, userId]
            );

            this.logger.log(`📱 User ${userId} subscribed to push notifications successfully`);
        } catch (error) {
            this.logger.error(`❌ Failed to subscribe user ${userId} to push:`, error);
            throw error;
        }
    }

    /**
     * Unsubscribe a user from push notifications
     */
    public async unsubscribeFromPush(userId: number, fcmToken: string): Promise<void> {
        try {
            await this.dataSource.query(
                'DELETE FROM push_subscriptions WHERE user_id = ? AND fcm_token = ?',
                [userId, fcmToken]
            );

            // Clear from users table if it matches
            await this.dataSource.query(
                'UPDATE users SET fcm_token = NULL WHERE id = ? AND fcm_token = ?',
                [userId, fcmToken]
            );

            this.logger.log(`📴 User ${userId} unsubscribed from push notifications`);
        } catch (error) {
            this.logger.error(`❌ Failed to unsubscribe user ${userId} from push:`, error);
            throw error;
        }
    }
}
