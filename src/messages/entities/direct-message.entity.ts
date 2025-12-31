import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    Index,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('direct_messages')
@Index('idx_direct_messages_company', ['companyId'])
@Index('from_user_id', ['fromUserId'])
@Index('to_user_id', ['toUserId'])
export class DirectMessage {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'company_id', type: 'bigint', unsigned: true })
    companyId: number;

    @Column({ type: 'text' })
    content: string;

    @Column({ name: 'from_user_id', type: 'bigint', unsigned: true })
    fromUserId: number;

    @Column({ name: 'to_user_id', type: 'bigint', unsigned: true })
    toUserId: number;

    @Column({ name: 'reply_to_id', type: 'bigint', unsigned: true, nullable: true })
    replyToId: number | null;

    @Column({ name: 'attachment_url', type: 'text', nullable: true })
    attachmentUrl: string | null;

    @Column({ name: 'attachment_type', type: 'varchar', length: 100, nullable: true })
    attachmentType: string | null;

    @Column({ name: 'attachment_name', type: 'varchar', length: 255, nullable: true })
    attachmentName: string | null;

    @Column({ name: 'is_read', type: 'tinyint', width: 1, default: false })
    isRead: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
    deletedAt: Date | null;

    // Relations
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
}
