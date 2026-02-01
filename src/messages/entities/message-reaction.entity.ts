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
import { Message } from './message.entity';
import { DirectMessage } from './direct-message.entity';
import { User } from '../../users/entities/user.entity';

@Entity('message_reactions')
@Index('idx_reactions_company', ['companyId'])
@Index('message_id', ['messageId'])
@Index('user_id', ['userId'])
export class MessageReaction {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'company_id', type: 'bigint', unsigned: true })
    companyId: number;

    @Column({ name: 'message_id', type: 'bigint', unsigned: true, nullable: true })
    messageId: number | null;

    @Column({ name: 'direct_message_id', type: 'bigint', unsigned: true, nullable: true })
    directMessageId: number | null;

    @Column({ name: 'user_id', type: 'bigint', unsigned: true })
    userId: number;

    @Column({ name: 'icon', type: 'varchar', length: 10 })
    emoji: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @ManyToOne(() => Message, (message) => message.reactions, { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'message_id' })
    message: Message | null;

    @ManyToOne(() => DirectMessage, (dm) => dm.reactions, { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'direct_message_id' })
    directMessage: DirectMessage | null;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;
}
