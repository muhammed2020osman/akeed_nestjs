import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

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
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const serviceAccount = require(serviceAccountPath);
                this.firebaseApp = admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                });
                this.logger.log('✅ Firebase initialized with service account');
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
                await admin.messaging().send(message);
            }
            this.logger.log(`📲 Notification sent to user ${userId} via FCM (${tokens.length} devices)`);
        } catch (error) {
            this.logger.error(`❌ Error sending notification to user ${userId}:`, error);
        }
    }
}
