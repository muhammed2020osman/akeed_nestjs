import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Channel } from '../../channels/entities/channel.entity';
import { User } from '../../users/entities/user.entity';
import { Poll } from './poll.entity';
import { Topic } from './topic.entity';
import { Attachment } from './attachment.entity';


@Entity('messages')
@Index('idx_messages_company', ['companyId'])
@Index('channel_id', ['channelId'])
@Index('user_id', ['userId'])
export class Message {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'bigint', unsigned: true })
  companyId: number;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'channel_id', type: 'bigint', unsigned: true, nullable: true })
  channelId: number | null;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId: number;

  @Column({ name: 'reply_to_id', type: 'bigint', unsigned: true, nullable: true })
  replyToId: number | null;

  @Column({ name: 'attachment_url', type: 'text', nullable: true })
  attachmentUrl: string | null;

  @Column({ name: 'attachment_type', type: 'varchar', length: 100, nullable: true })
  attachmentType: string | null;

  @Column({ name: 'attachment_name', type: 'varchar', length: 255, nullable: true })
  attachmentName: string | null;

  @Column({ name: 'thread_parent_id', type: 'bigint', unsigned: true, nullable: true })
  threadParentId: number | null;

  @Column({ type: 'json', default: '[]' })
  mentions: number[];

  @Column({ name: 'edited_at', type: 'timestamp', nullable: true })
  editedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'topic_id', type: 'bigint', unsigned: true, nullable: true })
  topicId: number | null;

  @Column({ name: 'is_urgent', type: 'boolean', default: false })
  isUrgent: boolean;

  // Relations
  @ManyToOne(() => Channel, (channel) => channel.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'channel_id' })
  channel: Channel;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Message, (message) => message.replies, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'reply_to_id' })
  replyTo: Message | null;

  @OneToMany(() => Message, (message) => message.replyTo)
  replies: Message[];

  @ManyToOne(() => Message, (message) => message.threadReplies, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'thread_parent_id' })
  threadParent: Message | null;

  @OneToMany(() => Message, (message) => message.threadParent)
  threadReplies: Message[];

  @OneToOne(() => Poll, (poll) => poll.message)
  poll: Poll;

  @ManyToOne(() => Topic, (topic) => topic.messages, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'topic_id' })
  topic: Topic | null;

  @OneToMany(() => Attachment, (attachment) => attachment.message)
  attachments: Attachment[];
}


