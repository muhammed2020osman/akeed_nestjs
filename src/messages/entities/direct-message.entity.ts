import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    Index,
    CreateDateColumn,
    UpdateDateColumn,
    BeforeInsert,
    BeforeUpdate,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Conversation } from './conversation.entity';

@Entity('direct_messages')
@Index('idx_direct_messages_company', ['companyId'])
@Index('from_user_id', ['fromUserId'])
@Index('to_user_id', ['toUserId'])
@Index('idx_direct_messages_conversation', ['conversationId'])
@Index('idx_direct_messages_local_id_user', ['localId', 'fromUserId'], { unique: true })
export class DirectMessage {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'company_id', type: 'int', unsigned: true })
    companyId: number;

    @Column({ name: 'conversation_id', type: 'int', unsigned: true, nullable: true })
    conversationId: number | null;

    @Column({ type: 'text' })
    content: string;

    @Column({ name: 'from_user_id', type: 'int', unsigned: true })
    fromUserId: number;

    @Column({ name: 'to_user_id', type: 'int', unsigned: true })
    toUserId: number;

    @Column({ name: 'local_id', type: 'varchar', length: 36, nullable: true })
    localId: string | null;

    @Column({ name: 'reply_to_id', type: 'int', unsigned: true, nullable: true })
    replyToId: number | null;

    @Column({ name: 'attachment_url', type: 'text', nullable: true })
    attachmentUrl: string | null;

    @Column({ name: 'attachment_type', type: 'varchar', length: 100, nullable: true })
    attachmentType: string | null;

    @Column({ name: 'attachment_name', type: 'varchar', length: 255, nullable: true })
    attachmentName: string | null;

    @Column({ name: 'is_read', type: 'tinyint', width: 1, default: false })
    isRead: boolean;

    @Column({ name: 'is_urgent', type: 'boolean', default: false })
    isUrgent: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
    deletedAt: Date | null;

    // Relations
    @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'conversation_id' })
    conversation: Conversation;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'from_user_id' })
    fromUser: User;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'to_user_id' })
    toUser: User;

    @ManyToOne(() => DirectMessage, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({ name: 'reply_to_id' })
    replyTo: DirectMessage | null;

    @BeforeInsert()
    @BeforeUpdate()
    stripDomainFromUrl() {
        // 1. Clean camelCase property
        if (this.attachmentUrl && this.attachmentUrl.includes('uploads/')) {
            const parts = this.attachmentUrl.split('uploads/');
            this.attachmentUrl = 'uploads/' + parts[parts.length - 1];
        }

        // 2. Clean snake_case property (for spread objects)
        if ((this as any).attachment_url && (this as any).attachment_url.includes('uploads/')) {
            const parts = (this as any).attachment_url.split('uploads/');
            (this as any).attachment_url = 'uploads/' + parts[parts.length - 1];

            if (!this.attachmentUrl) {
                this.attachmentUrl = (this as any).attachment_url;
            }
        }
    }
}
