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
import { DirectMessage } from './direct-message.entity';

@Entity('conversations')
@Index('idx_conversations_company', ['companyId'])
@Index('idx_conversations_workspace', ['workspaceId'])
@Index(['workspaceId', 'user1Id', 'user2Id'], { unique: true })
export class Conversation {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'company_id', type: 'int', unsigned: true })
    companyId: number;

    @Column({ name: 'workspace_id', type: 'int', unsigned: true })
    workspaceId: number;

    @Column({ name: 'user1_id', type: 'int', unsigned: true })
    user1Id: number;

    @Column({ name: 'user2_id', type: 'int', unsigned: true })
    user2Id: number;

    @Column({ name: 'last_message_id', type: 'int', unsigned: true, nullable: true })
    lastMessageId: number | null;

    @Column({ name: 'last_message_text', type: 'text', nullable: true })
    lastMessageText: string | null;

    @Column({ name: 'last_message_at', type: 'timestamp', nullable: true })
    lastMessageAt: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    // Relations
    @ManyToOne(() => User)
    @JoinColumn({ name: 'user1_id' })
    user1: User;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'user2_id' })
    user2: User;

    @ManyToOne(() => DirectMessage, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'last_message_id' })
    lastMessage: DirectMessage | null;
}
