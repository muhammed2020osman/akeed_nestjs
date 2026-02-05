
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
} from 'typeorm';
import { Message } from '../../messages/entities/message.entity';
import { Channel } from '../../channels/entities/channel.entity';
import { User } from '../../users/entities/user.entity';

export enum ActionType {
    APPROVAL = 'APPROVAL',
    ISSUE = 'ISSUE',
    RFI = 'RFI',
    CHANGE = 'CHANGE',
}

export enum ActionStatus {
    OPEN = 'OPEN',
    IN_PROGRESS = 'IN_PROGRESS',
    RESOLVED = 'RESOLVED',
    CLOSED = 'CLOSED',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
}

export enum ActionPriority {
    LOW = 'LOW',
    MEDIUM = 'MEDIUM',
    HIGH = 'HIGH',
    CRITICAL = 'CRITICAL',
}

@Entity('action_items')
@Index('idx_action_items_message', ['messageId'])
@Index('idx_action_items_channel', ['channelId'])
@Index('idx_action_items_user', ['userId'])
@Index('idx_action_items_assignee', ['assigneeId'])
export class ActionItem {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'enum', enum: ActionType })
    type: ActionType;

    @Column({ type: 'varchar', length: 255 })
    title: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({
        type: 'enum',
        enum: ActionStatus,
        default: ActionStatus.OPEN,
    })
    status: ActionStatus;

    @Column({
        type: 'enum',
        enum: ActionPriority,
        default: ActionPriority.MEDIUM,
    })
    priority: ActionPriority;

    @Column({ name: 'due_date', type: 'timestamp', nullable: true })
    dueDate: Date | null;

    @Column({ name: 'message_id', type: 'bigint', unsigned: true })
    messageId: number;

    @Column({ name: 'channel_id', type: 'bigint', unsigned: true })
    channelId: number;

    @Column({ name: 'user_id', type: 'bigint', unsigned: true })
    userId: number;

    @Column({ name: 'assignee_id', type: 'bigint', unsigned: true, nullable: true })
    assigneeId: number | null;

    @Column({ type: 'json', nullable: true })
    meta: any;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    // Relations
    @ManyToOne(() => Message, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'message_id' })
    message: Message;

    @ManyToOne(() => Channel, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'channel_id' })
    channel: Channel;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    creator: User;

    @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'assignee_id' })
    assignee: User | null;
}
