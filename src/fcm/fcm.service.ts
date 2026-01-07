import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

export type NotificationPriority = 'low' | 'normal' | 'high';

export interface NotificationData {
    type?: 'chat' | 'channel' | 'direct_message' | 'system';
    chat_id?: string;
    channel_id?: string;
    message_id?: string;
    sender_id?: string;
    sender_name?: string;
    click_action?: string;
    unread_count?: string;
    is_urgent?: string;
    [key: string]: any;
}

@Injectable()
export class FCMService {
    private readonly logger = new Logger(FCMService.name);
    private firebaseApp: admin.app.App;

    constructor(
        private configService: ConfigService,
        private dataSource: DataSource,
    ) {
        this.initializeFirebase();
    }

    private initializeFirebase() {
        try {
            const serviceAccountPath = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');

            if (serviceAccountPath) {
                const absolutePath = path.isAbsolute(serviceAccountPath)
                    ? serviceAccountPath
                    : path.resolve(process.cwd(), serviceAccountPath);

                if (fs.existsSync(absolutePath)) {
                    const serviceAccount = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
                    if (admin.apps.length === 0) {
                        this.firebaseApp = admin.initializeApp({
                            credential: admin.credential.cert(serviceAccount),
                        });
                        this.logger.log('✅ Firebase initialized successfully');
                    } else {
                        this.firebaseApp = admin.app();
                        this.logger.log('ℹ️ Firebase already initialized, using existing app');
                    }

                } else {
                    this.logger.error(`❌ Service account not found: ${absolutePath}`);
                    throw new Error('Firebase service account file not found');
                }
            } else {
                throw new Error('FIREBASE_SERVICE_ACCOUNT_PATH not configured');
            }
        } catch (error) {
            this.logger.error('❌ Firebase initialization failed:', error);
            throw error;
        }
    }

    async sendChatNotification(params: {
        token: string;
        title: string;
        body: string;
        data?: NotificationData;
        priority?: NotificationPriority;
        imageUrl?: string;
    }) {
        const {
            token,
            title,
            body,
            data = {},
            priority = 'high',
            imageUrl,
        } = params;

        try {
            const message: admin.messaging.Message = {
                token,
                notification: {
                    title,
                    body,
                    imageUrl,
                },
                data: {
                    type: data.type || 'chat',
                    click_action: data.click_action || 'FLUTTER_NOTIFICATION_CLICK',
                    ...data,
                },
                android: {
                    priority: priority === 'high' ? 'high' : undefined,
                    ttl: 3600 * 4, // 4 hours
                    notification: {
                        channelId: priority === 'high' ? 'high_importance' : 'messages_work',
                        title,
                        body,
                        sound: 'default',
                        priority: priority === 'high' ? 'high' : undefined,
                        visibility: 'public',
                        notificationCount: data.unread_count ? parseInt(data.unread_count) : 1,
                    },
                },
                apns: {
                    payload: {
                        aps: {
                            alert: {
                                title,
                                body,
                            },
                            sound: 'default',
                            badge: data.unread_count ? parseInt(data.unread_count) : 1,
                            'content-available': 1,
                            'mutable-content': 1,
                        },
                    },
                    headers: {
                        'apns-priority': priority === 'high' ? '10' : '5',
                        'apns-push-type': 'alert',
                    },
                },
            };

            const messageId = await admin.messaging().send(message);
            this.logger.log(`✅ Chat notification sent: ${messageId}`);

            return { success: true, messageId };
        } catch (error: any) {
            this.logger.error(`❌ Failed to send chat notification:`, error);

            if (error.code === 'messaging/registration-token-not-registered') {
                await this.removeToken(token);
                return { success: false, error: 'Invalid token', tokenRemoved: true };
            }

            return { success: false, error: error.message };
        }
    }

    async sendToMultipleDevices(params: {
        tokens: string[];
        title: string;
        body: string;
        data?: NotificationData;
        priority?: NotificationPriority;
    }) {
        const { tokens, title, body, data = {}, priority = 'high' } = params;

        const results = await Promise.allSettled(
            tokens.map(token =>
                this.sendChatNotification({ token, title, body, data, priority })
            )
        );

        const successCount = results.filter(r => r.status === 'fulfilled').length;
        const failedCount = results.filter(r => r.status === 'rejected').length;

        const failedTokens: string[] = [];
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                failedTokens.push(tokens[index]);
            }
        });

        this.logger.log(`📊 Batch send: ${successCount} success, ${failedCount} failed`);

        if (failedTokens.length > 0) {
            await Promise.all(failedTokens.map(token => this.removeToken(token)));
        }

        return {
            total: tokens.length,
            success: successCount,
            failed: failedCount,
            failedTokens,
        };
    }

    async sendToTopic(params: {
        topic: string;
        title: string;
        body: string;
        data?: NotificationData;
    }) {
        const { topic, title, body, data = {} } = params;

        try {
            const message: admin.messaging.Message = {
                topic,
                notification: { title, body },
                data: { ...data, click_action: 'FLUTTER_NOTIFICATION_CLICK' },
                android: {
                    priority: 'high',
                    notification: {
                        channelId: 'high_importance',
                        sound: 'default',
                    },
                },
                apns: {
                    headers: { 'apns-priority': '10' },
                },
            };

            const messageId = await admin.messaging().send(message);
            this.logger.log(`✅ Topic notification sent: ${topic} - ${messageId}`);
            return { success: true, messageId };
        } catch (error: any) {
            this.logger.error(`❌ Failed to send to topic ${topic}:`, error);
            return { success: false, error: error.message };
        }
    }

    private async removeToken(token: string): Promise<void> {
        try {
            await this.dataSource.query(
                'DELETE FROM push_subscriptions WHERE fcm_token = ?',
                [token]
            );
            await this.dataSource.query(
                'UPDATE users SET fcm_token = NULL WHERE fcm_token = ?',
                [token]
            );
            this.logger.log(`🗑️ Removed invalid token`);
        } catch (error) {
            this.logger.error('❌ Failed to remove token:', error);
        }
    }

    async subscribeToTopic(topic: string, token: string) {
        try {
            await admin.messaging().subscribeToTopic(token, topic);
            this.logger.log(`✅ Subscribed to topic: ${topic}`);
        } catch (error) {
            this.logger.error(`❌ Failed to subscribe to topic ${topic}:`, error);
        }
    }

    async unsubscribeFromTopic(topic: string, token: string) {
        try {
            await admin.messaging().unsubscribeFromTopic(token, topic);
            this.logger.log(`✅ Unsubscribed from topic: ${topic}`);
        } catch (error) {
            this.logger.error(`❌ Failed to unsubscribe from topic ${topic}:`, error);
        }
    }

    async sendWithRetry(
        params: {
            token: string;
            title: string;
            body: string;
            data?: NotificationData;
            priority?: NotificationPriority;
        },
        maxRetries = 3
    ) {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const result = await this.sendChatNotification(params);

            if (result.success) {
                return result;
            }

            if (result.tokenRemoved) {
                return result;
            }

            if (attempt === maxRetries - 1) {
                return result;
            }

            const delay = Math.pow(2, attempt) * 1000;
            this.logger.warn(`⚠️ Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        return { success: false, error: 'Max retries exceeded' };
    }
}
