import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards, Inject, forwardRef, Optional } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChannelsService } from '../channels/channels.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as crypto from 'crypto';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/',
})
export class MessagesGateway
  implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MessagesGateway.name);
  private connectedUsers = new Map<string, { userId: number; companyId: number }>();

  constructor(
    @Inject(forwardRef(() => ChannelsService))
    private channelsService: ChannelsService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private dataSource: DataSource,
    private notificationsService: NotificationsService,
    @Optional()
    @Inject(forwardRef(() => MessagesService))
    private messagesService?: MessagesService,
  ) { }

  async handleConnection(client: Socket) {
    try {
      this.logger.log(`🔌 New connection attempt from client ${client.id}`);
      this.logger.log(`Headers: ${JSON.stringify(client.handshake.headers)}`);
      this.logger.log(`Auth Object: ${JSON.stringify(client.handshake.auth)}`);
      this.logger.log(`Query Params: ${JSON.stringify(client.handshake.query)}`);

      let token = this.extractToken(client);

      // Fallback: Try decoding URI component if token seems encoded/broken
      if (!token && client.handshake.query?.token) {
        try {
          token = decodeURIComponent(client.handshake.query.token as string);
        } catch (e) { }
      }

      if (!token) {
        this.logger.warn(`❌ Client ${client.id} disconnected: No token provided in Headers, Auth, or Query`);
        client.disconnect();
        return;
      }

      this.logger.log(`🔑 Token extracted: ${token.substring(0, 15)}...`);

      const payload = await this.verifyToken(token);
      if (!payload) {
        this.logger.warn(`❌ Client ${client.id} disconnected: Invalid token`);
        client.disconnect();
        return;
      }

      const userId = payload.sub || payload.userId || payload.id;
      const companyId = payload.companyId || payload.company_id;

      this.connectedUsers.set(client.id, { userId, companyId });
      client.data.userId = userId;
      client.data.companyId = companyId;

      // Auto-join user-specific global channel for notifications
      const userChannelName = `private-user-${userId}`;
      await client.join(userChannelName);
      this.logger.log(`👤 Client ${client.id} joined global user channel: ${userChannelName}`);

      this.logger.log(`✅ Client ${client.id} connected successfully (User: ${userId}, Company: ${companyId})`);
    } catch (error) {
      this.logger.error(`❌ Connection error for client ${client.id}:`, error.message);
      this.logger.error(error.stack);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.connectedUsers.delete(client.id);
    this.logger.log(`Client ${client.id} disconnected`);
  }

  @SubscribeMessage('subscribe:channel')
  async handleSubscribeChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channelId: number },
  ) {
    try {
      const { userId, companyId } = this.connectedUsers.get(client.id) || {};
      if (!userId || !companyId) {
        return { error: 'Unauthorized' };
      }

      // Check channel access
      await this.channelsService.checkChannelAccess(
        data.channelId,
        userId,
        companyId,
      );

      const channelName = `private-channel.${data.channelId}`;
      client.join(channelName);

      this.logger.log(
        `User ${userId} subscribed to channel ${data.channelId}`,
      );

      return { success: true, channel: channelName };
    } catch (error) {
      this.logger.error(`Subscribe error:`, error);
      return { error: error.message };
    }
  }

  @SubscribeMessage('unsubscribe:channel')
  async handleUnsubscribeChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channelId: number },
  ) {
    const channelName = `private-channel.${data.channelId}`;
    client.leave(channelName);
    this.logger.log(`Client ${client.id} unsubscribed from channel ${data.channelId}`);
    return { success: true };
  }

  @SubscribeMessage('subscribe:dm')
  async handleSubscribeDM(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { otherUserId: number },
  ) {
    try {
      const { userId } = this.connectedUsers.get(client.id) || {};
      if (!userId) {
        return { error: 'Unauthorized' };
      }

      const roomName = this.getDMRoomName(userId, data.otherUserId);
      client.join(roomName);

      this.logger.log(
        `User ${userId} subscribed to DM room ${roomName}`,
      );

      return { success: true, room: roomName };
    } catch (error) {
      this.logger.error(`Subscribe DM error:`, error);
      return { error: error.message };
    }
  }

  @SubscribeMessage('unsubscribe:dm')
  async handleUnsubscribeDM(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { otherUserId: number },
  ) {
    const { userId } = this.connectedUsers.get(client.id) || {};
    if (!userId) return { error: 'Unauthorized' };

    const roomName = this.getDMRoomName(userId, data.otherUserId);
    client.leave(roomName);
    this.logger.log(`Client ${client.id} unsubscribed from DM room ${roomName}`);
    return { success: true };
  }

  private getDMRoomName(userId1: number, userId2: number): string {
    const sortedIds = [Number(userId1), Number(userId2)].sort((a, b) => a - b);
    return `private-dm.${sortedIds[0]}_${sortedIds[1]}`;
  }

  // Broadcast message sent event
  async broadcastMessageSent(message: any) {
    const channelName = `private-channel.${message.channelId}`;
    this.server.to(channelName).emit('message.sent', {
      message: this.serializeMessage(message),
    });
    this.logger.log(`Broadcasted message.sent to channel ${message.channelId}`);

    // FCM handling is now centralised in MessagesService to ensure reliable delivery
    // regardless of socket state.
  }

  // Broadcast direct message sent event
  async broadcastDirectMessageSent(message: any) {
    const roomName = this.getDMRoomName(message.fromUserId, message.toUserId);
    this.server.to(roomName).emit('dm.sent', {
      message: this.serializeDirectMessage(message),
    });
    this.logger.log(`Broadcasted dm.sent to room ${roomName}`);

    // Broadcast to recipient's global channel (for instant notification outside of chat)
    const recipientUserChannel = `private-user-${message.toUserId}`;
    this.server.to(recipientUserChannel).emit('dm.sent', {
      message: this.serializeDirectMessage(message),
      is_global_event: true
    });
    this.logger.log(`Broadcasted dm.sent (global) to ${recipientUserChannel}`);

    // FCM handling for DMs is now centralised in DirectMessagesService to ensure reliable delivery
    // regardless of socket state.
  }

  // Broadcast message updated event
  broadcastMessageUpdated(message: any) {
    const channelName = `private-channel.${message.channelId}`;
    this.server.to(channelName).emit('message.updated', {
      message: this.serializeMessage(message),
    });
    this.logger.log(`Broadcasted message.updated to channel ${message.channelId}`);
  }

  // Broadcast message deleted event
  broadcastMessageDeleted(messageId: number, channelId: number) {
    const channelName = `private-channel.${channelId}`;
    this.server.to(channelName).emit('message.deleted', {
      message_id: messageId,
      channel_id: channelId,
    });
    this.logger.log(`Broadcasted message.deleted to channel ${channelId}`);
  }

  // Broadcast direct message deleted event
  async broadcastDirectMessageDeleted(messageId: number, fromUserId: number, toUserId: number) {
    const roomName = this.getDMRoomName(fromUserId, toUserId);
    this.server.to(roomName).emit('dm.deleted', {
      message_id: messageId,
    });
    this.logger.log(`Broadcasted dm.deleted to room ${roomName}`);
  }

  async broadcastDirectMessagesRead(userId: number, fromUserId: number) {
    const roomName = this.getDMRoomName(userId, fromUserId);
    this.server.to(roomName).emit('direct-message.read', {
      user_id: userId,
      from_user_id: fromUserId,
    });
    this.logger.log(`Broadcasted direct-message.read to room ${roomName}`);
  }

  // Broadcast poll updated event
  broadcastPollUpdated(poll: any, channelId: number) {
    const channelName = `private-channel.${channelId}`;
    this.server.to(channelName).emit('poll.updated', {
      poll: this.serializePoll(poll),
    });
  }

  private extractToken(client: Socket): string | null {
    // 1. Check Authorization header
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // 2. Check auth object (standard Socket.IO v4)
    const authToken = client.handshake.auth?.token;
    if (authToken) {
      return authToken;
    }

    // 3. Check query parameters (fallback for some clients/polling)
    const queryToken = client.handshake.query?.token;
    if (queryToken && typeof queryToken === 'string') {
      return queryToken;
    }

    return null;
  }

  private async verifyToken(token: string): Promise<any> {
    // Check if it's a Sanctum token
    if (token.includes('|')) {
      const [id, tokenVal] = token.split('|');
      if (!id || !tokenVal) return null;

      const hashedToken = crypto.createHash('sha256').update(tokenVal).digest('hex');

      const tokens = await this.dataSource.query(
        'SELECT * FROM personal_access_tokens WHERE id = ? AND token = ? LIMIT 1',
        [id, hashedToken],
      );

      if (!tokens || tokens.length === 0) {
        return null;
      }

      const tokenRecord = tokens[0];

      const users = await this.dataSource.query(
        'SELECT * FROM users WHERE id = ? LIMIT 1',
        [tokenRecord.tokenable_id],
      );

      if (!users || users.length === 0) {
        return null;
      }

      const user = users[0];
      return {
        userId: user.id,
        companyId: user.company_id,
        email: user.email,
        ...user,
      };
    }

    // Default JWT Verification
    try {
      const secret = this.configService.get<string>('jwt.secret');
      return this.jwtService.verify(token, { secret });
    } catch (error) {
      this.logger.error('Token verification failed:', error);
      return null;
    }
  }

  private serializeMessage(message: any): any {
    return {
      id: message.id,
      content: message.content,
      channel_id: message.channelId,
      user_id: message.userId,
      company_id: message.companyId,
      reply_to_id: message.replyToId,
      thread_parent_id: message.threadParentId,
      attachment_url: message.attachmentUrl,
      attachment_type: message.attachmentType,
      attachment_name: message.attachmentName,
      attachments: message.attachments || [],
      mentions: message.mentions || [],
      edited_at: message.editedAt,
      created_at: message.createdAt,
      updated_at: message.updatedAt,
      user: message.user
        ? {
          id: message.user.id,
          name: message.user.name,
          email: message.user.email,
          profile_image_url: message.user.profileImageUrl,
        }
        : null,
      channel: message.channel
        ? {
          id: message.channel.id,
          name: message.channel.name,
        }
        : null,
      topic_id: message.topicId,
      topic: message.topic
        ? {
          id: message.topic.id,
          channel_id: message.topic.channelId,
          name: message.topic.name,
          color: message.topic.color,
        }
        : null,
      is_urgent: !!message.isUrgent,
      poll: message.poll && message.poll.length > 0 ? this.serializePoll(message.poll[0]) : null,
    };
  }

  private serializePoll(poll: any): any {
    if (!poll) return null;
    return {
      id: poll.id,
      question: poll.question,
      allow_multiple_selection: !!poll.allowMultipleSelection,
      is_anonymous: !!poll.isAnonymous,
      created_by: poll.createdBy,
      is_closed: !!poll.isClosed,
      options: poll.options ? poll.options.map(opt => ({
        id: opt.id,
        text: opt.text,
        voter_ids: opt.votes ? opt.votes.map(v => v.userId) : [],
      })) : [],
    };
  }

  private serializeDirectMessage(message: any): any {
    return {
      id: message.id,
      company_id: message.companyId,
      content: message.content,
      from_user_id: message.fromUserId,
      to_user_id: message.toUserId,
      reply_to_id: message.replyToId,
      attachment_url: message.attachmentUrl,
      attachment_type: message.attachmentType,
      attachment_name: message.attachmentName,
      is_read: message.isRead,
      is_urgent: !!message.isUrgent,
      created_at: message.createdAt,
      updated_at: message.updatedAt,
      from_user: message.fromUser
        ? {
          id: message.fromUser.id,
          name: message.fromUser.name,
          email: message.fromUser.email,
          profile_image_url: message.fromUser.profileImageUrl,
        }
        : null,
      to_user: message.toUser
        ? {
          id: message.toUser.id,
          name: message.toUser.name,
          email: message.toUser.email,
          profile_image_url: message.toUser.profileImageUrl,
        }
        : null,
      reply_to: message.replyTo ? this.serializeDirectMessage(message.replyTo) : null,
    };
  }
}

